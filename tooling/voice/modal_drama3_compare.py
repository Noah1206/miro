"""Pinned Drama3 zero-shot actor007 comparison; never trains or deploys."""
import json
from pathlib import Path
import modal

SOURCE_REV='541566932abbaebcb0a40e562a1f846738383f38'
MODEL_REV='b2b5ee998034b2975720906c815e7fb0e9f007bd'
app=modal.App('miro-drama3-007-zero-shot')
cache=modal.Volume.from_name('miro-fish-drama3-cache',create_if_missing=True)
voices=modal.Volume.from_name('miro-voices')
download_image=modal.Image.debian_slim(python_version='3.12').pip_install('huggingface_hub','hf_xet').env({'HF_HOME':'/fishcache/huggingface'})
image=(modal.Image.debian_slim(python_version='3.12')
 .apt_install('git','ffmpeg','portaudio19-dev','libsox-dev','build-essential')
 .pip_install('torch==2.8.0','torchaudio==2.8.0',index_url='https://download.pytorch.org/whl/cu128')
 .pip_install('uv')
 .run_commands(f'git clone --filter=blob:none https://github.com/fishaudio/fish-speech.git /fish-speech && git -C /fish-speech checkout {SOURCE_REV}')
 .workdir('/fish-speech')
 .run_commands("python -c \"from pathlib import Path; Path('/tmp/fish-overrides.txt').write_text('protobuf>=3.20.0,<6.0.0\\n')\"",
               'uv pip install --system --override /tmp/fish-overrides.txt -e . --extra-index-url https://download.pytorch.org/whl/cu128 --index-strategy unsafe-best-match')
 .pip_install('faster-whisper==1.2.1','resemblyzer==0.1.4','tensorboard==2.19.0')
 .run_commands('python -c "from fish_speech.models.dac.modded_dac import DAC"')
 .env({'HF_HOME':'/fishcache/huggingface','PYTHONUNBUFFERED':'1','TOKENIZERS_PARALLELISM':'false','FISH_DRAMA3_FP8_EXPERTS':'1',
       'LD_LIBRARY_PATH':'/usr/local/lib/python3.12/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.12/site-packages/nvidia/cudnn/lib'}))


@app.function(image=download_image,memory=8192,timeout=1200,retries=0,volumes={'/fishcache':cache})
def download():
    import hashlib
    from huggingface_hub import snapshot_download
    folder=snapshot_download('fishaudio/drama-3',revision=MODEL_REV,max_workers=4)
    files=[p for p in Path(folder).iterdir() if p.is_file()]
    license_text=(Path(folder)/'LICENSE').read_text()
    assert 'FISH AUDIO COMMUNITY LICENSE' in license_text
    config=json.loads((Path(folder)/'config.json').read_text());assert config['model_type']=='fish_omni'
    result={'folder':folder,'revision':MODEL_REV,'bytes':sum(p.stat().st_size for p in files),'files':[p.name for p in files],'license_sha256':hashlib.sha256(license_text.encode()).hexdigest()}
    cache.commit();print('DRAMA_WEIGHTS_READY',result,flush=True);return result


