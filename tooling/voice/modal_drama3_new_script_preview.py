"""Bounded new-script comparison of existing23/male10 weights. Never trains."""
import json
from pathlib import Path
import modal
from modal_drama3_single_male import image, voices, ASSETS, SOURCE23, NEW_NATIVE
image=image.add_local_python_source('modal_drama3_single_male')

app=modal.App('miro-male-new-script-preview-v1-no-training')
ROOT='/voices/_drama3/miro-male-asmr-01-20261026-v1'
OUT=ROOT+'/new-script-compare-v1'
TEMP_NATIVE=OUT+'/temporary-native-source23'
CPU_RATE=(4*.0473+320*.008)/3600
GPU_RATE=(2*3.95+8*.0473+192*.008)/3600
BOUNDS={'export':CPU_RATE*1592,'generate':GPU_RATE*812}

def check_manifest(m):
    if m.get('training') is not False or m.get('comparison_cap_usd')!=4:
        raise ValueError('Only this bounded inference comparison is authorized')
    if len(m['requests'])!=2 or len({r['id'] for r in m['requests']})!=2:
        raise ValueError('Exactly two new scripts, no automatic retakes')
    if not m.get('reference_sha256') or m['sampling_profile']!='fish-space-untruncated-v1':
        raise ValueError('Missing explicit sampling or reference identity')
    for r in m['requests']:
        if r['max_new_tokens']!=384 or not r['text'] or not r['tagged_text']:
            raise ValueError('Changed preview size')

def write(path,value):
    from drama3_fullft.training_state import atomic_json
    atomic_json(path,value)

