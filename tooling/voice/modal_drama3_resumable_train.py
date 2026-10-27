"""One bounded full-size checkpoint/reload run; no original-weight restart."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,cache,voices,MODEL_REV

image=(base_image.env({'DS_BUILD_OPS':'0'}).pip_install('deepspeed==0.19.8','ninja')
       .add_local_python_source('drama3_fullft','modal_drama3_compare'))
app=modal.App('miro-drama3-real35b-resumable-budget44')
RUN_ROOT='/voices/_drama3/fullsize-ko-007-20261024-budget44-resumable-v2'
WARM_START='/voices/_drama3/fullsize-ko-007-20261024-budget44-v1/arms/korean_teacher/snapshots/step-000001'


@app.function(image=image,gpu='H100:8',cpu=(16,16),memory=(655360,917504),ephemeral_disk=2097152,timeout=1650,retries=0,
              max_containers=1,scaledown_window=2,volumes={'/fishcache':cache,'/voices':voices})
def train(settings,authorization,target_step=25):
    import hashlib,os,shutil,signal,subprocess,threading,time
    import drama3_fullft
    from drama3_fullft.data import read_rows
    from drama3_fullft.matched_fullsize import build_plan
    from drama3_fullft.training_state import atomic_json,latest_committed_checkpoint
    if not authorization.get('native_cpu_integrity_verified'):raise ValueError('Audit saved weights on CPU before allocating this run')
    if target_step!=25:raise ValueError('Keep the requested 25-update goal; pause only at saved milestones when budget is insufficient')
    started=time.monotonic();deadline=time.time()+1600
    voices.reload();cache.reload();root=Path(RUN_ROOT);out=root/'arms/korean_teacher';out.mkdir(parents=True,exist_ok=True)
    if (out/'result.json').exists():return json.loads((out/'result.json').read_text())
    # Volume statfs reports placeholder capacity; inspect the actual root disk.
    # Two FP32 Adam/master checkpoints, plus export/cache/commit staging headroom.
    disk=shutil.disk_usage('/')
    required_free=2*35899643008*12+128*1024**3
    if disk.free<required_free:
        raise RuntimeError(f'Insufficient root-disk staging capacity: {disk.free} < {required_free}; refuse training')
    atomic_json(out/'disk_preflight.json',{'root_free_bytes':disk.free,'required_free_bytes':required_free,
        'requested_ephemeral_disk_mib':2097152,'volume_statfs_used':False})
    for name in ['SEGMENT_PAUSED.json','CHECKPOINT_HANDOFF.json','FAILED.json']:
        old=out/name
        if old.exists():old.rename(out/(name+'.previous-'+str(time.time_ns())))
    # The public download cache was intentionally cleared. The audited native
    # step1 export contains the same config/tokenizer/frozen codec. Only these
    # assets are read here; model weights still use the explicit warm/resume path.
    original=Path(WARM_START)
    for name in ('config.json','tokenizer.json','codec.pth','codec_contract.json'):
        if not (original/name).is_file():raise FileNotFoundError('Missing preserved serving asset: '+name)
    data=Path('/voices/_drama3/korean-teacher-007-20261023')
    plan=build_plan(read_rows(data/'data/recordings.jsonl'))
    settings['gradient_accumulation_steps']=plan['accumulation']
    settings['zero_optimization']['load_from_fp32_weights']=True
    settings['checkpoint']={'checkpoint_serialization':True,'tag_validation':'FAIL'}
    atomic_json(out/'plan.json',plan);atomic_json(out/'zero3.json',settings);atomic_json(root/'authorization.json',authorization)
    sources=out/'code';sources.mkdir(exist_ok=True)
    for file in Path(next(iter(drama3_fullft.__path__))).glob('*.py'):shutil.copy2(file,sources/file.name)
    atomic_json(sources/'source_hashes.json',{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sources.glob('*.py')})
    atomic_json(out/'STARTED.json',{'unix_time':time.time(),'scope':'Continue saved step1; full ZeRO optimizer checkpoints and controlled reload','target_step':target_step})
    voices.commit()
    stopping=threading.Event();process=None;memory={'limit_gib':896.,'peak_observed_used_gib':0.}
    def observe():
        while not stopping.wait(1):
            values={line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith(('MemTotal:','MemAvailable:'))}
            used=(values['MemTotal']-values['MemAvailable'])/1048576
            memory['peak_observed_used_gib']=max(used,memory['peak_observed_used_gib'])
            if used>850 and process is not None and process.poll() is None:
                memory['guard_triggered']=True;os.killpg(process.pid,signal.SIGTERM);return
    def run_segment(arguments):
        nonlocal process
        command=['torchrun','--standalone','--nproc_per_node=8','--module','drama3_fullft.resumable_fullsize',
                 '--root',str(data),'--original',str(original),'--output',str(out),'--deadline-unix',str(deadline),*arguments]
        env=dict(os.environ,OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',TOKENIZERS_PARALLELISM='false')
        with (out/'torchrun.log').open('a') as log:
            process=subprocess.Popen(command,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
            for line in process.stdout:
                log.write(line);log.flush();print(line,end='',flush=True)
                if line.startswith('AB_STEP '):atomic_json(out/'progress.json',json.loads(line.split(' ',2)[2]))
                elif line.startswith('AB_BOOTSTRAP_READY '):voices.commit()
                elif line.startswith('AB_RESUME_CHECKPOINT '):
                    checkpoint=json.loads(line.split(' ',1)[1]);folder=Path(checkpoint['path'])
                    if not (folder/'COMPLETE.json').is_file():raise ValueError('Missing all-rank checkpoint completion marker')
                    voices.commit()
                    atomic_json(folder/'VOLUME_COMMITTED.json',{'unix_time':time.time(),'step':checkpoint['client']['step']})
                    voices.commit();print('DURABLE_TRAINING_CHECKPOINT',checkpoint['client']['step'],sum(checkpoint['files'].values()),flush=True)
                    complete=[p for p in (out/'training_checkpoints').glob('step-*') if (p/'COMPLETE.json').exists() and (p/'VOLUME_COMMITTED.json').exists()]
                    for old in sorted(complete)[:-2]:shutil.rmtree(old)
                    incomplete=out/'training_checkpoints/_incomplete'
                    if incomplete.exists():shutil.rmtree(incomplete)
                    voices.commit()
                elif line.startswith('AB_EXACT_RESUME_VERIFIED '):
                    proof=json.loads(line.split(' ',1)[1]);source=Path(proof['path'])/'ENGINE_RELOAD_VERIFIED.json'
                    shutil.copy2(source,out/'FIRST_ENGINE_RELOAD_VERIFIED.json');voices.commit()
            code=process.wait(timeout=15)
        if code:raise RuntimeError('Training segment stopped with code '+str(code))
    def timeout_guard():
        if process is not None and process.poll() is None:os.killpg(process.pid,signal.SIGTERM)
    timer=threading.Timer(1600,timeout_guard);timer.daemon=True;timer.start()
    threading.Thread(target=observe,daemon=True).start()
    try:
        pointer=out/'training_checkpoints/LATEST_TRAINING_CHECKPOINT.json'
        checkpoint=latest_committed_checkpoint(out/'training_checkpoints')
        if checkpoint is not None:pass
        else:
            if any((out/'training_checkpoints').glob('step-*')):
                raise RuntimeError('Incomplete training checkpoint exists; audit recovery before any native step1 continuation')
            run_segment(['--warm-start',WARM_START,'--target-step',str(target_step),'--handoff-step','5'])
            checkpoint=latest_committed_checkpoint(out/'training_checkpoints')
            if checkpoint is None:raise RuntimeError('No durably committed full training state after handoff')
        # The old worker exits, releasing CPU Adam and all ZeRO GPU partitions.
        # The next worker builds a pristine engine and loads only the saved state.
        remaining=1600-(time.monotonic()-started)
        minimum_for_reload=max(120,checkpoint.get('save_seconds',180)*.7)+45
        if remaining<minimum_for_reload:
            result={'status':'checkpoint_saved_budget_stop','steps_completed':checkpoint['client']['step'],
                'training_checkpoint':checkpoint['path'],'independent_engine_reload_verified':False,
                'optimizer_checkpoint_saved':True,'request_complete':False,'remaining_seconds':remaining,
                'note':'No automatic paid retry; full saved state can be resumed without original weights'}
            atomic_json(out/'budget_stop.json',result);voices.commit();return result
        arguments=['--resume-checkpoint',checkpoint['path'],'--target-step',str(target_step)]
        if remaining<minimum_for_reload+5*85+checkpoint.get('save_seconds',180):arguments.append('--verify-resume-only')
        run_segment(arguments)
        if (out/'SEGMENT_PAUSED.json').exists():
            checkpoint=json.loads(pointer.read_text());verified=(Path(checkpoint['path'])/'ENGINE_RELOAD_VERIFIED.json').is_file()
            first_verified=(out/'FIRST_ENGINE_RELOAD_VERIFIED.json').is_file()
            result={'status':'paused_budget','steps_completed':checkpoint['client']['step'],'steps_planned':25,
                    'checkpoint_interval':5,'training_checkpoint':checkpoint['path'],'optimizer_checkpoint_saved':True,
                    'independent_engine_reload_verified':verified,'earlier_training_checkpoint_reload_verified':first_verified,
                    'original_weights_restart_allowed':False,'request_complete':False,
                    'function_seconds_total':time.monotonic()-started,'memory_observation':memory}
            atomic_json(out/'budget_stop.json',result);voices.commit();return result
        result=json.loads((out/'result.json').read_text())
        # Completion retains the final full training state and native weights;
        # two ~400 GiB optimizer checkpoints plus native weights exceed free storage.
        latest=latest_committed_checkpoint(out/'training_checkpoints')
        if result['steps_completed']==25 and latest is not None:
            for folder in (out/'training_checkpoints').glob('step-*'):
                if str(folder)!=latest['path'] and (folder/'VOLUME_COMMITTED.json').is_file():shutil.rmtree(folder)
        validation=[json.loads(x) for x in (out/'validation.jsonl').read_text().splitlines()]
        history=[json.loads(x) for x in (out/'history.jsonl').read_text().splitlines()]
        comparison={'scope':'One actual35.9B Full FT warm continuation, full optimizer/RNG/data checkpoint and independent engine reload',
            'listening_arms':['original','korean_teacher'],'isolates_teacher_effect':False,
            'arms':{'korean_teacher':{'result':result,'plan':plan,'validation':validation,'history':history}}}
        atomic_json(root/'training_comparison.json',comparison);result['comparison']=comparison
        result['memory_observation']=memory;result['function_seconds_total']=time.monotonic()-started
        atomic_json(out/'result.json',result);voices.commit();return result
    except Exception as error:
        pointer=out/'training_checkpoints/LATEST_TRAINING_CHECKPOINT.json'
        atomic_json(out/'FAILED.json',{'error':repr(error),'memory':memory,
            'last_training_checkpoint':json.loads(pointer.read_text()) if pointer.exists() else None,
            'bootstrap_available':(out/'bootstrap/BOOTSTRAP_COMPLETE.json').is_file(),
            'original_weights_restart_allowed':False,'automatic_paid_retry':False})
        raise
    finally:
        stopping.set();timer.cancel()
        if process is not None and process.poll() is None:os.killpg(process.pid,signal.SIGKILL)
        voices.commit()


@app.local_entrypoint()
def main(folder:str):
    out=Path(folder);authorization=json.loads((out/'authorization.json').read_text())
    audit=json.loads(Path(authorization['native_cpu_integrity_report']).read_text())
    if not audit.get('verified') or audit.get('verified_parameter_bytes')!=71799286016:raise ValueError('Saved native files not verified')
    authorization['native_cpu_integrity_verified']=True
    settings=json.loads(Path('tooling/voice/drama3_fullft/zero3.json').read_text())
    result=train.remote(settings,authorization)
    (out/'korean_teacher_training.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    if result['status']=='complete':
        (out/'training_comparison.json').write_text(json.dumps(result['comparison'],ensure_ascii=False,indent=2))
    print('RESUMABLE_RUN_RESULT',json.dumps({k:v for k,v in result.items() if k in ['status','steps_completed','optimizer_checkpoint_saved','independent_engine_reload_verified','training_checkpoint']}),flush=True)
