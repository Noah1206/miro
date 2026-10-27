"""Stream native inference weights from live ZeRO partitions; omit optimizer and teacher."""
import json,shutil,hashlib,time
from pathlib import Path
import torch
from safetensors.torch import save
from .core import export_name,SOURCE_REV,MODEL_REV


def verify_native_files(destination):
    """Read each byte independently and validate the safetensors index before native reload."""
    from safetensors import safe_open
    import math
    destination=Path(destination)
    complete=json.loads((destination/'EXPORT_COMPLETE.json').read_text())
    index=json.loads((destination/'model.safetensors.index.json').read_text())
    checksums=json.loads((destination/'SHA256SUMS.json').read_text())
    if set(checksums)!=set(index['weight_map'].values()):raise ValueError('Checksum manifest/index mismatch')
    seen={};total=0
    for name,expected in checksums.items():
        if Path(name).name!=name:raise ValueError('Unsafe shard path')
        digest=hashlib.sha256()
        with (destination/name).open('rb') as source:
            for block in iter(lambda:source.read(8*1024*1024),b''):digest.update(block)
        if digest.hexdigest()!=expected:raise ValueError('Saved shard checksum mismatch: '+name)
        with safe_open(str(destination/name),framework='pt',device='cpu') as shard:
            for key in shard.keys():
                if key in seen or index['weight_map'].get(key)!=name:raise ValueError('Invalid tensor mapping')
                tensor=shard.get_slice(key)
                if tensor.get_dtype()!='BF16':raise ValueError('Native weights must be BF16')
                total+=math.prod(tensor.get_shape())*2;seen[key]=name
    if seen!=index['weight_map'] or total!=complete['bytes'] or total!=index['metadata']['total_size']:raise ValueError('Incomplete native tensor payload')
    return {'sha256_verified_shards':len(checksums),'verified_tensors':len(seen),'verified_parameter_bytes':total}


def export_live(model,original,destination,metadata,max_bytes=2_000_000_000):
    import deepspeed
    started=time.monotonic()
    rank=torch.distributed.get_rank();destination=Path(destination);original=Path(original)
    if rank==0:
        if destination.exists():raise FileExistsError('Never overwrite inference weights')
        destination.parent.mkdir(parents=True,exist_ok=True)
        expected=sum(getattr(p,'ds_numel',p.numel())*2 for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.'))
        # Modal Volume reports synthetic disk capacity; only local filesystems can use this check.
        if not str(destination).startswith('/voices/') and shutil.disk_usage(destination.parent).free<expected*1.15:raise OSError('Insufficient disk for native BF16 weights')
        destination.mkdir()
    torch.distributed.barrier();pending={};size=0;part=0;mapping={};written=0;checksums={}
    def flush():
        nonlocal pending,size,part
        if not pending:return
        part+=1;name=f'model-{part:05d}.safetensors'
        # Serialize at most one ~2 GB shard in RAM, hash those exact bytes, and
        # write once. Avoid a second 67 GiB Volume read while eight GPUs idle.
        payload=save(pending);checksums[name]=hashlib.sha256(payload).hexdigest()
        with (destination/name).open('wb') as target:
            if target.write(payload)!=len(payload):raise OSError('Short native weight write')
        if (destination/name).stat().st_size!=len(payload):raise OSError('Truncated native weight shard')
        del payload
        mapping.update({key:name for key in pending});pending={};size=0
    for index,(name,p) in enumerate(model.named_parameters()):
        if name.startswith('korean_teacher_head.'):continue
        with deepspeed.zero.GatheredParameters([p],modifier_rank=0):
            if rank==0:
                value=p.detach().to(device='cpu',dtype=torch.bfloat16).contiguous();count=value.numel()*2
                if pending and size+count>max_bytes:flush()
                pending[export_name(name)]=value;size+=count;written+=count
        if rank==0 and index%100==0:print('NATIVE_EXPORT',index,name,flush=True)
    if rank==0:
        flush();(destination/'model.safetensors.index.json').write_text(json.dumps({'metadata':{'total_size':written},'weight_map':mapping},indent=2))
        config=json.loads((original/'config.json').read_text());config.pop('quantization_config',None)
        config['torch_dtype']='bfloat16';config['fp8_experts']=False
        (destination/'config.json').write_text(json.dumps(config,indent=2))
        for name in ['tokenizer.json','tokenizer_config.json','special_tokens_map.json','chat_template.jinja','codec.pth','LICENSE']:
            if (original/name).exists():shutil.copy2(original/name,destination/name)
        (destination/'codec_contract.json').write_text(json.dumps(metadata['codec_contract'],indent=2))
        (destination/'MIRO_TRAINING.json').write_text(json.dumps({**metadata,'source_commit':SOURCE_REV,'model_revision':MODEL_REV,
            'parameter_bytes':written,'native_parameter_tensors':len(mapping),'training_only_teacher_head_exported':False,
            'optimizer_exported':False,'production_approved':False},ensure_ascii=False,indent=2))
        (destination/'SHA256SUMS.json').write_text(json.dumps(checksums,indent=2))
        (destination/'EXPORT_COMPLETE.json').write_text(json.dumps({'bytes':written,'tensors':len(mapping),'shards':part,'teacher_required_at_inference':False,'export_seconds':time.monotonic()-started,'checksums_file':'SHA256SUMS.json'},indent=2))
    torch.distributed.barrier()
    return {'bytes':written,'tensors':len(mapping),'shards':part} if rank==0 else None