@app.function(image=image,cpu=(4,4),memory=(262144,327680),ephemeral_disk=2097152,
              timeout=1500,retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def export_source23(manifest):
    import time,torch
    from drama3_fullft.checkpoint_preview import export_checkpoint
    check_manifest(manifest);voices.reload();root=Path(OUT);root.mkdir(parents=True,exist_ok=True)
    with (root/'EXPORT_STARTED.json').open('x') as f:json.dump({'time':time.time(),'training':False,'automatic_retry':False},f)
    voices.commit();torch.set_num_threads(4)
    result=export_checkpoint(SOURCE23,ASSETS,TEMP_NATIVE,expected_step=23,require_independent_reload=False)
    voices.commit();write(Path(TEMP_NATIVE)/'VOLUME_COMMITTED.json',{'step':23,'time':time.time()})
    write(root/'EXPORT_RESULT.json',result);voices.commit();return result

@app.function(image=image,gpu='H100:2',cpu=(8,8),memory=(131072,196608),timeout=720,
              retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def generate(manifest):
    import gc,hashlib,os,random,shutil,time
    import numpy as np,torch,soundfile as sf
    from fish_speech.models.text2semantic.inference import init_model,load_codec_model,decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt,generate_drama3
    from drama3_fullft.native_inference import native_checkpoint_routing
    from drama3_fullft.codec_contract import validate_cache
    from drama3_fullft.sampling_profiles import sampling_profile
    from drama3_fullft.utterance_diagnostics import trace_eos,frame_diagnostics,completion_gate,generation_status
    check_manifest(manifest);os.environ['FISH_DRAMA3_CUDA_GRAPH']='0'
    voices.reload();out=Path(OUT);begin=time.monotonic()
    with (out/'GENERATE_STARTED.json').open('x') as f:json.dump({'time':time.time(),'training':False,'automatic_retry':False},f)
    write(out/'manifest.json',manifest);voices.commit()
    rows={r['clip_id']:r for r in map(json.loads,(Path(ROOT)/'data/recordings.jsonl').read_text().splitlines())}
    ref=rows[manifest['reference_clip_id']]
    if ref['sha256']!=manifest['reference_sha256']:raise ValueError('Reference changed')
    path=Path(ref['audio_path'])
    if hashlib.sha256(path.read_bytes()).hexdigest()!=ref['sha256']:raise ValueError('Reference waveform changed')
    contract=json.loads((Path(ROOT)/'codes/codec_contract.json').read_text())
    codes=validate_cache(torch.load(Path(ROOT)/'codes'/(ref['clip_id']+'.pt'),map_location='cpu',weights_only=True),ref['sha256'],contract)
    shutil.copy2(path,out/'reference.wav')
    report={'status':'loading','items':[],'training_updates':0,'same_reference':True,
            'same_scripts_seeds_sampling':True,'waveform_postprocessing':False,'automatic_paid_retry':False,
            'ready_for_serving':False,'reference_clip_id':ref['clip_id'],'sampling_profile':manifest['sampling_profile']}
    settings=sampling_profile(manifest['sampling_profile'])
    for arm,folder in [('source23',TEMP_NATIVE),('male10',NEW_NATIVE)]:
        weights=Path(folder)
        if not (weights/'VOLUME_COMMITTED.json').is_file():raise ValueError('Missing committed native model')
        load=time.monotonic()
        with native_checkpoint_routing(weights):model,_=init_model(weights,'cuda:0,cuda:1',torch.bfloat16,compile=False)
        model.eval();codec=load_codec_model(weights/'codec.pth',str(model.device),torch.bfloat16).eval()
        print('NEW_SCRIPT_LOADED',arm,round(time.monotonic()-load,2),flush=True)
        for request in manifest['requests']:
            if time.monotonic()-begin>660:raise TimeoutError('Save completed takes and stop; no automatic retry')
            random.seed(request['seed']);np.random.seed(request['seed']);torch.manual_seed(request['seed']);torch.cuda.manual_seed_all(request['seed'])
            started=time.monotonic()
            with torch.inference_mode():
                prompt=build_drama3_prompt('<|speaker:0|>'+request['tagged_text'],model.tokenizer,model.config,
                    ['<|speaker:0|>'+manifest['reference_text']],[codes])
                with trace_eos(model,**settings) as trace:
                    frames,finish=generate_drama3(model,prompt,max_new_tokens=request['max_new_tokens'],**settings)
                if not len(frames):raise ValueError('No generated frames')
                diagnostic=frame_diagnostics(frames,model.config.semantic_start_token_id)
                wave=decode_to_audio(frames[:,1:].T.contiguous().to(model.device),codec).float().cpu().numpy().squeeze()
            if wave.ndim!=1 or not len(wave) or not np.isfinite(wave).all():raise ValueError('Invalid waveform')
            prefix=arm+'_'+request['id'];filename=prefix+'.wav'
            sf.write(out/filename,wave,codec.sample_rate,subtype='FLOAT')
            torch.save(frames.cpu(),out/(prefix+'.frames.pt'));write(out/(prefix+'.eos.json'),trace)
            item={**request,'arm':arm,'file':filename,'sampling':settings,'sample_rate':codec.sample_rate,
                'duration_seconds':len(wave)/codec.sample_rate,'finish_reason':finish,
                'generation_seconds':time.monotonic()-started,'sha256':hashlib.sha256((out/filename).read_bytes()).hexdigest(),
                'raw_token_file':prefix+'.frames.pt','raw_token_sha256':hashlib.sha256((out/(prefix+'.frames.pt')).read_bytes()).hexdigest(),
                'frame_diagnostics':diagnostic,'completion_check':completion_gate(request['text'],finish,duration=len(wave)/codec.sample_rate)}
            report['items'].append(item);report['status']='generating';write(out/'report.json',report);voices.commit()
            print('NEW_SCRIPT_TAKE',arm,request['id'],finish,len(frames),flush=True)
        del model,codec,frames,wave,prompt;gc.collect();torch.cuda.empty_cache()
    report.update(status=generation_status(report['items']),seconds=time.monotonic()-begin,generation_complete=True,
                  subjective_improvement_verified=False,utterance_completeness_verified=False)
    write(out/'report.json',report);voices.commit();return report

@app.local_entrypoint()
def main(folder:str,phase:str):
    import subprocess,time
    root=Path(folder);manifest=json.loads((root/'manifest.json').read_text());check_manifest(manifest)
    if phase=='export_packaging_fix':bound=BOUNDS['export']
    elif phase in BOUNDS:bound=BOUNDS[phase]
    else:raise ValueError('No training or other phases')
    auth=json.loads((root.parent/'paid-stage-v1/authorization.json').read_text())
    if auth['new_job_cap_usd']!=30 or auth['net_billed_ceiling_this_authorization']!=128.07:
        raise ValueError('Do not expand the existing authorization')
    ledger=json.loads((root.parent/'paid-stage-v1/paid_ledger.json').read_text())
    previous_reserved=sum(x['upper_bound_usd'] for k,x in ledger['phases'].items() if k!='new_script_compare_v1')
    bill=json.loads(subprocess.check_output(['/Users/johyeon-ung/.miro/voice-venv/bin/modal','billing','summary','--json'],text=True))
    if max(float(bill['billed_cost'])-98.07,previous_reserved)+4+.25>30:
        raise ValueError('Not enough existing budget; no new spending authorized')
    (root/('billing-before-'+phase+'.json')).write_text(json.dumps(bill,indent=2))
    if phase=='generate' and not (root/'export_result.json').is_file():raise ValueError('Need committed source23 native')
    history=root/'phase-history';history.mkdir(exist_ok=True)
    prior=[json.loads(p.read_text()) for p in history.glob('*.json')]
    if sum(s['reserved_usd'] for s in prior)+bound+.15>4:
        raise ValueError('Comparison-only cap would be exceeded')
    state={'reserved_usd':bound,'status':'dispatching','time':time.time(),'no_automatic_retry':True}
    path=history/(phase+'.json')
    with path.open('x') as f:json.dump(state,f,indent=2)
    try:
        result=generate.remote(manifest) if phase=='generate' else export_source23.remote(manifest)
        (root/(phase+'_result.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2))
        if phase=='export_packaging_fix':(root/'export_result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        state['status']='completed';print('NEW_SCRIPT_PHASE_COMPLETE',phase,flush=True)
    except BaseException:
        state['status']='failed_or_unknown_no_retry';raise
    finally:
        state['ended_at']=time.time();path.write_text(json.dumps(state,indent=2))
