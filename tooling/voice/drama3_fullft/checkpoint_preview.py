"""CPU-only, streaming native export from a complete ZeRO checkpoint; never trains."""
import hashlib
import json
import math
from pathlib import Path
import shutil
import time

import torch
from safetensors import safe_open
from safetensors.torch import save

from .core import export_name, SOURCE_REV, MODEL_REV
from .codec_contract import file_sha256, read_contract


def native_shapes(folder):
    folder = Path(folder)
    index = json.loads((folder / 'model.safetensors.index.json').read_text())
    shapes = {}
    for filename in set(index['weight_map'].values()):
        with safe_open(str(folder / filename), framework='pt', device='cpu') as shard:
            for name in shard.keys():
                if index['weight_map'].get(name) != filename or name in shapes:
                    raise ValueError('Invalid source native index')
                shapes[name] = tuple(shard.get_slice(name).get_shape())
    if set(shapes) != set(index['weight_map']):
        raise ValueError('Incomplete source native model')
    return shapes


def stream_state(state, destination, expected_shapes, max_bytes=2_000_000_000):
    """Only one parameter and one output shard are materialized at a time."""
    destination = Path(destination)
    pending, mapping, checksums = {}, {}, {}
    shard_bytes = total = 0

    def flush():
        nonlocal pending, shard_bytes
        if not pending:
            return
        name = f'model-{len(checksums)+1:05d}.safetensors'
        payload = save(pending)
        checksums[name] = hashlib.sha256(payload).hexdigest()
        with (destination / name).open('xb') as handle:
            if handle.write(payload) != len(payload):
                raise OSError('Short native shard write')
        if (destination / name).stat().st_size != len(payload):
            raise OSError('Truncated native shard')
        mapping.update({key: name for key in pending})
        pending, shard_bytes = {}, 0
        print('PREVIEW_EXPORT_SHARD', name, len(payload), flush=True)

    exported = set()
    for name, lazy in state.items():
        if name.startswith('korean_teacher_head.'):
            continue
        if not name.startswith(('backbone.', 'audio_decoder.')):
            raise ValueError('Unexpected checkpoint tensor: ' + name)
        native = export_name(name)
        if native in exported or expected_shapes.get(native) != tuple(lazy.shape):
            raise ValueError('Checkpoint/native tensor shape mismatch: ' + name)
        count = math.prod(lazy.shape) * 2
        if pending and shard_bytes + count > max_bytes:
            flush()
        value = lazy.contiguous().to(dtype=torch.bfloat16, device='cpu').contiguous()
        if not torch.isfinite(value).all():
            raise ValueError('Nonfinite trained weights: ' + name)
        pending[native] = value
        exported.add(native)
        shard_bytes += count
        total += count
    flush()
    if exported != set(expected_shapes):
        raise ValueError('Missing native model tensors')
    (destination / 'model.safetensors.index.json').write_text(json.dumps(
        {'metadata': {'total_size': total}, 'weight_map': mapping}, indent=2))
    (destination / 'SHA256SUMS.json').write_text(json.dumps(checksums, indent=2))
    return {'bytes': total, 'tensors': len(mapping), 'shards': len(checksums)}


