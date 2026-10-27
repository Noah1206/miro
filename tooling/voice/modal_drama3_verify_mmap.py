"""Verify the already committed full checkpoint on a fresh VM; never train."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,voices

image=(base_image.env({'DS_BUILD_OPS':'0'}).pip_install('deepspeed==0.19.8','ninja')
       .add_local_python_source('drama3_fullft','modal_drama3_compare'))
app=modal.App('miro-drama3-stage20-mmap-resume-verification')
ROOT='/voices/_drama3/fullsize-ko-007-20261024-stage20-v3'
ASSETS='/voices/_drama3/fullsize-ko-007-20261024-budget44-v1/arms/korean_teacher/snapshots/step-000001'


@app.function(image=image,gpu='H100:8',cpu=(16,16),memory=(655360,917504),ephemeral_disk=2097152,
              timeout=360,retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def verify():
    import hashlib,os,signal,subprocess,time
    import drama3_fullft
    voices.reload();root=Path(ROOT);arm=root/'arms/korean_teacher';out=root/'verification_mmap';out.mkdir(exist_ok=True)
    if (out/'STARTED.json').exists():raise FileExistsError('Verification is single-use; no automatic retry')
    checkpoint=arm/'training_checkpoints/step-000005'
    manifest=json.loads((checkpoint/'COMPLETE.json').read_text())
    if not (checkpoint/'VOLUME_COMMITTED.json').is_file():raise ValueError('Missing durable checkpoint')
    if any((checkpoint/name).stat().st_size!=size for name,size in manifest['files'].items()):raise ValueError('Missing shard')
    hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in Path(next(iter(drama3_fullft.__path__))).glob('*.py')}
    (out/'SOURCE_HASHES.json').write_text(json.dumps(hashes,indent=2))
    (out/'STARTED.json').write_text(json.dumps({'training_updates_executed':0,'checkpoint':str(checkpoint),
        'same_weights_optimizer_rng_and_data':True,'loader':'MAP_PRIVATE mmap; discard fresh Adam moments before restore'}))
    voices.commit();started=time.monotonic()
    command=['torchrun','--standalone','--nproc_per_node=8','--module','drama3_fullft.resumable_fullsize',
        '--root','/voices/_drama3/korean-teacher-007-20261023','--original',ASSETS,'--output',str(arm),
        '--target-step','25','--resume-checkpoint',str(checkpoint),'--verify-resume-only','--checkpoint-policy','budget']
    process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True,
        env=dict(os.environ,OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',TOKENIZERS_PARALLELISM='false'))
    try:
        with (out/'torchrun.log').open('w') as log:
            for line in process.stdout:
                log.write(line);log.flush();print(line,end='',flush=True)
                if line.startswith('AB_EXACT_RESUME_VERIFIED '):voices.commit()
            code=process.wait(timeout=10)
        if code:raise RuntimeError('Full-state verification stopped: '+str(code))
        proof=json.loads((checkpoint/'ENGINE_RELOAD_VERIFIED.json').read_text())
        if not proof['verified'] or len(proof['ranks'])!=8:raise ValueError('Incomplete all-rank restore proof')
        if any(not x['optimizer_samples_match'] or not x['random_state_match'] or x['next_micro_batch']!=10 for x in proof['ranks']):
            raise ValueError('State did not match')
        validation=[json.loads(s) for s in (arm/'validation.jsonl').read_text().splitlines()]
        last=next(x for x in reversed(validation) if x['step']==5)
        result={'verified':True,'step':5,'next_update':6,'next_micro_batch':10,'training_updates_executed':0,
            'all_rank_proof':proof,'validation':last,'seconds':time.monotonic()-started,
            'no_precision_or_optimizer_value_conversion':True,'checkpoint_weights_modified':False,
            'full_payload_checksum':False,'loader':'private mmap with fresh Adam-state release'}
        (out/'RESULT.json').write_text(json.dumps(result,indent=2));voices.commit();return result
    finally:
        if process.poll() is None:os.killpg(process.pid,signal.SIGKILL)
        voices.commit()


@app.local_entrypoint()
def main(folder:str):
    import subprocess
    out=Path(folder);authorization=json.loads((out/'authorization.json').read_text())
    bill=json.loads(subprocess.check_output(['/Users/johyeon-ung/GPT-SoVITS/venv/bin/modal','billing','summary','--json'],text=True))
    maximum=360*(8*3.95+16*.0473+896*.008)/3600+.75
    if float(bill['billed_cost'])+maximum>authorization['workspace_net_spend_limit_ui_verified_usd']:
        raise ValueError('Remaining20dollar stage budget does not cover bounded verification; no GPU allocated')
    with (out/'MMAP_VERIFICATION_DISPATCHED.json').open('x') as f:
        f.write(json.dumps({'billed_before':bill,'maximum_new_resource_and_startup_usd':maximum,'purpose':'verify saved step5 only; no training retry'}))
    result=verify.remote();(out/'mmap_verification_result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print('MMAP_FULL_STATE_VERIFIED',json.dumps({'step':result['step'],'next_update':result['next_update'],'seconds':result['seconds']}),flush=True)
