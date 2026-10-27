"""Identical prompts/seeds/reference for actual pretrained+two real Full FT checkpoints."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,cache,voices,MODEL_REV
image=base_image.env({'FISH_DRAMA3_FP8_EXPERTS':'0'}).add_local_python_source('drama3_fullft','modal_drama3_compare')
app=modal.App('miro-drama3-real35b-listening-ab')
RUN_ROOT='/voices/_drama3/fullsize-ab-007-20261023-v1'
DATA_ROOT='/voices/_drama3/korean-teacher-007-20261023'


@app.function(image=image,gpu='H100:2',cpu=(8,8),memory=(131072,196608),timeout=480,retries=0,
              max_containers=1,scaledown_window=2,volumes={'/fishcache':cache,'/voices':voices})
def generate(arm,manifest,run_root=RUN_ROOT,weights_override=None,expected_step=None):
    import hashlib,random,time,traceback,gc,shutil,os
    import torch,numpy as np,soundfile as sf
    from fish_speech.models.text2semantic.inference import init_model,load_codec_model,decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt,generate_drama3
    from drama3_fullft.codec_contract import validate_cache,file_sha256
    assert arm in ['original','baseline','korean_teacher']
    voices.reload();cache.reload();root=Path(run_root);out=root/'listening'/arm;out.mkdir(parents=True,exist_ok=True)
    original=Path('/fishcache/huggingface/hub/models--fishaudio--drama-3/snapshots')/MODEL_REV
    weights=original if arm=='original' else root/'arms'/arm/'model'
    if weights_override is not None:weights=Path(weights_override)
    if arm!='original':assert (weights/'EXPORT_COMPLETE.json').exists(),'Wait for complete actual35B trained export'
    digest=hashlib.sha256(json.dumps(manifest,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    if (out/'report.json').exists():
        previous=json.loads((out/'report.json').read_text());assert previous['manifest_sha256']==digest
        if previous['status']=='complete':return previous
    if expected_step is not None or 'fullsize-ko-007-20261024-step5-preview' in run_root:
        # A platform container restart must not repeat this budgeted GPU call.
        with (out/'GENERATION_STARTED.json').open('x') as marker:
            marker.write(json.dumps({'automatic_paid_retry':False,'time':time.time()}))
        native_metadata=json.loads((weights/'MIRO_TRAINING.json').read_text())
        assert native_metadata['steps_completed']==(expected_step if expected_step is not None else 5) and native_metadata['inference_export_only']
        assert (weights/'VOLUME_COMMITTED.json').is_file()
        voices.commit()
    report={'status':'loading','arm':arm,'model_path':str(weights),'manifest_sha256':digest,'items':[],'errors':[],
            'real35b_checkpoint':True,'precision':'bfloat16','fp8_experts':False,'reference_id':manifest['reference_clip_id'],
            'same_reference_tokens_all_models':True,'waveform_postprocessing':False,'production_changed':False}
    def save(status):
        report['status']=status;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));voices.commit();print('REAL35B_LISTEN',arm,status,len(report['items']),flush=True)
    try:
        (root/'listening/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
        reference=Path(DATA_ROOT)/'data/wavs'/(manifest['reference_clip_id']+'.wav')
        assert hashlib.sha256(reference.read_bytes()).hexdigest()==manifest['reference_sha256']
        shutil.copy2(reference,root/'listening/reference.wav')
        contract=json.loads((Path(DATA_ROOT)/'codes/codec_contract.json').read_text())
        codes=validate_cache(torch.load(Path(DATA_ROOT)/'codes'/(manifest['reference_clip_id']+'.pt'),weights_only=True),manifest['reference_sha256'],contract)
        from drama3_fullft.native_inference import native_checkpoint_routing
        begin=time.monotonic()
        with native_checkpoint_routing(weights) as routing:
            model,_=init_model(weights,'cuda:0,cuda:1',torch.bfloat16,compile=False)
        model.eval();report['native_loader_routing']=routing
        report['model_load_seconds']=time.monotonic()-begin
        # Native exports carry the exact frozen codec; public cache may be empty.
        codec_path=weights/'codec.pth'
        assert file_sha256(codec_path)==contract['codec_file_sha256']
        codec=load_codec_model(codec_path,str(model.device),torch.bfloat16).eval()
        for request in manifest['requests']:
            seed=request['seed'];random.seed(seed);np.random.seed(seed);torch.manual_seed(seed);torch.cuda.manual_seed_all(seed)
            with torch.inference_mode():
                prompt=build_drama3_prompt('<|speaker:0|>'+request['tagged_text'],model.tokenizer,model.config,
                    ['<|speaker:0|>'+manifest['reference_text']],[codes])
                start=time.monotonic();frames,finish=generate_drama3(model,prompt,max_new_tokens=request['max_new_tokens'],
                    temperature=manifest['settings']['temperature'],top_p=manifest['settings']['top_p'],top_k=manifest['settings']['top_k'])
                if len(frames)==0:raise RuntimeError('No generated frames')
                wave=decode_to_audio(frames[:,1:].T.contiguous().to(model.device),codec).float().cpu().numpy().squeeze()
            if wave.ndim!=1 or not len(wave) or not np.isfinite(wave).all():raise RuntimeError('Invalid generated audio')
            name=f"{request['id']}_s{seed}.wav";sf.write(out/name,wave,codec.sample_rate,subtype='FLOAT')
            report['items'].append({**request,'file':name,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest(),
                'sample_rate':codec.sample_rate,'seconds':len(wave)/codec.sample_rate,'generated_frames':len(frames),'finish_reason':finish,
                'truncated':finish!='eos','generation_seconds':time.monotonic()-start,'peak':float(np.abs(wave).max())})
            save('generating')
        report['peak_gpu_gib_device0']=torch.cuda.max_memory_allocated(0)/2**30;report['peak_gpu_gib_device1']=torch.cuda.max_memory_allocated(1)/2**30
        save('complete');return report
    except Exception:
        report['errors'].append(traceback.format_exc());save('failed');raise


@app.function(image=image,gpu='L4',cpu=4,memory=24576,timeout=1800,retries=0,
              volumes={'/fishcache':cache,'/voices':voices})
def audit_and_package(manifest):
    import re,hashlib,shutil,zipfile
    import numpy as np,librosa,soundfile as sf
    from faster_whisper import WhisperModel
    from resemblyzer import VoiceEncoder
    from resemblyzer.audio import normalize_volume
    voices.reload();cache.reload();root=Path(RUN_ROOT);out=root/'listening';rows=[]
    comparison=json.loads((root/'training_comparison.json').read_text())
    arms=comparison.get('listening_arms',['original','baseline','korean_teacher'])
    assert len(arms)==len(set(arms)) and 'original' in arms and len(arms)>=2
    assert all(arm in ['original','baseline','korean_teacher'] for arm in arms)
    reports={arm:json.loads((out/arm/'report.json').read_text()) for arm in arms}
    assert all(x['status']=='complete' and len(x['items'])==len(manifest['requests']) for x in reports.values())
    assert len({x['manifest_sha256'] for x in reports.values()})==1
    encoder=VoiceEncoder(device='cpu',verbose=False);asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/fishcache/asr')
    def read16(path):
        y,sr=sf.read(path);return librosa.resample(y.astype(np.float32),orig_sr=sr,target_sr=16000)
    def embed(y):return encoder.embed_utterance(normalize_volume(y,-30,increase_only=True))
    ref=embed(read16(out/'reference.wav'))
    def error_rate(expected,hyp):
        norm=lambda x:re.sub('[^가-힣]','',x);a=norm(expected);b=norm(hyp);d=list(range(len(b)+1))
        for i,ca in enumerate(a,1):
            prev,d[0]=d[0],i
            for j,cb in enumerate(b,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(ca!=cb))
        return d[-1]/max(1,len(a))
    for arm,report in reports.items():
        for item in report['items']:
            path=out/arm/item['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256'];y=read16(path)
            segments,_=asr.transcribe(y,language='ko',beam_size=5,vad_filter=False,condition_on_previous_text=False)
            hyp=' '.join(segment.text.strip() for segment in segments)
            n=len(y)//320;db=20*np.log10(np.sqrt(np.mean(y[:n*320].reshape(n,320)**2,axis=1))+1e-10);active=db>np.percentile(db,95)-30
            f0,voiced,_=librosa.pyin(y,fmin=70,fmax=900,sr=16000,frame_length=1024,hop_length=160)
            valid=f0[np.isfinite(f0)];span=float(12*np.log2(np.percentile(valid,95)/np.percentile(valid,5))) if len(valid)>10 else None
            rows.append({'arm':arm,'id':item['id'],'seed':item['seed'],'file':arm+'/'+item['file'],'text':item['text'],
                'transcript':hyp,'cer':error_rate(item['text'],hyp),'speaker_cosine':float(np.dot(ref,embed(y))),
                'duration_seconds':len(y)/16000,'relative_pause_ratio':float(1-active.mean()),
                'active_rms_median_dbfs':float(np.median(db[active])) if active.any() else None,
                'energy_p90_p10_db':float(np.percentile(db[active],90)-np.percentile(db[active],10)) if active.any() else None,
                'f0_span_semitones_voiced_only':span,'voiced_fraction_pyin':float(voiced.mean()),'truncated':item['truncated']})
            (out/'audit.json').write_text(json.dumps({'items':rows,'complete':False},ensure_ascii=False,indent=2));print('REAL35B_AUDIT',arm,item['id'],item['seed'],hyp,flush=True)
    real=out/'real_recordings';real.mkdir(exist_ok=True)
    for request in manifest['requests']:
        if request.get('source_clip_id'):
            source=Path(DATA_ROOT)/'data/wavs'/(request['source_clip_id']+'.wav');shutil.copy2(source,real/source.name)
    result={'complete':True,'arms':arms,'items':rows,'isolates_teacher_effect':comparison.get('isolates_teacher_effect',True),'notes':['ASR CER is a recognizer proxy, not human pronunciation or naturalness score.',
            'Speaker cosine is sensitive to whisper phonation and not identity certification.',
            'F0 is voiced-only; it is not a whisper-quality score. Relative pause threshold is P95 minus30dB.',
            'No time/pitch/gain postprocessing. All predeclared takes are published. Human acting preference not measured.']}
    (out/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    shutil.copy2(root/'training_comparison.json',out/'training_comparison.json')
    with zipfile.ZipFile(out/'results.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for path in out.rglob('*'):
            if path.is_file() and path.name!='results.zip':archive.write(path,path.relative_to(out))
    voices.commit();cache.commit();return result


@app.local_entrypoint()
def main(folder:str,arm:str='all',run_root:str=RUN_ROOT,weights_override:str=''):
    root=Path(folder);manifest=json.loads((root/'manifest.json').read_text())
    if arm=='audit':
        result=audit_and_package.remote(manifest);(root/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('REAL35B_AUDIT_COMPLETE');return
    arms=json.loads((root/'training_comparison.json').read_text()).get('listening_arms',['original','baseline','korean_teacher']) if arm=='all' else [arm]
    for name in arms:
        report=generate.remote(name,manifest,run_root,weights_override or None);(root/(name+'_generation.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2));print('REAL35B_AUDIO_GENERATED',name)
