"""Durable ZeRO-3 training checkpoints, per-rank RNG, and restart witnesses.

Full optimizer tensors stay sharded. Do not gather 430 GB onto rank zero or hash
them a second time on GPUs. Read the PyTorch ZIP metadata using mmap, and check
actual optimizer/master-weight samples again after an independent engine reload.
"""
import gc
import hashlib
import json
import mmap
import os
from pathlib import Path
import random
import time
import types

import numpy as np
import torch


def capture_rng():
    return {'python':random.getstate(),'numpy':np.random.get_state(),
            'torch':torch.get_rng_state(),
            'cuda':torch.cuda.get_rng_state() if torch.cuda.is_available() else None}


def restore_rng(state):
    random.setstate(state['python']);np.random.set_state(state['numpy'])
    torch.set_rng_state(state['torch'])
    if state['cuda'] is not None:torch.cuda.set_rng_state(state['cuda'])


def rng_digest(state):
    digest=hashlib.sha256(repr(state['python']).encode())
    numpy=state['numpy'];digest.update(numpy[0].encode());digest.update(numpy[1].tobytes());digest.update(repr(numpy[2:]).encode())
    digest.update(state['torch'].cpu().numpy().tobytes())
    if state['cuda'] is not None:digest.update(state['cuda'].cpu().numpy().tobytes())
    return digest.hexdigest()


