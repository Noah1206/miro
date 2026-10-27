"""One <=$20 stage: train toward25, save once, reload that state, then stop."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,voices

image=(base_image.env({'DS_BUILD_OPS':'0'}).pip_install('deepspeed==0.19.8','ninja')
       .add_local_python_source('drama3_fullft','modal_drama3_compare'))
app=modal.App('miro-drama3-real35b-stage20')
RUN_ROOT='/voices/_drama3/fullsize-ko-007-20261024-stage20-v3'
NATIVE='/voices/_drama3/fullsize-ko-007-20261024-budget44-v1/arms/korean_teacher/snapshots/step-000001'
BOOTSTRAP='/voices/_drama3/fullsize-ko-007-20261024-budget44-resumable-v2/arms/korean_teacher/bootstrap'


@app.function(image=image,gpu='H100:8',cpu=(16,16),memory=(655360,917504),ephemeral_disk=2097152,
              timeout=1720,retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def train_stage(settings,authorization,storage_proof):
    import hashlib,os,shutil,signal,subprocess,threading,time
    import drama3_fullft
    from drama3_fullft.data import read_rows
    from drama3_fullft.matched_fullsize import build_plan
    from drama3_fullft.training_state import atomic_json,latest_committed_checkpoint
    if not storage_proof.get('external_volume_file_sizes_verified') or not storage_proof.get('verified_commit_returned'):
        raise ValueError('A full-size CPU storage proof must pass before this GPU stage')
    if authorization['new_stage_all_in_ceiling_usd']!=20 or authorization['additional_total_cash_ceiling_usd']!=50:
        raise ValueError('Use exactly the current explicit budget authorization')
    started=time.monotonic();end=time.time()+1640.;verify_reserve=300.
    save_reserve=max(300.,175.1*1.25+storage_proof['commit_seconds']+60.)
    if 300.+95.+save_reserve+verify_reserve>1500:raise ValueError('Storage too slow to admit a useful, safely saved stage')
    voices.reload();root=Path(RUN_ROOT);out=root/'arms/korean_teacher'
    if out.exists():raise FileExistsError('This stage is single-use; never overwrite existing results')
    out.mkdir(parents=True);data=Path('/voices/_drama3/korean-teacher-007-20261023');assets=Path(NATIVE)
    for name in ['config.json','tokenizer.json','codec.pth','codec_contract.json','EXPORT_COMPLETE.json']:
        if not (assets/name).is_file():raise FileNotFoundError(name)
    disk=shutil.disk_usage('/')
    placeholder=disk.free>4*1024**4
    required=2*35899643008*12+128*1024**3
    if not placeholder and disk.free<required:raise RuntimeError('Actual root disk has insufficient staging capacity')
    atomic_json(out/'disk_preflight.json',{'requested_ephemeral_disk_mib':2097152,'statfs_free_bytes':disk.free,
        'statfs_is_placeholder':placeholder,'required_free_bytes':required,'full_size_cpu_commit_verified':True,
        'same_gpu_worker_storage_capacity_tested':False})
    plan=build_plan(read_rows(data/'data/recordings.jsonl'))
    settings['gradient_accumulation_steps']=plan['accumulation'];settings['zero_optimization']['load_from_fp32_weights']=True
    settings['checkpoint']={'checkpoint_serialization':True,'tag_validation':'FAIL'}
    atomic_json(out/'plan.json',plan);atomic_json(out/'zero3.json',settings)
    atomic_json(root/'authorization.json',authorization);atomic_json(root/'storage_proof.json',storage_proof)
    # Reuse the prior saved step1 teacher-head/RNG bootstrap; preserve the old
    # native weights and incomplete step5 directory without changing either.
    shutil.copytree(BOOTSTRAP,out/'bootstrap')
    sources=out/'code';sources.mkdir()
    for file in Path(next(iter(drama3_fullft.__path__))).glob('*.py'):shutil.copy2(file,sources/file.name)
    atomic_json(sources/'source_hashes.json',{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sources.glob('*.py')})
    atomic_json(out/'STARTED.json',{'target_steps':25,'fixed_every_five_saves':False,'save_reserve_seconds':save_reserve,
        'verification_reserve_seconds':verify_reserve,'original_weights_restart_allowed':False})
    voices.commit();process=None;stopping=threading.Event();memory={'peak_used_gib':0.,'limit_gib':896.}
    def guard():
        while not stopping.wait(1):
            vals={s.split(':')[0]:int(s.split()[1]) for s in Path('/proc/meminfo').read_text().splitlines() if s.startswith(('MemTotal:','MemAvailable:'))}
            used=(vals['MemTotal']-vals['MemAvailable'])/1048576;memory['peak_used_gib']=max(memory['peak_used_gib'],used)
            if used>850 or time.time()>end:
                memory['guard_reason']='memory' if used>850 else 'stage_deadline'
                if process is not None and process.poll() is None:os.killpg(process.pid,signal.SIGTERM)
                return
    def run(arguments):
        nonlocal process
        cmd=['torchrun','--standalone','--nproc_per_node=8','--module','drama3_fullft.resumable_fullsize',
            '--root',str(data),'--original',str(assets),'--output',str(out),'--target-step','25',*arguments]
        env=dict(os.environ,OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',TOKENIZERS_PARALLELISM='false')
        with (out/'torchrun.log').open('a') as log:
            process=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,env=env,start_new_session=True)
            for line in process.stdout:
                log.write(line);log.flush();print(line,end='',flush=True)
                if line.startswith('AB_STEP '):atomic_json(out/'progress.json',json.loads(line.split(' ',2)[2]))
                elif line.startswith('AB_BOOTSTRAP_READY '):voices.commit()
                elif line.startswith('AB_RESUME_CHECKPOINT '):
                    manifest=json.loads(line.split(' ',1)[1]);folder=Path(manifest['path']);commit_started=time.monotonic()
                    voices.commit()
                    atomic_json(folder/'VOLUME_COMMITTED.json',{'step':manifest['client']['step'],'unix_time':time.time(),
                        'commit_seconds':time.monotonic()-commit_started})
                    voices.commit();print('DURABLE_TRAINING_CHECKPOINT',manifest['client']['step'],flush=True)
                elif line.startswith('AB_EXACT_RESUME_VERIFIED '):voices.commit()
            code=process.wait(timeout=15)
        if code:raise RuntimeError('Training/verification worker stopped with code '+str(code))
    threading.Thread(target=guard,daemon=True).start()
    try:
        run(['--warm-start',NATIVE,'--checkpoint-policy','budget',
            '--deadline-unix',str(end-verify_reserve),'--checkpoint-reserve-seconds',str(save_reserve)])
        checkpoint=latest_committed_checkpoint(out/'training_checkpoints')
        if checkpoint is None:raise RuntimeError('No committed all-rank checkpoint; do not claim successful save')
        reloaded=False
        if end-time.time()>180:
            run(['--resume-checkpoint',checkpoint['path'],'--verify-resume-only','--checkpoint-policy','budget'])
            proof=Path(checkpoint['path'])/'ENGINE_RELOAD_VERIFIED.json';reloaded=proof.is_file()
        step=checkpoint['client']['step']
        result={'status':'budget_stage_saved','steps_completed':step,'steps_planned':25,'training_goal_reached':step==25,
            'training_checkpoint':checkpoint['path'],'optimizer_state_saved':True,'random_state_saved':True,'data_position_saved':True,
            'independent_engine_reload_verified':reloaded,'checkpoint_policy':'budget_boundary','fixed_every_five_saves':False,
            'native_weights_step1_preserved':True,'prior_incomplete_step5_preserved':True,'bootstrap_reused':True,
            'warm_start_optimizer_was_fresh':True,'production_ready':False,'quality_improvement_confirmed':False,
            'automatic_retry':False,'function_seconds_total':time.monotonic()-started,'memory_observation':memory,
            'further_spending_requires_user_decision':True}
        atomic_json(root/'stage_result.json',result);voices.commit();return result
    except Exception as error:
        checkpoint=latest_committed_checkpoint(out/'training_checkpoints')
        atomic_json(root/'FAILED.json',{'error':repr(error),'checkpoint':checkpoint,'memory':memory,'automatic_retry':False})
        raise
    finally:
        stopping.set()
        if process is not None and process.poll() is None:os.killpg(process.pid,signal.SIGKILL)
        voices.commit()


@app.local_entrypoint()
def main(folder:str):
    out=Path(folder);authorization=json.loads((out/'authorization.json').read_text());proof=json.loads((out/'storage_preflight.json').read_text())
    if not proof.get('external_volume_file_sizes_verified'):raise ValueError('No independent persisted-file proof')
    if authorization['storage_preflight_completed_resource_bound_usd']+18.89+.75>20.000001:
        raise ValueError('Resource bounds would exceed the authorized20dollar stage')
    settings=json.loads(Path('tooling/voice/drama3_fullft/zero3.json').read_text())
    with (out/'GPU_STAGE_STARTED.json').open('x') as f:f.write(json.dumps({'automatic_retry':False}))
    result=train_stage.remote(settings,authorization,proof)
    (out/'training_stage_result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print('BUDGET_STAGE_RESULT',json.dumps(result,ensure_ascii=False),flush=True)
