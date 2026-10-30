"""One budgeted full-state continuation, one durable save, then immediate GPU exit."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,voices

image=(base_image.env({'DS_BUILD_OPS':'0'}).pip_install('deepspeed==0.19.8','ninja')
       .add_local_python_source('drama3_fullft','modal_drama3_compare'))
app=modal.App('miro-drama3-continuous-exact-resume')
SOURCE='/voices/_drama3/fullsize-ko-007-20261024-stage20-v3/arms/korean_teacher'
CHECKPOINT=SOURCE+'/training_checkpoints/step-000005'
ASSETS='/voices/_drama3/fullsize-ko-007-20261024-budget44-v1/arms/korean_teacher/snapshots/step-000001'
ROOT='/voices/_drama3/fullsize-ko-007-20261024-continuous-v4'


@app.function(image=image,gpu='H100:8',cpu=(16,16),memory=(655360,917504),ephemeral_disk=2097152,
              timeout=2380,retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def continue_training(authorization):
    import hashlib,os,signal,subprocess,time,shutil
    import drama3_fullft
    from drama3_fullft.continuous_budget import admit
    from drama3_fullft.training_state import atomic_json,latest_committed_checkpoint
    decision=admit(authorization['net_billed_at_dispatch'],30,authorization['additional_total_cash_ceiling_usd'])
    if not decision['admitted']:raise ValueError('Do not spend the remaining balance on an incomplete short run')
    voices.reload();root=Path(ROOT)
    if root.exists():raise FileExistsError('No automatic rerun or overwrite')
    root.mkdir();out=root/'arms/korean_teacher';out.mkdir(parents=True)
    source=Path(SOURCE);checkpoint=Path(CHECKPOINT)
    manifest=json.loads((checkpoint/'COMPLETE.json').read_text())
    if manifest['client']['step']!=5 or not (checkpoint/'ENGINE_RELOAD_VERIFIED.json').exists():raise ValueError('Wrong saved state')
    if not (checkpoint/'VOLUME_COMMITTED.json').exists():raise ValueError('Missing durable checkpoint')
    if any((checkpoint/n).stat().st_size!=size for n,size in manifest['files'].items()):raise ValueError('Incomplete source')
    for name in ['plan.json','zero3.json']:shutil.copy2(source/name,out/name)
    atomic_json(root/'authorization.json',authorization)
    atomic_json(root/'admission.json',decision)
    atomic_json(root/'source_hashes.json',{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in Path(next(iter(drama3_fullft.__path__))).glob('*.py')})
    atomic_json(root/'STARTED.json',{'resume_from':CHECKPOINT,'target_step':25,'original_restart':False,
        'same_optimizer_rng_teacher_and_data':True,'extra_fresh_gpu_verification':False,
        'native_export_on_gpu':False,'single_final_budget_checkpoint':True,'automatic_retry':False})
    voices.commit();started=time.monotonic();deadline=time.time()+2330
    command=['torchrun','--standalone','--nproc_per_node=8','--module','drama3_fullft.resumable_fullsize',
        '--root','/voices/_drama3/korean-teacher-007-20261023','--original',ASSETS,'--output',str(out),
        '--target-step','25','--resume-checkpoint',CHECKPOINT,'--checkpoint-policy','budget',
        '--deadline-unix',str(deadline),'--checkpoint-reserve-seconds','450']
    process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True,
        env=dict(os.environ,OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',TOKENIZERS_PARALLELISM='false'))
    try:
        with (out/'training.log').open('w') as log:
            for line in process.stdout:
                log.write(line);log.flush();print(line,end='',flush=True)
                if line.startswith('AB_STEP '):atomic_json(out/'progress.json',json.loads(line.split(' ',2)[2]))
                elif line.startswith('AB_RESUME_CHECKPOINT '):
                    saved=json.loads(line.split(' ',1)[1]);folder=Path(saved['path']);commit_started=time.monotonic()
                    voices.commit()
                    atomic_json(folder/'VOLUME_COMMITTED.json',{'step':saved['client']['step'],'commit_seconds':time.monotonic()-commit_started,'time':time.time()})
                    voices.commit();print('CONTINUOUS_CHECKPOINT_DURABLE',saved['client']['step'],flush=True)
            code=process.wait(timeout=10)
        if code:raise RuntimeError('Continuation failed; preserve saved step5 and do not retry automatically')
        saved=latest_committed_checkpoint(out/'training_checkpoints')
        if saved is None or saved['client']['step']<=5:raise RuntimeError('No new safely saved update; never claim completed training')
        result={'checkpoint':saved['path'],'steps_completed':saved['client']['step'],'goal_steps':25,
            'original_25_update_goal_complete':saved['client']['step']==25,'updates_this_run':saved['client']['step']-5,
            'optimizer_rng_and_data_saved':True,'previous_step5_preserved':True,
            'initial_full_state_resume_witnesses_checked':True,'new_checkpoint_independent_engine_reload_tested':False,
            'additional_fresh_gpu_verification_jobs':0,'native_export_generated':False,
            'seconds':time.monotonic()-started,'quality_improvement_confirmed':False,'production_approved':False}
        atomic_json(root/'RESULT.json',result);voices.commit();return result
    finally:
        if process.poll() is None:os.killpg(process.pid,signal.SIGKILL)
        voices.commit()


@app.local_entrypoint()
def main(folder:str):
    import subprocess
    from drama3_fullft.continuous_budget import admit
    out=Path(folder);authorization=json.loads((out/'authorization.json').read_text())
    if authorization.get('user_authorized_additional_total_cash_ceiling_usd')!=authorization['additional_total_cash_ceiling_usd']:
        raise ValueError('No user authorization for this exact spending ceiling')
    bill=json.loads(subprocess.check_output(['/Users/johyeon-ung/.miro/voice-venv/bin/modal','billing','summary','--json'],text=True))
    authorization['net_billed_at_dispatch']=float(bill['billed_cost'])
    decision=admit(authorization['net_billed_at_dispatch'],30,authorization['additional_total_cash_ceiling_usd'])
    (out/'admission.json').write_text(json.dumps(decision,indent=2))
    if not decision['admitted']:raise ValueError('Budget is insufficient; no GPU allocated')
    with (out/'CONTINUOUS_GPU_DISPATCHED.json').open('x') as f:json.dump(authorization,f,indent=2)
    result=continue_training.remote(authorization);(out/'training_result.json').write_text(json.dumps(result,indent=2))
