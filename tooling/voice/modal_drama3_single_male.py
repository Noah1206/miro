"""One authorized male stage: bounded phases, saved23 retained, no paid retry."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,voices,cache,MODEL_REV

ROOT='/voices/_drama3/miro-male-asmr-01-20261026-v1'
ASSETS='/voices/_drama3/fullsize-ko-007-20261024-budget44-v1/arms/korean_teacher/snapshots/step-000001'
SOURCE23='/voices/_drama3/fullsize-ko-007-20261024-continuous-v4/arms/korean_teacher/training_checkpoints/step-000023'
NATIVE23=ROOT+'/native-source23'
NEW_NATIVE=ROOT+'/native-male-stage10'
image=(base_image.env({'DS_BUILD_OPS':'0','FISH_DRAMA3_FP8_EXPERTS':'0'})
    .pip_install('deepspeed==0.19.8','ninja')
    .add_local_python_source('drama3_fullft','modal_drama3_compare'))
app=modal.App('miro-one-male-fullft-authorized30-v1')

def record_json(path,value):
    from drama3_fullft.training_state import atomic_json
    atomic_json(path,value)

def require_auth(auth):
    if auth.get('authorized_for_paid_training') is not True or auth.get('new_job_cap_usd')!=30:
        raise ValueError('Exact new $30 authorization required')
    if auth.get('run_root')!=ROOT or not auth.get('plan_sha256'):raise ValueError('Wrong authorized stage')

@app.function(image=image,cpu=(4,4),memory=(262144,327680),ephemeral_disk=2097152,
              timeout=1200,retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def export_native(auth,which):
    import hashlib,time,torch
    from drama3_fullft.checkpoint_preview import export_checkpoint
    from drama3_fullft.live_export import verify_native_files
    require_auth(auth);voices.reload();root=Path(ROOT);root.mkdir(parents=True,exist_ok=True)
    if which=='source23':checkpoint=SOURCE23;destination=NATIVE23;step=23
    elif which=='trained':
        handoff=json.loads((root/'stage/CHECKPOINT_HANDOFF.json').read_text());step=handoff['new_stage_step']
        checkpoint=handoff['path'];destination=NEW_NATIVE
        if not 1<=step<=10:raise ValueError('No learned checkpoint to export')
    else:raise ValueError('Unknown export stage')
    marker=root/('EXPORT_'+which+'_STARTED.json')
    with marker.open('x') as f:json.dump({'authorization':auth,'time':time.time(),'automatic_retry':False},f)
    voices.commit();torch.set_num_threads(4)
    result=export_checkpoint(checkpoint,ASSETS,destination,expected_step=step,require_independent_reload=False)
    dest=Path(destination)
    if which=='trained':
        metadata=json.loads((dest/'MIRO_TRAINING.json').read_text())
        new=json.loads((root/'stage/NEW_STAGE_METADATA.json').read_text())
        metadata.update(new,steps_completed=step,steps_planned=10,source_checkpoint_updates=23,
            new_stage_steps_completed=step,historical_plus_new_updates_for_provenance_only=23+step,
            previous_007_data_is_current_training_data=False,checkpoint=checkpoint,inference_export_only=True)
        record_json(dest/'MIRO_TRAINING.json',metadata)
    if which=='source23':
        proof=verify_native_files(dest)
        proof['checksums_file_sha256']=hashlib.sha256((dest/'SHA256SUMS.json').read_bytes()).hexdigest()
        proof['payload_verified_on_cpu']=True
        record_json(dest/'CPU_NATIVE_VERIFICATION.json',proof)
    else:
        # export_checkpoint checks every FP32->BF16 value for finiteness,
        # hashes the exact serialized bytes, checks every write size, then
        # independently reopens all headers/index/shapes. Avoid a redundant
        # second70GB read; never call this a full payload readback check.
        proof={'native_parameter_bytes':result['bytes'],'native_tensors':result['tensors'],
            'serialized_payload_sha256_recorded':True,'all_headers_index_shapes_reopened_and_verified':True,
            'independent_full_payload_readback':False}
        record_json(dest/'CPU_INDEX_VERIFICATION.json',proof)
    voices.commit();record_json(dest/'VOLUME_COMMITTED.json',{'step':step,'time':time.time()});voices.commit()
    result.update(native=str(dest),which=which,proof=proof)
    record_json(root/('EXPORT_'+which+'_RESULT.json'),result);voices.commit();return result

@app.function(image=image,cpu=(4,4),memory=(262144,327680),ephemeral_disk=2097152,
              timeout=1100,retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def finish_source23_native(auth):
    import time,torch
    from drama3_fullft.finish_partial_native import finish
    require_auth(auth);voices.reload();root=Path(ROOT)
    with (root/'FINISH_SOURCE23_STARTED.json').open('x') as f:json.dump({'time':time.time(),'retain_saved_shards':True,'repeat_completed_tensor_conversion':False},f)
    voices.commit();torch.set_num_threads(4)
    result=finish(SOURCE23,ASSETS,NATIVE23,23)
    voices.commit();record_json(Path(NATIVE23)/'VOLUME_COMMITTED.json',{'step':23,'time':time.time()});voices.commit()
    record_json(root/'EXPORT_source23_RESULT.json',result);voices.commit();return result

@app.function(image=image,gpu='L4',cpu=(4,4),memory=(24576,24576),timeout=1200,retries=0,
              max_containers=1,scaledown_window=2,volumes={'/voices':voices,'/fishcache':cache})
def prepare_features(auth,bundle,plan,schedule,zero):
    import io,zipfile,hashlib,time,torch,torchaudio
    from transformers import HubertModel,AutoFeatureExtractor
    from fish_speech.models.text2semantic.inference import load_codec_model,encode_audio
    from drama3_fullft.korean_teacher import TEACHER_ID,TEACHER_REV,TEACHER_LAYER,align_features,build_training_stats
    from drama3_fullft.codec_contract import create_contract,validate_cache,read_contract
    from drama3_fullft.data import read_rows
    from drama3_fullft.single_voice_plan import build_plan,require_frozen_plan
    require_auth(auth);voices.reload();cache.reload();root=Path(ROOT);root.mkdir(parents=True,exist_ok=True)
    with (root/'FEATURES_STARTED.json').open('x') as f:json.dump({'time':time.time(),'automatic_retry':False},f)
    voices.commit();data_root=root/'data';data_root.mkdir(exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
        for name in archive.namelist():
            if name.startswith('/') or '..' in Path(name).parts:raise ValueError('Unsafe bundle path')
        archive.extractall(data_root)
    rows=[json.loads(x) for x in (data_root/'recordings.jsonl').read_text().splitlines()]
    for row in rows:row['audio_path']=str(data_root/'wavs'/Path(row['audio_path']).name)
    (data_root/'recordings.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
    rows=read_rows(data_root/'recordings.jsonl')
    actual=build_plan(rows,schedule,source23_manifest_sha256=plan['source_checkpoint_manifest_sha256'],seed=plan['seed'])
    require_frozen_plan(plan,actual)
    if auth['plan_sha256']!=plan['sha256']:raise ValueError('Bundle/plan authorization mismatch')
    (root/'stage').mkdir(exist_ok=True)
    record_json(root/'stage/plan.json',plan);record_json(root/'stage/zero3.json',zero)
    (root/'schedule.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in schedule))
    record_json(root/'authorization.json',auth)
    codes=root/'codes';features=root/'teacher_features';codes.mkdir(exist_ok=True);features.mkdir(exist_ok=True)
    weights=Path(ASSETS);contract=create_contract(weights/'codec.pth','bfloat16')
    old=read_contract(weights/'codec_contract.json')
    if contract!=old:raise ValueError('Preserve the exact existing codec/runtime identity')
    record_json(codes/'codec_contract.json',contract)
    codec=load_codec_model(weights/'codec.pth','cuda',torch.bfloat16).eval()
    for p in codec.parameters():p.requires_grad_(False)
    teacher=HubertModel.from_pretrained(TEACHER_ID,revision=TEACHER_REV,trust_remote_code=False,use_safetensors=True).to('cuda').eval()
    for p in teacher.parameters():p.requires_grad_(False)
    processor=AutoFeatureExtractor.from_pretrained(TEACHER_ID,revision=TEACHER_REV,trust_remote_code=False)
    if processor.sampling_rate!=16000 or processor.do_normalize:raise ValueError('Changed teacher waveform normalization')
    begin=time.monotonic();count=0
    for row in rows:
        path=Path(row['audio_path']);sha=hashlib.sha256(path.read_bytes()).hexdigest()
        if sha!=row['sha256']:raise ValueError('Uploaded audio differs from frozen manifest')
        with torch.inference_mode():code=encode_audio(path,codec,'cuda').cpu().long()
        payload={'codes':code,'source_sha256':sha,'codec_profile_id':contract['codec_profile_id'],'codec_revision':MODEL_REV}
        validate_cache(payload,sha,contract);torch.save(payload,codes/(row['clip_id']+'.pt'))
        wav,sr=torchaudio.load(path);wav=torchaudio.functional.resample(wav.mean(0),sr,16000)
        inputs=processor(wav.numpy(),sampling_rate=16000,return_tensors='pt').input_values.to('cuda')
        with torch.inference_mode():
            states=teacher(inputs,output_hidden_states=True).hidden_states[TEACHER_LAYER][0].float()
            aligned=align_features(states,code.shape[-1]).half().cpu()
        if not torch.isfinite(aligned).all():raise ValueError('Nonfinite teacher feature')
        torch.save({'features':aligned,'source_sha256':sha,'teacher_id':TEACHER_ID,'teacher_revision':TEACHER_REV,
            'layer':TEACHER_LAYER,'codec_profile_id':contract['codec_profile_id'],'original_teacher_frames':len(states)},features/(row['clip_id']+'.pt'))
        count+=1
        if count%25==0:
            record_json(root/'FEATURES_PROGRESS.json',{'clips':count,'total':len(rows),'seconds':time.monotonic()-begin})
            voices.commit();print('MALE_FEATURES',count,'/',len(rows),flush=True)
    stats=build_training_stats(features,rows,contract)
    result={'complete':True,'clips':count,'training_clip_hashes_bound':len(stats['training_source_hashes']),
        'train_only_stats':True,'original_codec_unchanged':True,'codec_contract':contract,'seconds':time.monotonic()-begin}
    record_json(root/'FEATURES_COMPLETE.json',result);voices.commit();cache.commit();return result

@app.function(image=image,gpu='H100:8',cpu=(16,16),memory=(655360,917504),ephemeral_disk=2097152,
              timeout=2200,retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def train_one_male(auth,limit_recovery=False):
    import os,signal,subprocess,time,hashlib,shutil
    import drama3_fullft
    require_auth(auth);begin=time.monotonic();voices.reload();root=Path(ROOT);out=root/'stage'
    if not json.loads((root/'FEATURES_COMPLETE.json').read_text())['complete']:raise ValueError('Features incomplete')
    if limit_recovery:
        if (out/'NEW_STAGE_METADATA.json').exists() or (out/'history.jsonl').exists() or (out/'training_checkpoints').exists():
            raise ValueError('The old attempt may contain learned updates; do not restart it from zero')
        marker='TRAINING_AFTER_SPEND_LIMIT_FIX_STARTED.json'
    else:marker='TRAINING_STARTED.json'
    with (root/marker).open('x') as f:json.dump({'time':time.time(),'authorization':auth,'automatic_retry':False,'verified_previous_new_updates_zero':limit_recovery},f)
    native=Path(NATIVE23)
    if not (native/'CPU_NATIVE_VERIFICATION.json').exists() or not (native/'VOLUME_COMMITTED.json').exists():raise ValueError('CPU export verification not ready')
    saved=json.loads((Path(SOURCE23)/'COMPLETE.json').read_text())
    if saved['client']['step']!=23 or not (Path(SOURCE23)/'VOLUME_COMMITTED.json').exists():raise ValueError('Wrong source23')
    plan=json.loads((out/'plan.json').read_text())
    if hashlib.sha256((Path(SOURCE23)/'COMPLETE.json').read_bytes()).hexdigest()!=plan['source_checkpoint_manifest_sha256']:raise ValueError('Changed source23 manifest')
    deadline=time.time()+(1760 if limit_recovery else 2100)
    code_root=Path(next(iter(drama3_fullft.__path__)))
    code_names=['single_voice_train.py','single_voice_plan.py','core.py','data.py','codec_contract.py','korean_teacher.py','training_state.py']
    code_hashes={name:hashlib.sha256((code_root/name).read_bytes()).hexdigest() for name in code_names}
    code_sha=hashlib.sha256(json.dumps(code_hashes,sort_keys=True).encode()).hexdigest()
    frozen=out/'code';frozen.mkdir(exist_ok=True)
    if limit_recovery:
        archive=out/'previous_attempts/disabled_before_any_update';archive.mkdir(parents=True)
        for name in code_names:
            if (frozen/name).exists():shutil.copy2(frozen/name,archive/name)
        for file in [out/'CODE_SHA256SUMS.json',root/'training_authorization.json']:
            if file.exists():shutil.copy2(file,archive/file.name)
    for name in code_names:shutil.copy2(code_root/name,frozen/name)
    record_json(out/'CODE_SHA256SUMS.json',code_hashes)
    live_auth={**auth,'training_deadline_unix':deadline,'checkpoint_reserve_seconds':600,'training_code_sha256':code_sha}
    record_json(root/'training_authorization.json',live_auth);voices.commit()
    command=['torchrun','--standalone','--nproc_per_node=8','--module','drama3_fullft.single_voice_train',
        '--manifest',str(root/'data/recordings.jsonl'),'--schedule',str(root/'schedule.jsonl'),
        '--output',str(out),'--assets',ASSETS,'--codes',str(root/'codes'),'--teacher-features',str(root/'teacher_features'),
        '--authorization',str(root/'training_authorization.json'),'--source23-native',NATIVE23]
    process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True,
        env=dict(os.environ,OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',TOKENIZERS_PARALLELISM='false'))
    try:
        with (out/('training_after_spend_limit_fix.log' if limit_recovery else 'training.log')).open('w') as log:
            for line in process.stdout:
                log.write(line);log.flush();print(line,end='',flush=True)
                if line.startswith('MALE_STAGE_UPDATE '):
                    record_json(out/'progress.json',json.loads(line.split(' ',1)[1]))
                elif line.startswith('AB_RESUME_CHECKPOINT '):
                    checkpoint=json.loads(line.split(' ',1)[1]);folder=Path(checkpoint['path']);started=time.monotonic()
                    voices.commit()
                    record_json(folder/'VOLUME_COMMITTED.json',{'step':checkpoint['client']['step'],'commit_seconds':time.monotonic()-started,'time':time.time()})
                    voices.commit();print('MALE_CHECKPOINT_DURABLE',checkpoint['client']['step'],flush=True)
            code=process.wait(timeout=10)
        if code:raise RuntimeError('Training failed; no automatic paid retry. Preserve saved23 and any complete new state.')
        result=json.loads((out/'CHECKPOINT_HANDOFF.json').read_text());result['seconds']=time.monotonic()-begin
        record_json(root/'TRAINING_RESULT.json',result);voices.commit();return result
    finally:
        if process.poll() is None:os.killpg(process.pid,signal.SIGKILL)
        voices.commit()

@app.function(image=image,gpu='H100:8',cpu=(16,16),memory=(655360,917504),ephemeral_disk=2097152,
              timeout=1800,retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def train_after_spend_limit_fix(auth):
    return train_one_male.local(auth,limit_recovery=True)

@app.function(image=image,gpu='H100:2',cpu=(8,8),memory=(131072,196608),timeout=480,retries=0,
              max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def listen(auth,manifest):
    import gc,hashlib,time,random,os,torch,numpy as np,soundfile as sf
    from fish_speech.models.text2semantic.inference import init_model,load_codec_model,decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt,generate_drama3
    from drama3_fullft.native_inference import native_checkpoint_routing
    from drama3_fullft.codec_contract import validate_cache
    from drama3_fullft.utterance_diagnostics import (completion_gate,
        frame_diagnostics, generation_status, trace_eos)
    from drama3_fullft.sampling_profiles import request_sampling
    # Traces must execute on each draw; no CUDA graph Python hooks or extra forwards.
    os.environ['FISH_DRAMA3_CUDA_GRAPH']='0'
    require_auth(auth);voices.reload();root=Path(ROOT);out=root/'listening';out.mkdir(exist_ok=True)
    for request in manifest['requests']:request_sampling(manifest,request)
    with (out/'STARTED.json').open('x') as f:json.dump({'time':time.time(),'automatic_retry':False},f)
    record_json(out/'manifest.json',manifest);voices.commit()
    rows={r['clip_id']:r for r in [json.loads(x) for x in (root/'data/recordings.jsonl').read_text().splitlines()]}
    ref=rows[manifest['reference_clip_id']]
    if ref['sha256']!=manifest['reference_sha256']:raise ValueError('Changed reference')
    contract=json.loads((root/'codes/codec_contract.json').read_text())
    codes=validate_cache(torch.load(root/'codes'/(ref['clip_id']+'.pt'),map_location='cpu',weights_only=True),ref['sha256'],contract)
    import shutil
    shutil.copy2(ref['audio_path'],out/'reference.wav')
    report={'items':[],'status':'loading','same_reference_tokens':True,'same_prompts_and_seeds':True,'audio_postprocessing':False}
    for arm,folder in [('source23',NATIVE23),('male10',NEW_NATIVE)]:
        weights=Path(folder)
        if not (weights/'VOLUME_COMMITTED.json').exists():raise ValueError('Uncommitted inference weights')
        with native_checkpoint_routing(weights) as routing:model,_=init_model(weights,'cuda:0,cuda:1',torch.bfloat16,compile=False)
        model.eval();codec=load_codec_model(weights/'codec.pth',str(model.device),torch.bfloat16).eval()
        for request in manifest['requests']:
            sampling_name,sampling=request_sampling(manifest,request)
            random.seed(request['seed']);np.random.seed(request['seed']);torch.manual_seed(request['seed']);torch.cuda.manual_seed_all(request['seed'])
            started=time.monotonic()
            with torch.inference_mode():
                prompt=build_drama3_prompt('<|speaker:0|>'+request['tagged_text'],model.tokenizer,model.config,
                    ['<|speaker:0|>'+manifest['reference_text']],[codes])
                with trace_eos(model,**sampling) as token_trace:
                    frames,finish=generate_drama3(model,prompt,max_new_tokens=request['max_new_tokens'],**sampling)
                if len(frames)==0:raise ValueError('Empty generated audio')
                token_summary=frame_diagnostics(frames,model.config.semantic_start_token_id)
                wave=decode_to_audio(frames[:,1:].T.contiguous().to(model.device),codec).float().cpu().numpy().squeeze()
            if wave.ndim!=1 or not len(wave) or not np.isfinite(wave).all():raise ValueError('Invalid waveform')
            name=arm+'_'+request['id']+'.wav';sf.write(out/name,wave,codec.sample_rate,subtype='FLOAT')
            token_file=arm+'_'+request['id']+'.frames.pt'
            torch.save(frames.cpu(),out/token_file)
            record_json(out/(arm+'_'+request['id']+'.eos.json'),token_trace)
            report['items'].append({**request,'sampling_profile':sampling_name,'sampling':sampling,'arm':arm,'file':name,'sample_rate':codec.sample_rate,'duration_seconds':len(wave)/codec.sample_rate,
                'finish_reason':finish,'truncated':finish!='eos','generation_seconds':time.monotonic()-started,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest(),
                'completion_check':completion_gate(request['text'],finish,duration=len(wave)/codec.sample_rate),
                'frame_diagnostics':token_summary,'raw_token_file':token_file,
                'raw_token_sha256':hashlib.sha256((out/token_file).read_bytes()).hexdigest()})
            report['status']='generating';record_json(out/'report.json',report);voices.commit();print('MALE_LISTEN',arm,request['id'],finish,flush=True)
        del model,codec,frames,wave,prompt;gc.collect();torch.cuda.empty_cache()
    report['status']=generation_status(report['items']);report['generation_complete']=True
    report['utterance_completeness_verified']=False # requires independent content check, even with EOS
    report['ready_for_serving']=False
    report['subjective_improvement_verified']=False
    record_json(out/'report.json',report);voices.commit();return report

@app.local_entrypoint()
def main(folder:str,phase:str):
    import subprocess,time,hashlib,zipfile,io
    root=Path(folder);auth=json.loads((root/'authorization.json').read_text());require_auth(auth)
    # Workspace rates have more precision than the rounded public per-second
    # display. Use the account's exact hourly figures for admission.
    cpu_rate=(4*.0473+320*.008)/3600
    feature_rate=(.8+4*.0473+24*.008)/3600
    train_rate=(8*3.95+16*.0473+896*.008)/3600
    listen_rate=(2*3.95+8*.0473+192*.008)/3600
    bounds={'export23':cpu_rate*1292,'features':feature_rate*1292,'train':train_rate*2322,
        'export_new':cpu_rate*1292,'listen':listen_rate*572,'finish_source23':cpu_rate*1192,
        'train_after_limit_fix':train_rate*1892}
    if phase not in bounds:raise ValueError('Unknown paid phase')
    dependencies={'train':['features','export23'],'train_after_limit_fix':['features','export23'],'export_new':['train'],'listen':['export23','export_new']}
    for needed in dependencies.get(phase,[]):
        if not (root/(needed+'_result.json')).exists():raise ValueError('Prerequisite phase not complete: '+needed)
    history=root/'phase-history';history.mkdir(exist_ok=True)
    ledger_path=root/'paid_ledger.json'
    def read_ledger():
        value=json.loads(ledger_path.read_text()) if ledger_path.exists() else {'phases':{}}
        for saved in history.glob('*.json'):value['phases'][saved.stem]=json.loads(saved.read_text())
        # Completed phases release their unused timeout reservation. Local
        # dispatch-to-result wall time includes container startup/queueing;
        # add10s beyond return for shutdown. This is a conservative resource
        # bound, never a claim of the final billed amount.
        rates={'export23':cpu_rate,'features':feature_rate,'export_new':cpu_rate,'listen':listen_rate,'train':train_rate,'finish_source23':cpu_rate,'train_after_limit_fix':train_rate}
        for key,state in value['phases'].items():
            if 'execution_elapsed_upper_usd' in state:
                state['upper_bound_usd']=state['execution_elapsed_upper_usd']
            result_file=root/(key+'_result.json')
            if result_file.exists() and key in rates:
                state['original_timeout_bound_usd']=state.get('original_timeout_bound_usd',state['upper_bound_usd'])
                state['upper_bound_usd']=state.get('execution_elapsed_upper_usd',max(0,result_file.stat().st_mtime-state['at']+10)*rates[key])
                if state.get('status','').startswith('stopped_'):state['readiness_completed_by_later_phase']=True
                else:state['status']='completed'
        return value
    ledger=read_ledger()
    if phase in ledger['phases']:raise ValueError('Already dispatched or unknown outcome; no automatic paid retry')
    bill=json.loads(subprocess.check_output(['/Users/johyeon-ung/GPT-SoVITS/venv/bin/modal','billing','summary','--json'],text=True))
    spent=float(bill['billed_cost'])-auth['net_billed_at_authorization']
    reserved=sum(v['upper_bound_usd'] for v in ledger['phases'].values())
    if max(spent,reserved)+bounds[phase]+.25>auth['new_job_cap_usd']:raise ValueError('Insufficient remaining budget; GPU not started')
    state={'upper_bound_usd':bounds[phase],'status':'dispatching','at':time.time()}
    # Per-phase exclusive records survive simultaneous independent preparation
    # clients; never lose a spend reservation through a shared-ledger overwrite.
    with (history/(phase+'.json')).open('x') as f:json.dump(state,f,indent=2)
    ledger['phases'][phase]=state;ledger_path.write_text(json.dumps(ledger,indent=2))
    try:
        if phase in ['export23','export_new']:result=export_native.remote(auth,'source23' if phase=='export23' else 'trained')
        elif phase=='finish_source23':
            result=finish_source23_native.remote(auth)
            (root/'export23_result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        elif phase=='features':
            plan=json.loads((root.parent/'stage/plan.json').read_text());zero=json.loads((root.parent/'stage/zero3.json').read_text())
            schedule=[json.loads(x) for x in (root.parent/'schedule.single-male-10.jsonl').read_text().splitlines()]
            result=prepare_features.remote(auth,(root/'bundle.zip').read_bytes(),plan,schedule,zero)
        elif phase=='train':result=train_one_male.remote(auth)
        elif phase=='train_after_limit_fix':
            if not (root/'SPEND_LIMIT_VERIFIED.json').exists():raise ValueError('Platform spend limit must be verified before reloading')
            result=train_after_spend_limit_fix.remote(auth)
            (root/'train_result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        else:result=listen.remote(auth,json.loads((root/'listening_manifest.json').read_text()))
        (root/(phase+'_result.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2))
        state['status']='completed';print('PAID_PHASE_COMPLETE',phase,flush=True)
    except BaseException:
        state['status']='failed_or_unknown_no_retry';raise
    finally:
        (history/(phase+'.json')).write_text(json.dumps(state,indent=2))
        ledger=read_ledger();ledger['phases'][phase]=state;ledger_path.write_text(json.dumps(ledger,indent=2))