def export_checkpoint(checkpoint, assets, destination, expected_step=5, require_independent_reload=True):
    started = time.monotonic()
    checkpoint, assets, destination = map(Path, (checkpoint, assets, destination))
    complete = json.loads((checkpoint / 'COMPLETE.json').read_text())
    client = complete['client']
    if client['step'] != expected_step or client['world_size'] != 8:
        raise ValueError('Unexpected checkpoint step or world size')
    if complete['tag'] != f'step-{expected_step:06d}':
        raise ValueError('Checkpoint tag/step mismatch')
    expected_files = {f'bf16_zero_pp_rank_{r}_mp_rank_00_optim_states.pt' for r in range(8)}
    expected_files |= {f'zero_pp_rank_{r}_mp_rank_00_model_states.pt' for r in range(8)}
    expected_files |= {f'rank-{r:02d}.json' for r in range(8)}
    expected_files |= {f'rng-rank-{r:02d}.pt' for r in range(8)}
    if set(complete['files']) != expected_files or {r['rank'] for r in complete['ranks']} != set(range(8)):
        raise ValueError('Missing checkpoint rank files')
    if client['source_commit'] != SOURCE_REV or client['model_revision'] != MODEL_REV:
        raise ValueError('Unexpected model/source revision')
    proof_path = checkpoint / 'ENGINE_RELOAD_VERIFIED.json'
    proof = json.loads(proof_path.read_text()) if proof_path.is_file() else {}
    reload_verified = bool(proof.get('verified') and len(proof.get('ranks', [])) == 8)
    if require_independent_reload and not reload_verified:
        raise ValueError('The complete checkpoint has not passed independent reload')
    commit = json.loads((checkpoint / 'VOLUME_COMMITTED.json').read_text())
    if commit.get('step') != expected_step:
        raise ValueError('Checkpoint commit step mismatch')
    if not (checkpoint / 'VOLUME_COMMITTED.json').is_file():
        raise ValueError('Checkpoint commit proof missing')
    for filename, size in complete['files'].items():
        if (checkpoint / filename).stat().st_size != size:
            raise ValueError('Incomplete training checkpoint: ' + filename)
    if destination.exists():
        raise FileExistsError('Never overwrite an existing model or retry automatically')
    contract = read_contract(assets / 'codec_contract.json')
    if contract['codec_file_sha256'] != file_sha256(assets / 'codec.pth'):
        raise ValueError('The serving codec differs from training')
    shapes = native_shapes(assets)
    if len(shapes) != 885 or sum(math.prod(s) for s in shapes.values()) != 35899643008:
        raise ValueError('Expected the actual full-size model, not a reduced export')
    destination.mkdir(parents=True)
    from deepspeed.utils.zero_to_fp32 import get_fp32_state_dict_from_zero_checkpoint
    # DeepSpeed0.19.8 mmap-loads all partitions and drops Adam states; lazy_mode
    # keeps master weights on disk until each individual parameter is gathered.
    with torch.serialization.set_default_mmap_options(__import__('mmap').MAP_PRIVATE):
        state = get_fp32_state_dict_from_zero_checkpoint(
            str(checkpoint.parent), tag=checkpoint.name, lazy_mode=True)
        result = stream_state(state, destination, shapes)
    del state
    config = json.loads((assets / 'config.json').read_text())
    config.pop('quantization_config', None)
    config.update(torch_dtype='bfloat16', fp8_experts=False)
    (destination / 'config.json').write_text(json.dumps(config, indent=2))
    for name in ['tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json',
                 'chat_template.jinja', 'codec.pth', 'LICENSE', 'codec_contract.json']:
        if (assets / name).exists():
            shutil.copy2(assets / name, destination / name)
    old_metadata = json.loads((assets / 'MIRO_TRAINING.json').read_text())
    metadata = {**old_metadata, 'steps_completed': expected_step, 'independent_engine_reload_verified': reload_verified, 'steps_planned': 25,
        'checkpoint': str(checkpoint), 'source_commit': SOURCE_REV,
        'model_revision': MODEL_REV, 'parameter_bytes': result['bytes'],
        'native_parameter_tensors': result['tensors'], 'inference_export_only': True,
        'additional_training_updates': 0, 'teacher_required_at_inference': False,
        'training_only_teacher_head_exported': False, 'optimizer_exported': False,
        'configuration_assets_only_from_step1': True, 'tts_weights_from_step1': False,
        'production_approved': False, 'quality_improvement_confirmed': False}
    (destination / 'MIRO_TRAINING.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
    result.update(step=expected_step, independent_engine_reload_verified=reload_verified, checkpoint=str(checkpoint), export_seconds=time.monotonic()-started,
        checksums_file='SHA256SUMS.json', teacher_required_at_inference=False,
        training_updates_executed=0, hashes_computed_on_serialized_bytes=True)
    (destination / 'EXPORT_COMPLETE.json').write_text(json.dumps(result, indent=2))
    # Check each safetensors header/index/shape without re-reading67GiB of payload.
    if native_shapes(destination) != shapes:
        raise ValueError('Written native shapes differ from the serving model')
    return result
