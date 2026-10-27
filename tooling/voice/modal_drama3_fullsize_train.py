"""Two matched real35B Full FT arms; save native inference weights in GPU storage."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,cache,voices,MODEL_REV
image=(base_image.env({'DS_BUILD_OPS':'0'}).pip_install('deepspeed==0.19.8','ninja')
       .add_local_python_source('drama3_fullft','modal_drama3_compare'))
app=modal.App('miro-drama3-real35b-matched-fullft')
RUN_ROOT='/voices/_drama3/fullsize-ab-007-20261023-v1'


@app.function(image=image,cpu=0.125,memory=512,timeout=120,retries=0,
              volumes={'/fishcache':cache,'/voices':voices})
def preflight():
    """Check account execution and cached inputs without allocating a GPU."""
    voices.reload();cache.reload()
    original=Path('/fishcache/huggingface/hub/models--fishaudio--drama-3/snapshots')/MODEL_REV
    data=Path('/voices/_drama3/korean-teacher-007-20261023')
    required=[original/'config.json',original/'model.safetensors.index.json',
              data/'data/recordings.jsonl',data/'codes/codec_contract.json']
    missing=[str(path) for path in required if not path.is_file()]
    if missing:raise FileNotFoundError(missing)
    return {'status':'ready','gpu_allocated':False,'model_revision':MODEL_REV,
            'cached_codec_files':len(list((data/'codes').glob('*.pt'))),
            'cached_teacher_files':len(list((data/'teacher_features').glob('*.pt'))),
            'scope':'One Korean-teacher25step Full FT; reuse original control audio'}


@app.function(image=image,gpu='H100:2',cpu=(4,4),memory=(131072,196608),timeout=240,retries=0,
              volumes={'/fishcache':cache,'/voices':voices})
def verify_first_snapshot(run_root,manifest):
    import os,hashlib,random,time
    import torch,numpy as np,soundfile as sf
    from drama3_fullft.live_export import verify_native_files
    from drama3_fullft.codec_contract import validate_cache
    os.environ['FISH_DRAMA3_FP8_EXPERTS']='0'
    from fish_speech.models.text2semantic.inference import init_model,load_codec_model,decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt,generate_drama3
    voices.reload();cache.reload();started=time.monotonic()
    root=Path(run_root);weights=root/'arms/korean_teacher/snapshots/step-000001'
    checks=verify_native_files(weights)
    assert checks['verified_parameter_bytes']==35899643008*2
    data=Path('/voices/_drama3/korean-teacher-007-20261023')
    original=Path('/fishcache/huggingface/hub/models--fishaudio--drama-3/snapshots')/MODEL_REV
    ref=data/'data/wavs'/(manifest['reference_clip_id']+'.wav')
    assert hashlib.sha256(ref.read_bytes()).hexdigest()==manifest['reference_sha256']
    contract=json.loads((data/'codes/codec_contract.json').read_text())
    codes=validate_cache(torch.load(data/'codes'/(manifest['reference_clip_id']+'.pt'),weights_only=True),manifest['reference_sha256'],contract)
    model,_=init_model(weights,'cuda:0,cuda:1',torch.bfloat16,compile=False);model.eval()
    codec=load_codec_model(original/'codec.pth',str(model.device),torch.bfloat16).eval()
    request=next(x for x in manifest['requests'] if x['id']=='neutral')
    seed=request['seed'];random.seed(seed);np.random.seed(seed);torch.manual_seed(seed);torch.cuda.manual_seed_all(seed)
    with torch.inference_mode():
        prompt=build_drama3_prompt('<|speaker:0|>'+request['tagged_text'],model.tokenizer,model.config,['<|speaker:0|>'+manifest['reference_text']],[codes])
        frames,finish=generate_drama3(model,prompt,max_new_tokens=request['max_new_tokens'],**manifest['settings'])
        if len(frames)==0:raise RuntimeError('Reloaded saved model produced no frames')
        wave=decode_to_audio(frames[:,1:].T.contiguous().to(model.device),codec).float().cpu().numpy().squeeze()
    if wave.ndim!=1 or not len(wave) or not np.isfinite(wave).all() or np.sqrt(np.mean(wave**2))<1e-6:raise RuntimeError('Reloaded saved model produced invalid/silent audio')
    out=root/'listening/first_snapshot_probe';out.mkdir(parents=True,exist_ok=True)
    sf.write(out/'neutral_s1234.wav',wave,codec.sample_rate,subtype='FLOAT')
    result={'verified':True,**checks,'snapshot_path':str(weights),'step':1,'separate_container_reload':True,
            'seconds':time.monotonic()-started,'finish_reason':finish,'audio_seconds':len(wave)/codec.sample_rate,
            'voice_quality_approved':False,'optimizer_resume_available':False}
    (out/'report.json').write_text(json.dumps(result,indent=2));voices.commit();return result


@app.function(image=image,gpu='H100:8',cpu=(16,16),memory=(655360,917504),timeout=3300,retries=0,
              volumes={'/fishcache':cache,'/voices':voices})
def train_arm(arm,settings,restart_interrupted=False,run_root=RUN_ROOT,manifest=None):
    import os,subprocess,threading,signal,time,hashlib,shutil
    import drama3_fullft
    from drama3_fullft.data import read_rows
    from drama3_fullft.matched_fullsize import build_plan
    if arm!='korean_teacher':raise ValueError('Current budget authorizes only the Korean teacher arm')
    started=time.monotonic()
    if manifest is None:raise ValueError('Independent first-save verification requires generation manifest')
    voices.reload();cache.reload();root=Path(run_root);out=root/'arms'/arm;out.mkdir(parents=True,exist_ok=True)
    if (out/'result.json').exists():return json.loads((out/'result.json').read_text())
    if (out/'STARTED.json').exists():
        if not restart_interrupted:raise RuntimeError('Prior attempt interrupted; preserve artifacts or explicitly restart')
        archive=root/'interrupted';archive.mkdir(exist_ok=True)
        out.rename(archive/(arm+'-'+str(time.time_ns())));out.mkdir()
    data=Path('/voices/_drama3/korean-teacher-007-20261023')
    plan=build_plan(read_rows(data/'data/recordings.jsonl'));settings['gradient_accumulation_steps']=plan['accumulation']
    (out/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2));(out/'zero3.json').write_text(json.dumps(settings,indent=2))
    snapshot=out/'code';snapshot.mkdir(exist_ok=True);hashes={}
    for file in Path(next(iter(drama3_fullft.__path__))).glob('*.py'):
        shutil.copy2(file,snapshot/file.name);hashes[file.name]=hashlib.sha256(file.read_bytes()).hexdigest()
    (snapshot/'source_hashes.json').write_text(json.dumps(hashes,indent=2))
    (out/'STARTED.json').write_text(json.dumps({'arm':arm,'unix_time':time.time(),'plan_sha256':plan['sha256'],'scope':'Real35B pretrained Full FT, no LoRA'}))
    voices.commit()
    original=Path('/fishcache/huggingface/hub/models--fishaudio--drama-3/snapshots')/MODEL_REV
    command=['torchrun','--standalone','--nproc_per_node=8','--module','drama3_fullft.matched_fullsize',
             '--root',str(data),'--original',str(original),'--output',str(out),'--arm',arm]
    env=dict(os.environ,OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',TOKENIZERS_PARALLELISM='false')
    process=None;timer=None;stopping=threading.Event();memory={'limit_gib':896.,'peak_observed_used_gib':0.,'method':'MemTotal minus MemAvailable,1s sampling; approximate container use'}
    def observe():
        while not stopping.wait(1):
            values={line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith(('MemTotal:','MemAvailable:'))}
            used=(values['MemTotal']-values['MemAvailable'])/1048576;memory['peak_observed_used_gib']=max(used,memory['peak_observed_used_gib'])
            (out/'memory_observation.json').write_text(json.dumps(memory,indent=2))
            if used>850 and process is not None and process.poll() is None:
                memory['guard_triggered']=True;os.killpg(process.pid,signal.SIGTERM);return
    try:
        with (out/'torchrun.log').open('w') as log:
            process=subprocess.Popen(command,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
            timer=threading.Timer(3200,lambda:os.killpg(process.pid,signal.SIGTERM) if process.poll() is None else None);timer.daemon=True;timer.start()
            observer=threading.Thread(target=observe,daemon=True);observer.start()
            for line in process.stdout:
                log.write(line);log.flush();print(line,end='',flush=True)
                if line.startswith('AB_STEP '):
                    event=json.loads(line.split(' ',2)[2]);(out/'progress.json').write_text(json.dumps(event,indent=2))
                elif line.startswith('AB_NATIVE_SNAPSHOT '):
                    # Publish completed inference weights before another billing/host interruption.
                    # These snapshots preserve learned weights, not exact Adam optimizer state.
                    snapshot=json.loads(line.split(' ',2)[2])
                    if not Path(snapshot['path'],'EXPORT_COMPLETE.json').is_file():raise RuntimeError('Incomplete snapshot notification')
                    voices.commit()
                    if snapshot['step']==1:
                        if arm!='korean_teacher':raise ValueError('Budget44 authorizes one Korean teacher arm only')
                        verified=verify_first_snapshot.remote(run_root,manifest)
                        elapsed=time.monotonic()-started
                        export_seconds=snapshot['native_export']['export_seconds']
                        # Use a conservative steady-update estimate from the measured prior run.
                        remaining=24*85+3*export_seconds+90
                        decision={**verified,'elapsed_train_container_seconds':elapsed,
                                  'projected_remaining_seconds':remaining,'hard_stop_seconds':3200,
                                  'continue_training':verified['verified'] and elapsed+remaining<3100}
                        temporary=out/'FIRST_SAVE_VERIFIED.json.tmp';temporary.write_text(json.dumps(decision,indent=2));temporary.replace(out/'FIRST_SAVE_VERIFIED.json')
                        voices.commit();print('FIRST_SAVE_GATE',json.dumps(decision),flush=True)
            code=process.wait(timeout=30)
        if code:raise RuntimeError('Training exited '+str(code))
        result=json.loads((out/'result.json').read_text());result['memory_observation']=memory
        (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));return result
    except Exception as error:
        latest=json.loads((out/'LATEST_NATIVE_SNAPSHOT.json').read_text()) if (out/'LATEST_NATIVE_SNAPSHOT.json').is_file() else None
        (out/'FAILED.json').write_text(json.dumps({'error':repr(error),'memory':memory,'trained_checkpoint_complete':(out/'model/EXPORT_COMPLETE.json').exists(),'last_complete_native_snapshot':latest},indent=2));raise
    finally:
        stopping.set()
        if timer is not None:timer.cancel()
        if process is not None and process.poll() is None:os.killpg(process.pid,signal.SIGKILL)
        voices.commit()


@app.function(image=image,memory=2048,timeout=120,volumes={'/voices':voices})
def collect(arms=None,run_root=RUN_ROOT):
    arms=['baseline','korean_teacher'] if arms is None else arms
    if not arms or len(arms)!=len(set(arms)) or any(x not in ['baseline','korean_teacher'] for x in arms):
        raise ValueError('Invalid trained arms')
    voices.reload();root=Path(run_root);result={'scope':'Actual pretrained35B Full FT matched pilot; generation pending','arms':{}}
    for arm in arms:
        path=root/'arms'/arm
        result['arms'][arm]={'result':json.loads((path/'result.json').read_text()),
             'plan':json.loads((path/'plan.json').read_text()),
             'validation':[json.loads(x) for x in (path/'validation.jsonl').read_text().splitlines()],
             'history':[json.loads(x) for x in (path/'history.jsonl').read_text().splitlines()]}
        assert result['arms'][arm]['result']['steps_completed']==25
        assert result['arms'][arm]['result']['trainable_tts_parameters']==35899643008
    if len(arms)==2:
        assert result['arms']['baseline']['plan']==result['arms']['korean_teacher']['plan']
        first=result['arms']['baseline']['validation'][0];second=result['arms']['korean_teacher']['validation'][0]
        result['initial_speech_loss_delta']=second['speech_loss_mean']-first['speech_loss_mean']
        assert abs(result['initial_speech_loss_delta'])<1e-4,'Initial conditions did not match'
        result['same_plan_verified']=True
        result['listening_arms']=['original','baseline','korean_teacher']
    else:
        result['scope']='One actual35B Full FT pilot versus existing untrained Drama3 audio; no no-teacher trained control'
        result['listening_arms']=['original',arms[0]]
        result['isolates_teacher_effect']=False
    (root/'training_comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));voices.commit();return result


@app.local_entrypoint()
def main(folder:str,arm:str='korean_teacher',restart_interrupted:bool=False,run_root:str=RUN_ROOT):
    out=Path(folder);out.mkdir(parents=True,exist_ok=True);settings=json.loads(Path('tooling/voice/drama3_fullft/zero3.json').read_text())
    if arm=='preflight':
        result=preflight.remote();(out/'single_arm_preflight.json').write_text(json.dumps(result,indent=2));print('NO_GPU_PREFLIGHT',result);return
    if arm=='collect':
        result=collect.remote(['korean_teacher'],run_root);(out/'training_comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('SINGLE_REAL_MODEL_COLLECTED');return
    if arm!='korean_teacher':raise ValueError('Only one Korean teacher training arm is authorized')
    for name in (['baseline','korean_teacher'] if arm=='both' else [arm]):
        result=train_arm.remote(name,settings,restart_interrupted,run_root,json.loads((out/'manifest.json').read_text()));(out/(name+'_training.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2));print('ACTUAL35B_ARM_SAVED',name)
    if arm=='both':
        result=collect.remote();(out/'training_comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('BOTH_REAL_MODELS_TRAINED_AND_EXPORTED')
    else:
        result=collect.remote([arm],run_root);(out/'training_comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('SINGLE_REAL_MODEL_COLLECTED')
