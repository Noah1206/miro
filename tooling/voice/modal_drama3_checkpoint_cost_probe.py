"""Bounded CPU-only samples of existing checkpoint bytes; never changes weights."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image, voices

image=(base_image.env({'DS_BUILD_OPS':'0'}).pip_install('deepspeed==0.19.8','ninja')
       .pip_install('zstandard==0.25.0').add_local_python_source('drama3_fullft','modal_drama3_compare'))
app=modal.App('miro-checkpoint-lossless-cost-probe')
CHECKPOINT='/voices/_drama3/fullsize-ko-007-20261024-stage20-v3/arms/korean_teacher/training_checkpoints/step-000005'


@app.function(image=image,cpu=(4,4),memory=(16384,16384),timeout=100,retries=0,
              max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def probe():
    import time,torch,zstandard as zstd
    voices.reload();rows=[];started=time.monotonic();torch.set_num_threads(1)
    for rank in [0,4]:
        file=Path(CHECKPOINT)/f'bf16_zero_pp_rank_{rank}_mp_rank_00_optim_states.pt'
        state=torch.load(file,weights_only=False,mmap=True,map_location='cpu')['optimizer_state_dict']
        tensors=[('master',x) for x in state['fp32_flat_groups']]
        for x in state['optimizer_state_dict']['state'].values():
            tensors.extend((k,x[k]) for k in ['exp_avg','exp_avg_sq'])
        for name,tensor in tensors:
            raw=tensor.reshape(-1).view(torch.uint8);count=min(4*1024**2,len(raw))
            starts=sorted(set([0,max(0,len(raw)//2-count//2),max(0,len(raw)-count)]))
            parts=[]
            for offset in starts:
                data=raw[offset:offset+count].numpy().tobytes()
                before=time.monotonic();compressed=zstd.ZstdCompressor(level=1,write_checksum=True).compress(data)
                elapsed=time.monotonic()-before
                assert zstd.ZstdDecompressor().decompress(compressed)==data
                parts.append({'raw':len(data),'compressed':len(compressed),'compression_seconds':elapsed})
            rows.append({'rank':rank,'kind':name,'tensor_bytes':tensor.numel()*tensor.element_size(),'samples':parts})
        del state,tensors
    result={'rows':rows,'seconds':time.monotonic()-started,'sample_only_not_full_size_throughput_proof':True,
            'training_updates':0,'source_modified':False}
    print('LOSSLESS_COST_SAMPLE',json.dumps({'seconds':result['seconds'],'samples':len(rows)}),flush=True)
    return result


@app.local_entrypoint()
def main(folder:str):
    out=Path(folder);out.mkdir(exist_ok=True)
    with (out/'CPU_COMPRESSION_PROBE_DISPATCHED.json').open('x') as f:json.dump({'training':False,'maximum_resource_cost_usd':.03,'no_automatic_retry':True},f)
    result=probe.remote();(out/'compression_samples.json').write_text(json.dumps(result,indent=2))
    for kind in ['master','exp_avg','exp_avg_sq']:
        selected=[r for r in result['rows'] if r['kind']==kind]
        ratio=sum(sum(s['compressed'] for s in r['samples']) for r in selected)/sum(sum(s['raw'] for s in r['samples']) for r in selected)
        print('SAMPLE_RATIO',kind,ratio,flush=True)
