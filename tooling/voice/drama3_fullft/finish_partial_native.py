"""Finish durable native shards from a capped CPU conversion, without overwriting them."""
from pathlib import Path
import hashlib,json,math,mmap,shutil,time
import torch
from safetensors import safe_open
from safetensors.torch import save
from .checkpoint_preview import native_shapes
from .core import export_name,SOURCE_REV,MODEL_REV

def inspect_partial(folder,shapes):
    folder=Path(folder);mapping={};checksums={};total=0;quarantined=[]
    for path in sorted(folder.glob('model-*.safetensors')):
        try:
            with safe_open(str(path),framework='pt',device='cpu') as shard:
                entries={}
                for key in shard.keys():
                    view=shard.get_slice(key)
                    if key not in shapes or tuple(view.get_shape())!=shapes[key] or view.get_dtype()!='BF16':
                        raise ValueError('Unexpected tensor in a saved partial native export')
                    if key in mapping:raise ValueError('Duplicate saved partial tensor')
                    entries[key]=path.name
        except Exception as error:
            # A provider timeout can interrupt the final file write. Preserve
            # its bytes as evidence; only complete shards are eligible for reuse.
            if isinstance(error,ValueError):raise
            dest=folder/'_incomplete';dest.mkdir(exist_ok=True)
            path.rename(dest/(path.name+'.'+str(time.time_ns())))
            quarantined.append(path.name);continue
        h=hashlib.sha256()
        with path.open('rb') as f:
            for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
        checksums[path.name]=h.hexdigest();mapping.update(entries)
        total+=sum(math.prod(shapes[k])*2 for k in entries)
    return mapping,checksums,total,quarantined

def finish(checkpoint,assets,destination,expected_step):
    from deepspeed.utils.zero_to_fp32 import get_fp32_state_dict_from_zero_checkpoint
    from .live_export import verify_native_files
    checkpoint,assets,destination=map(Path,(checkpoint,assets,destination))
    complete=json.loads((checkpoint/'COMPLETE.json').read_text())
    if complete['client']['step']!=expected_step or not (checkpoint/'VOLUME_COMMITTED.json').exists():raise ValueError('Wrong source checkpoint')
    for name,size in complete['files'].items():
        if (checkpoint/name).stat().st_size!=size:raise ValueError('Truncated source checkpoint')
    expected=native_shapes(assets);mapping,checksums,written,quarantined=inspect_partial(destination,expected)
    retained=len(checksums);started=time.monotonic();pending={};pending_size=0
    part=max([int(Path(x).stem.split('-')[1]) for x in checksums]+[0])
    def flush():
        nonlocal pending,pending_size,part
        if not pending:return
        part+=1;name=f'model-{part:05d}.safetensors';payload=save(pending)
        with (destination/name).open('xb') as f:
            if f.write(payload)!=len(payload):raise OSError('Short remaining-shard write')
        checksums[name]=hashlib.sha256(payload).hexdigest();mapping.update({key:name for key in pending})
        pending={};pending_size=0;print('NATIVE_REMAINING_SHARD',name,flush=True)
    if set(mapping)!=set(expected):
        with torch.serialization.set_default_mmap_options(mmap.MAP_PRIVATE):
            state=get_fp32_state_dict_from_zero_checkpoint(str(checkpoint.parent),tag=checkpoint.name,lazy_mode=True)
            for key,lazy in state.items():
                if key.startswith('korean_teacher_head.'):continue
                name=export_name(key)
                if expected.get(name)!=tuple(lazy.shape):raise ValueError('Remaining tensor shape mismatch')
                if name in mapping:continue
                size=math.prod(lazy.shape)*2
                if pending and pending_size+size>2_000_000_000:flush()
                value=lazy.contiguous().to(dtype=torch.bfloat16,device='cpu').contiguous()
                if not torch.isfinite(value).all():raise ValueError('Nonfinite remaining native weight')
                pending[name]=value;pending_size+=size;written+=size
            flush()
        del state
    if set(mapping)!=set(expected) or written!=35899643008*2:raise ValueError('Native export still incomplete')
    (destination/'model.safetensors.index.json').write_text(json.dumps({'metadata':{'total_size':written},'weight_map':mapping},indent=2))
    (destination/'SHA256SUMS.json').write_text(json.dumps(checksums,indent=2))
    cfg=json.loads((assets/'config.json').read_text());cfg.pop('quantization_config',None);cfg.update(torch_dtype='bfloat16',fp8_experts=False)
    (destination/'config.json').write_text(json.dumps(cfg,indent=2))
    for name in ['tokenizer.json','tokenizer_config.json','special_tokens_map.json','chat_template.jinja','codec.pth','LICENSE','codec_contract.json']:
        if (assets/name).exists():shutil.copy2(assets/name,destination/name)
    metadata=json.loads((assets/'MIRO_TRAINING.json').read_text())
    metadata.update(steps_completed=expected_step,checkpoint=str(checkpoint),inference_export_only=True,
        source_commit=SOURCE_REV,model_revision=MODEL_REV,parameter_bytes=written,teacher_required_at_inference=False,
        training_only_teacher_head_exported=False,optimizer_exported=False,independent_engine_reload_verified=False,
        partial_native_shards_retained=retained,production_approved=False,additional_training_updates=0)
    (destination/'MIRO_TRAINING.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
    result={'bytes':written,'tensors':len(mapping),'shards':len(checksums),'checksums_file':'SHA256SUMS.json',
        'retained_complete_shards':retained,'quarantined_partial_shards':quarantined,'step':expected_step,'training_updates_executed':0}
    (destination/'EXPORT_COMPLETE.json').write_text(json.dumps(result,indent=2))
    proof=verify_native_files(destination);proof['checksums_file_sha256']=hashlib.sha256((destination/'SHA256SUMS.json').read_bytes()).hexdigest()
    proof['payload_verified_on_cpu']=True
    (destination/'CPU_NATIVE_VERIFICATION.json').write_text(json.dumps(proof,indent=2))
    result.update(proof=proof,seconds_finish_operation=time.monotonic()-started);return result