@app.function(image=image,gpu='H100',memory=65536,timeout=2400,retries=0,volumes={'/fishcache':cache,'/voices':voices})
def compare(manifest,weights,reference,baseline):
    import gc,hashlib,os,random,re,time,traceback,zipfile
    import numpy as np,torch,soundfile as sf
    from fish_speech.models.text2semantic.inference import init_model,load_codec_model,encode_audio,decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt,generate_drama3
    cache.reload();voices.reload();out=Path('/voices')/manifest['remote_output'];out.mkdir(parents=True,exist_ok=True)
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));(out/'007_reference.wav').write_bytes(reference);(out/'baseline_qwen_clone.wav').write_bytes(baseline)
    assert hashlib.sha256(reference).hexdigest()==manifest['reference_sha256'];assert hashlib.sha256(baseline).hexdigest()==manifest['baseline_sha256']
    report={'status':'loading','model':'fishaudio/drama-3','model_revision':MODEL_REV,'source_commit':SOURCE_REV,'training':False,'gpu':torch.cuda.get_device_name(),'items':[],'errors':[],'weights':weights,'production_changed':False,'commercial_eligibility':manifest['commercial_eligibility'],'waveform_postprocessing':False}
    def status(value):
        report['status']=value;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));voices.commit();print('DRAMA_STATUS',value,len(report['items']),flush=True)
    try:
        status('loading')
        begin=time.monotonic();model,_=init_model(Path(weights['folder']),'cuda:0',torch.bfloat16,compile=False);model.eval();report['model_load_seconds']=time.monotonic()-begin
        codec=load_codec_model(Path(weights['folder'])/'codec.pth','cuda:0',torch.bfloat16)
        ref_codes=encode_audio(out/'007_reference.wav',codec,'cuda:0').cpu();report['reference_codec_shape']=list(ref_codes.shape);report['reference_codec_sha256']=hashlib.sha256(ref_codes.numpy().tobytes()).hexdigest()
        ref_text=manifest['reference_text'];max_frames=manifest['settings']['max_new_tokens']
        settings=manifest['settings'];requests=[{'id':'neutral','tagged_text':manifest['text'],'context':'no acting direction','seed':1234}]
        for item in manifest['contexts']:
            for seed in manifest['seeds']:requests.append({**item,'seed':seed})
        for request in requests:
            random.seed(request['seed']);np.random.seed(request['seed']);torch.manual_seed(request['seed']);torch.cuda.manual_seed_all(request['seed'])
            with torch.inference_mode():
                prompt=build_drama3_prompt(request['tagged_text'],model.tokenizer,model.config,[ref_text],[ref_codes])
                start=time.monotonic();frames,finish=generate_drama3(model,prompt,max_new_tokens=max_frames,temperature=settings['temperature'],top_k=settings['top_k'],top_p=settings['top_p']);generation=time.monotonic()-start
                if len(frames)==0:raise RuntimeError('Drama3 emitted no audio for '+request['id'])
                codes=frames[:,1:].T.contiguous().to('cuda:0');wave=decode_to_audio(codes,codec).float().cpu().numpy();sr=codec.sample_rate
            if not len(wave) or not np.isfinite(wave).all():raise RuntimeError('Invalid waveform')
            file=f"{request['id']}_s{request['seed']}.wav";sf.write(out/file,wave,sr,subtype='FLOAT')
            report['items'].append({'file':file,'id':request['id'],'text':manifest['text'],'seed':request['seed'],'tagged_text':request['tagged_text'],'scene':request.get('scene'),'previous_dialogue':request.get('previous_dialogue'),'sr':sr,'duration_seconds':len(wave)/sr,'generated_frames':len(frames),'finish_reason':finish,'truncated':finish!='eos','prompt_rows':len(prompt),'reference_count':1,'reference_frames':ref_codes.shape[-1],'generation_seconds':generation,'rtf_native':generation/(len(wave)/sr),'sha256':hashlib.sha256((out/file).read_bytes()).hexdigest()});status('generating')
        report['peak_gpu_gib']=torch.cuda.max_memory_allocated()/2**30
        del model,codec,frames,codes;gc.collect();torch.cuda.empty_cache();status('auditing')
        import librosa
        from faster_whisper import WhisperModel
        from resemblyzer import VoiceEncoder,preprocess_wav
        asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/fishcache/asr');speaker=VoiceEncoder(device='cpu',verbose=False);reference_embedding=speaker.embed_utterance(preprocess_wav(out/'007_reference.wav'));audits=[]
        for item in [{'file':'baseline_qwen_clone.wav'},*report['items']]:
            file=item['file'];audio,audio_sr=sf.read(out/file);audio=librosa.resample(audio.astype(np.float32),orig_sr=audio_sr,target_sr=16000);segments,_=asr.transcribe(audio,language='ko',beam_size=5,vad_filter=False);hyp=' '.join(s.text.strip() for s in segments);a=re.sub('[^가-힣]','',manifest['text']);b=re.sub('[^가-힣]','',hyp);d=list(range(len(b)+1))
            for i,ca in enumerate(a,1):
                prev,d[0]=d[0],i
                for j,cb in enumerate(b,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(ca!=cb))
            y,sr=sf.read(out/file);frame=round(sr*.02);n=len(y)//frame;db=20*np.log10(np.sqrt(np.mean(y[:n*frame].reshape(n,frame)**2,axis=1))+1e-10);active=db>np.percentile(db,95)-30
            audits.append({'file':file,'transcript':hyp,'cer':d[-1]/max(1,len(a)),'unexpected_english_words':re.findall('[A-Za-z]{2,}',hyp),'speaker_similarity_to_reference':float(np.dot(reference_embedding,speaker.embed_utterance(preprocess_wav(out/file)))),'duration_seconds':len(y)/sr,'peak':float(np.abs(y).max()),'active_seconds':float(active.sum()*.02),'active_rate_syllables_per_second':len(a)/max(.02,active.sum()*.02),'speech_rms_median_dbfs':float(np.median(db[active])),'speech_energy_p90_p10_db':float(np.percentile(db[active],90)-np.percentile(db[active],10))})
        (out/'audit.json').write_text(json.dumps(audits,ensure_ascii=False,indent=2));status('complete')
    except Exception:
        report['errors'].append(traceback.format_exc());status('failed');raise
    finally:
        with zipfile.ZipFile(out/'results.zip','w',zipfile.ZIP_DEFLATED) as z:
            for f in out.iterdir():
                if f.is_file() and f.name!='results.zip':z.write(f,f.name)
        voices.commit();cache.commit()
    return report


