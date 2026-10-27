"""CPU-only, full-size Volume staging proof before any more GPU training."""
import json
from pathlib import Path
import modal

app=modal.App('miro-drama3-stage20-storage-preflight')
voices=modal.Volume.from_name('miro-voices')
image=modal.Image.debian_slim(python_version='3.11')
SOURCE='/voices/_drama3/fullsize-ko-007-20261024-budget44-resumable-v2/arms/korean_teacher/training_checkpoints/step-000005/bf16_zero_pp_rank_5_mp_rank_00_optim_states.pt'
PROBE='/voices/_storage_probe/drama3-stage20-20261024'


@app.function(image=image,cpu=(4,4),memory=(106496,131072),ephemeral_disk=2097152,
              timeout=1800,retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def probe():
    import os,shutil,time
    started=time.monotonic();voices.reload();source=Path(SOURCE);root=Path(PROBE)
    size=source.stat().st_size
    if size!=53852619245:raise ValueError('Unexpected preserved source size')
    disk=shutil.disk_usage('/');required=size*8*2+128*1024**3
    if disk.free<required:raise RuntimeError(f'Insufficient actual root disk: {disk.free} < {required}')
    if root.exists():raise FileExistsError('Probe is single-use; inspect previous files before any retry')
    root.mkdir(parents=True)
    print('STORAGE_PREFLIGHT_STARTED',json.dumps({'bytes_to_write':size*8,'root_free_bytes':disk.free,'gpu':False}),flush=True)
    outputs=[];copied=0;last=started
    try:
        outputs=[(root/f'probe-{i:02d}.bin').open('wb',buffering=0) for i in range(8)]
        with source.open('rb',buffering=0) as stream:
            while True:
                block=bytearray(stream.read(8*1024**2))
                if not block:break
                original=block[0]
                for i,f in enumerate(outputs):
                    # Distinct bytes in every block prevent a same-content copy
                    # from evading the intended full-size staging workload.
                    block[0]=original^(i+1);written=f.write(block)
                    if written!=len(block):raise IOError('Short probe write')
                copied+=len(block)*8
                if time.monotonic()-last>20:
                    print('STORAGE_PREFLIGHT_BYTES',copied,flush=True);last=time.monotonic()
        for f in outputs:os.fsync(f.fileno());f.close()
        outputs=[];write_seconds=time.monotonic()-started
        commit_started=time.monotonic();voices.commit();commit_seconds=time.monotonic()-commit_started
        files={p.name:p.stat().st_size for p in root.glob('probe-*.bin')}
        if len(files)!=8 or any(n!=size for n in files.values()):raise ValueError('Incomplete storage proof')
        result={'verified_commit_returned':True,'gpu_allocated':False,'files':files,'bytes':sum(files.values()),
                'write_seconds':write_seconds,'commit_seconds':commit_seconds,'seconds':time.monotonic()-started,
                'root_free_bytes_before':disk.free,'root_required_bytes':required,'probe_root':PROBE,
                'requested_ephemeral_disk_mib':2097152,'same_gpu_worker_proven':False,
                'proves_storage_staging_not_model_quality_or_engine_reload':True}
        (root/'RESULT.json').write_text(json.dumps(result,indent=2));voices.commit()
        print('STORAGE_PREFLIGHT_COMPLETE',json.dumps(result),flush=True)
        return result
    finally:
        for f in outputs:f.close()


@app.local_entrypoint()
def main(folder:str):
    out=Path(folder);marker=out/'STORAGE_PREFLIGHT_STARTED.json'
    with marker.open('x') as f:f.write(json.dumps({'automatic_retry':False,'max_resource_cost_usd':.61}))
    result=probe.remote()
    (out/'storage_preflight.json').write_text(json.dumps(result,indent=2))