def optimizer_fingerprint(optimizer):
    """Small deterministic witnesses; this is NOT a full payload checksum."""
    digest=hashlib.sha256();tensors=0
    parameters=[p for group in optimizer.param_groups for p in group['params']]
    # ZeRO-3 can clear optimizer param_groups between updates while retaining
    # the FP32 partition parameters as keys in the CPU Adam state dictionary.
    if not parameters:parameters=list(optimizer.state)
    for parameter in parameters:
            state=optimizer.state.get(parameter,{})
            for name,value in [('fp32_master',parameter.detach()),*sorted(state.items())]:
                digest.update(name.encode())
                if torch.is_tensor(value):
                    flat=value.detach().reshape(-1)
                    digest.update(str((tuple(value.shape),str(value.dtype))).encode())
                    if len(flat):
                        indices=torch.tensor(sorted(set([*range(min(4,len(flat))),*range(max(0,len(flat)//2-2),min(len(flat),len(flat)//2+2)),*range(max(0,len(flat)-4),len(flat))])),device=flat.device)
                        digest.update(flat[indices].float().cpu().numpy().tobytes())
                    tensors+=1
                else:digest.update(repr(value).encode())
    return {'sample_sha256':digest.hexdigest(),'sampled_tensors':tensors,'full_payload_checksum':False}


def atomic_json(path,value):
    path=Path(path);temporary=path.with_name(path.name+'.tmp')
    temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    temporary.replace(path)


def _private_mmap_checkpoint_load(_checkpoint_engine,path,map_location=None):
    # MAP_PRIVATE is essential: future optimizer updates must never modify the
    # source checkpoint through a mapped moment/master-weight tensor.
    with torch.serialization.set_default_mmap_options(mmap.MAP_PRIVATE):
        return torch.load(path,map_location=map_location,weights_only=False,mmap=True)


def prepare_low_peak_checkpoint_load(engine):
    """Drop disposable fresh Adam moments, then lazily map saved tensor bytes."""
    checkpoint_engine=engine.checkpoint_engine
    if getattr(checkpoint_engine,'name','TorchCheckpointEngine')!='TorchCheckpointEngine':
        raise TypeError('The low-peak loader requires the standard Torch checkpoint engine')
    optimizer=engine.optimizer.optimizer
    if not hasattr(optimizer,'state'):raise TypeError('Missing inner optimizer state')
    optimizer.state.clear();gc.collect()
    checkpoint_engine.load=types.MethodType(_private_mmap_checkpoint_load,checkpoint_engine)


def latest_committed_checkpoint(root):
    """Ignore partial saves and pointers advanced before a Volume commit."""
    candidates=[]
    for folder in Path(root).glob('step-*'):
        try:
            manifest=json.loads((folder/'COMPLETE.json').read_text())
            ack=json.loads((folder/'VOLUME_COMMITTED.json').read_text())
            if ack['step']!=manifest['client']['step']:continue
            if any(not (folder/name).is_file() or (folder/name).stat().st_size!=size for name,size in manifest['files'].items()):continue
            candidates.append(manifest)
        except (OSError,ValueError,KeyError):continue
    return max(candidates,key=lambda value:value['client']['step']) if candidates else None


def validate_optimizer_file(path,world):
    """Map tensor storage without allocating another full optimizer in RAM."""
    payload=torch.load(path,map_location='cpu',weights_only=False,mmap=True)
    state=payload['optimizer_state_dict']
    if state.get('zero_stage')!=3 or state.get('partition_count')!=world:
        raise ValueError('ZeRO checkpoint partition contract mismatch')
    groups=state['fp32_flat_groups']
    if not groups or any(x.dtype!=torch.float32 or x.numel()==0 for x in groups):
        raise ValueError('Missing FP32 master parameters')
    adam=state['optimizer_state_dict']['state']
    if not adam or any('exp_avg' not in value or 'exp_avg_sq' not in value for value in adam.values()):
        raise ValueError('Missing Adam moments')
    result={'file':Path(path).name,'bytes':Path(path).stat().st_size,
            'fp32_partition_elements':sum(x.numel() for x in groups),'adam_parameter_states':len(adam)}
    del payload,state,groups,adam;gc.collect();return result


def publish_training_state(root,tag,client,ranks):
    root=Path(root);folder=root/tag;world=client['world_size']
    if sorted(x['rank'] for x in ranks)!=list(range(world)):raise ValueError('A rank did not finish saving')
    files={str(path.relative_to(folder)):path.stat().st_size for path in folder.rglob('*') if path.is_file()}
    optimizers=[name for name in files if name.endswith('_optim_states.pt')]
    models=[name for name in files if name.endswith('_model_states.pt')]
    if len(optimizers)!=world or not models or any(not size for size in files.values()):
        raise ValueError('Incomplete ZeRO checkpoint shards')
    if any(f'rng-rank-{rank:02d}.pt' not in files for rank in range(world)):
        raise ValueError('Missing per-rank random states')
    manifest={'tag':tag,'path':str(folder),'client':client,'ranks':ranks,'files':files,
              'optimizer_state_saved':True,'rng_state_saved':True,'data_position_saved':True,
              'all_rank_files_parsed':True,'independent_engine_reload_verified':False}
    atomic_json(folder/'COMPLETE.json',manifest)
    # Never advance the pointer until all ranks and all optimizer files are present.
    atomic_json(root/'LATEST_TRAINING_CHECKPOINT.json',manifest)
    return manifest


def save_training_state(engine,out,plan,micro,metadata,wait_for_commit=True):
    rank=torch.distributed.get_rank();world=torch.distributed.get_world_size()
    step=int(engine.global_steps);tag=f'step-{step:06d}';root=Path(out)/'training_checkpoints';folder=root/tag
    started=time.monotonic();rng=capture_rng()
    client={'step':step,'next_micro_batch':micro,'engine_micro_steps':int(engine.micro_steps),
            'plan_sha256':plan['sha256'],'world_size':world,'source_commit':metadata['source_commit'],
            'model_revision':metadata['model_revision'],'codec_frozen':True,'next_action':'train',
            'warm_start_optimizer_reset_once':metadata.get('warm_start_optimizer_reset_once',False)}
    if metadata.get('training_code_sha256'):client['training_code_sha256']=metadata['training_code_sha256']
    if rank==0 and folder.exists():
        if (folder/'COMPLETE.json').exists() and (folder/'VOLUME_COMMITTED.json').exists():
            raise FileExistsError('Never overwrite a committed training checkpoint')
        incomplete=root/'_incomplete';incomplete.mkdir(exist_ok=True)
        folder.rename(incomplete/(tag+'-'+str(time.time_ns())))
    torch.distributed.barrier()
    engine.save_checkpoint(str(root),tag=tag,client_state=client,save_latest=False)
    torch.save(rng,folder/f'rng-rank-{rank:02d}.pt')
    candidates=[p for p in folder.glob('*_optim_states.pt') if f'zero_pp_rank_{rank}_' in p.name]
    if len(candidates)!=1:raise ValueError('Cannot identify this rank optimizer shard')
    with candidates[0].open('rb') as file:os.fsync(file.fileno())
    parsed=validate_optimizer_file(candidates[0],world)
    witness={'rank':rank,'optimizer':parsed,'rng_sha256':rng_digest(rng),
             'optimizer_samples':optimizer_fingerprint(engine.optimizer.optimizer)}
    if witness['optimizer_samples']['sampled_tensors']<3:raise ValueError('Adam/master-weight witnesses were empty')
    atomic_json(folder/f'rank-{rank:02d}.json',witness)
    ranks=[None]*world;torch.distributed.all_gather_object(ranks,witness)
    if rank==0:
        manifest=publish_training_state(root,tag,client,ranks)
        manifest['save_seconds']=time.monotonic()-started
        atomic_json(folder/'COMPLETE.json',manifest);atomic_json(root/'LATEST_TRAINING_CHECKPOINT.json',manifest)
        print('AB_RESUME_CHECKPOINT',json.dumps(manifest),flush=True)
        if wait_for_commit:
            # A full 35.9B Adam checkpoint uploads hundreds of GiB. The cloud
            # parent's resource deadline bounds the run; a three-minute local
            # timeout can kill an otherwise valid worker during that upload.
            ack=folder/'VOLUME_COMMITTED.json';deadline=time.monotonic()+3600
            while not ack.exists():
                if time.monotonic()>deadline:raise TimeoutError('Training checkpoint Volume commit was not acknowledged')
                time.sleep(.5)
    torch.distributed.barrier();restore_rng(rng)
    return folder


def restore_training_state(engine,folder,plan):
    folder=Path(folder);manifest=json.loads((folder/'COMPLETE.json').read_text())
    if not (folder/'VOLUME_COMMITTED.json').is_file():raise ValueError('Checkpoint was not durably committed')
    client=manifest['client'];rank=torch.distributed.get_rank();world=torch.distributed.get_world_size()
    if client['plan_sha256']!=plan['sha256'] or client['world_size']!=world:
        raise ValueError('Refuse changed training plan or GPU partition count')
    for name,size in manifest['files'].items():
        if not (folder/name).is_file() or (folder/name).stat().st_size!=size:raise ValueError('Missing or truncated checkpoint shard')
    prepare_low_peak_checkpoint_load(engine)
    loaded,actual=engine.load_checkpoint(str(folder.parent),tag=manifest['tag'],load_module_strict=True,
        load_optimizer_states=True,load_lr_scheduler_states=True,load_module_only=False)
    if not loaded or actual['next_micro_batch']!=client['next_micro_batch'] or int(engine.global_steps)!=client['step']:
        raise ValueError('DeepSpeed did not restore the saved training position')
    engine.micro_steps=client['engine_micro_steps']
    witness=next(x for x in manifest['ranks'] if x['rank']==rank)
    if optimizer_fingerprint(engine.optimizer.optimizer)!=witness['optimizer_samples']:
        raise ValueError('Restored Adam moments/master-weight witnesses do not match')
    rng=torch.load(folder/f'rng-rank-{rank:02d}.pt',map_location='cpu',weights_only=False)
    restore_rng(rng)
    if rng_digest(capture_rng())!=witness['rng_sha256']:raise ValueError('Random state restore mismatch')
    proof={'rank':rank,'step':client['step'],'next_micro_batch':client['next_micro_batch'],
           'optimizer_samples_match':True,'random_state_match':True,'pristine_engine_reload':True}
    proofs=[None]*world;torch.distributed.all_gather_object(proofs,proof)
    if rank==0:atomic_json(folder/'ENGINE_RELOAD_VERIFIED.json',{'ranks':proofs,'verified':True})
    torch.distributed.barrier();restore_rng(rng)
    return client