@app.function(image=image,gpu='L4',memory=16384,timeout=900,retries=0,volumes={'/fishcache':cache,'/voices':voices})
def audit_existing(manifest):
    import re,zipfile
    import librosa,numpy as np,soundfile as sf
    from faster_whisper import WhisperModel
    from resemblyzer import VoiceEncoder,preprocess_wav
    voices.reload();cache.reload();out=Path('/voices')/manifest['remote_output']
    report=json.loads((out/'report.json').read_text());assert len(report['items'])==7
    asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/fishcache/asr')
    speaker=VoiceEncoder(device='cpu',verbose=False);ref=speaker.embed_utterance(preprocess_wav(out/'007_reference.wav'));audits=[]
    for item in [{'file':'baseline_qwen_clone.wav'},*report['items']]:
        file=item['file'];y,sr=sf.read(out/file)
        audio=librosa.resample(y.astype(np.float32),orig_sr=sr,target_sr=16000)
        segments,_=asr.transcribe(audio,language='ko',beam_size=5,vad_filter=False);hyp=' '.join(s.text.strip() for s in segments)
        a=re.sub('[^가-힣]','',manifest['text']);b=re.sub('[^가-힣]','',hyp);d=list(range(len(b)+1))
        for i,ca in enumerate(a,1):
            prev,d[0]=d[0],i
            for j,cb in enumerate(b,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(ca!=cb))
        frame=round(sr*.02);n=len(y)//frame;db=20*np.log10(np.sqrt(np.mean(y[:n*frame].reshape(n,frame)**2,axis=1))+1e-10);active=db>np.percentile(db,95)-30
        audits.append({'file':file,'transcript':hyp,'cer':d[-1]/max(1,len(a)),'unexpected_english_words':re.findall('[A-Za-z]{2,}',hyp),'speaker_similarity_to_reference':float(np.dot(ref,speaker.embed_utterance(preprocess_wav(out/file)))),'duration_seconds':len(y)/sr,'peak':float(np.abs(y).max()),'active_seconds':float(active.sum()*.02),'active_rate_syllables_per_second':len(a)/max(.02,active.sum()*.02),'speech_rms_median_dbfs':float(np.median(db[active])),'speech_energy_p90_p10_db':float(np.percentile(db[active],90)-np.percentile(db[active],10))})
        print('AUDITED',file,hyp,flush=True)
    (out/'audit.json').write_text(json.dumps(audits,ensure_ascii=False,indent=2))
    report['status']='complete';report['generation_completed']=True;report['audit_recovery']='Read existing WAVs as16kHz arrays to bypass incompatible PyAV19 metadata_errors argument; no synthesis repeated.'
    (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    with zipfile.ZipFile(out/'results.zip','w',zipfile.ZIP_DEFLATED) as z:
        for f in out.iterdir():
            if f.is_file() and f.name!='results.zip':z.write(f,f.name)
    voices.commit();cache.commit();return report


@app.local_entrypoint()
def main(folder:str,audit_only:bool=False):
    if audit_only:
        p=Path(folder);result=audit_existing.remote(json.loads((p/'manifest.json').read_text()));(p/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(result['status']);return
    p=Path(folder);manifest=json.loads((p/'manifest.json').read_text());weights=download.remote();(p/'weights.json').write_text(json.dumps(weights,indent=2))
    result=compare.remote(manifest,weights,Path(manifest['reference_local']).read_bytes(),Path(manifest['baseline_local']).read_bytes());(p/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(result['status'])
