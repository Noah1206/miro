"""Zero-shot long-form/whisper comparison. No training and no deployment."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as fish_image, cache as fish_cache, voices, SOURCE_REV, MODEL_REV
from modal_three_tts_compare import qwen_image, cache as qwen_cache

app=modal.App('miro-drama3-long-whisper-007')
fish_image=fish_image.add_local_python_source('modal_drama3_compare','modal_three_tts_compare')
qwen_image=qwen_image.add_local_python_source('modal_drama3_compare','modal_three_tts_compare')


def archive(out):
    import zipfile
    with zipfile.ZipFile(out/'results.zip','w',zipfile.ZIP_DEFLATED) as z:
        for f in out.iterdir():
            if f.is_file() and f.name!='results.zip':z.write(f,f.name)
    voices.commit()


@app.function(image=fish_image,gpu='H100',memory=65536,timeout=1800,retries=0,volumes={'/fishcache':fish_cache,'/voices':voices})
def drama(manifest,reference):
    import hashlib,random,time,traceback
    import numpy as np,torch,soundfile as sf
    from fish_speech.models.text2semantic.inference import init_model,load_codec_model,encode_audio,decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt,generate_drama3
    fish_cache.reload();voices.reload();out=Path('/voices')/manifest['remote_output']/'drama';out.mkdir(parents=True,exist_ok=True)
    (out/'reference.wav').write_bytes(reference);assert hashlib.sha256(reference).hexdigest()==manifest['reference_sha256']
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    report={'status':'loading','engine':'Drama3','revision':MODEL_REV,'source_commit':SOURCE_REV,'training':False,'gpu':torch.cuda.get_device_name(),'items':[],'errors':[],'waveform_postprocessing':False,'context_input':'explicit inline acting directions derived from scenes; raw dialogue not passed'}
    def status(value):
        report['status']=value;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));voices.commit();print('DRAMA_EXTENDED',value,len(report['items']),flush=True)
    try:
        status('loading');weights=Path('/fishcache/huggingface/hub/models--fishaudio--drama-3/snapshots')/MODEL_REV
        assert (weights/'codec.pth').exists(),'Expected cached weights are missing'
        start=time.monotonic();model,_=init_model(weights,'cuda:0',torch.bfloat16,compile=False);model.eval();report['load_seconds']=time.monotonic()-start
        codec=load_codec_model(weights/'codec.pth','cuda:0',torch.bfloat16)
        with torch.inference_mode():ref=encode_audio(out/'reference.wav',codec,'cuda:0').cpu()
        for request in manifest['requests']:
            seed=request['seed'];random.seed(seed);np.random.seed(seed);torch.manual_seed(seed);torch.cuda.manual_seed_all(seed)
            with torch.inference_mode():
                prompt=build_drama3_prompt(request['tagged_text'],model.tokenizer,model.config,[manifest['reference_text']],[ref])
                begin=time.monotonic();frames,finish=generate_drama3(model,prompt,**manifest['drama_settings']);elapsed=time.monotonic()-begin
                assert len(frames)>0,'No audio frames'
                codes=frames[:,1:].T.contiguous().to('cuda:0');y=decode_to_audio(codes,codec).float().cpu().numpy();sr=codec.sample_rate
            assert len(y)>0 and np.isfinite(y).all()
            name=f"{request['id']}_s{seed}.wav";sf.write(out/name,y,sr,subtype='FLOAT')
            report['items'].append({**request,'engine':'Drama3','file':name,'sr':sr,'duration_seconds':len(y)/sr,'finish_reason':finish,'truncated':finish!='eos','frames':len(frames),'generation_seconds':elapsed,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()});status('generating')
        report['peak_gpu_gib']=torch.cuda.max_memory_allocated()/2**30;status('complete')
    except Exception:
        report['errors'].append(traceback.format_exc());status('failed');raise
    finally:archive(out)
    return report


@app.function(image=qwen_image,gpu='L4',memory=16384,timeout=1200,retries=0,volumes={'/cache':qwen_cache,'/voices':voices})
def qwen(manifest,reference):
    import hashlib,random,time,traceback
    import numpy as np,torch,soundfile as sf
    from huggingface_hub import snapshot_download
    from qwen_tts import Qwen3TTSModel
    voices.reload();out=Path('/voices')/manifest['remote_output']/'qwen';out.mkdir(parents=True,exist_ok=True)
    (out/'reference.wav').write_bytes(reference);assert hashlib.sha256(reference).hexdigest()==manifest['reference_sha256']
    report={'status':'loading','engine':'Qwen1.7B Base ICL','training':False,'existing_model_unchanged':True,'fresh_inference_for_new_text':True,'revision':'fd4b254389122332181a7c3db7f27e918eec64e3','items':[],'errors':[],'acting_directions':False}
    def status(value):
        report['status']=value;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));voices.commit();print('QWEN_BASELINE',value,len(report['items']),flush=True)
    try:
        status('loading');base=snapshot_download('Qwen/Qwen3-TTS-12Hz-1.7B-Base',revision=report['revision']);qwen_cache.commit()
        model=Qwen3TTSModel.from_pretrained(base,device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
        for seed in manifest['seeds']:
            random.seed(seed);np.random.seed(seed);torch.manual_seed(seed);torch.cuda.manual_seed_all(seed);begin=time.monotonic()
            wavs,sr=model.generate_voice_clone(text=manifest['text'],language='Korean',ref_audio=str(out/'reference.wav'),ref_text=manifest['reference_text'],max_new_tokens=900)
            y=np.asarray(wavs[0],dtype=np.float32);assert len(y)>0 and np.isfinite(y).all()
            name=f'qwen_clone_s{seed}.wav';sf.write(out/name,y,sr,subtype='FLOAT')
            report['items'].append({'engine':'Qwen1.7B Base ICL','id':'qwen_clone','file':name,'seed':seed,'text':manifest['text'],'sr':sr,'duration_seconds':len(y)/sr,'generation_seconds':time.monotonic()-begin,'token_limit_suspected':len(y)/sr>=73,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()});status('generating')
        status('complete')
    except Exception:
        report['errors'].append(traceback.format_exc());status('failed');raise
    finally:archive(out)
    return report


@app.function(image=fish_image,gpu='L4',memory=16384,timeout=900,retries=0,volumes={'/fishcache':fish_cache,'/voices':voices})
def audit(manifest):
    import re,hashlib
    import numpy as np,librosa,soundfile as sf
    from faster_whisper import WhisperModel
    from resemblyzer import VoiceEncoder
    from resemblyzer.audio import normalize_volume
    voices.reload();fish_cache.reload();root=Path('/voices')/manifest['remote_output'];out=root/'audit';out.mkdir(exist_ok=True)
    asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/fishcache/asr')
    encoder=VoiceEncoder(device='cpu',verbose=False)
    def embedding(y,sr):
        audio=librosa.resample(y.astype(np.float32),orig_sr=sr,target_sr=16000)
        return encoder.embed_utterance(normalize_volume(audio,-30,increase_only=True))
    ry,rs=sf.read(root/'drama/reference.wav');ref=embedding(ry.astype(np.float32),rs);rows=[]
    expected=re.sub('[^가-힣]','',manifest['text'])
    for engine in ['qwen','drama']:
        report=json.loads((root/engine/'report.json').read_text());assert report['status']=='complete'
        for item in report['items']:
            path=root/engine/item['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256']
            y,sr=sf.read(path);audio=librosa.resample(y.astype(np.float32),orig_sr=sr,target_sr=16000)
            segments,_=asr.transcribe(audio,language='ko',beam_size=5,vad_filter=False,word_timestamps=True);segs=list(segments)
            hyp=' '.join(s.text.strip() for s in segs);observed=re.sub('[^가-힣]','',hyp);d=list(range(len(observed)+1))
            for i,a in enumerate(expected,1):
                prev,d[0]=d[0],i
                for j,b in enumerate(observed,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(a!=b))
            words=[{'word':w.word,'start':w.start,'end':w.end,'probability':w.probability} for s in segs for w in s.words]
            n=320;db=20*np.log10(np.sqrt(np.mean(audio[:len(audio)//n*n].reshape(-1,n)**2,axis=1))+1e-10);active=db>np.percentile(db,95)-30
            windows=[]
            for label,pos in [('beginning',0),('middle',max(0,len(audio)//2-48000)),('end',max(0,len(audio)-96000))]:
                clip=audio[pos:pos+96000]
                windows.append({'position':label,'start_seconds':pos/16000,'end_seconds':(pos+len(clip))/16000,'ref_cosine':float(np.dot(ref,embedding(clip,16000)))})
            rows.append({'engine':engine,'file':item['file'],'id':item['id'],'seed':item['seed'],'text':manifest['text'],'transcript':hyp,'cer':d[-1]/len(expected),'unexpected_english_words':re.findall('[A-Za-z]{2,}',hyp),'duration_seconds':len(y)/sr,'peak':float(np.abs(y).max()),'active_seconds':float(active.sum()*.02),'active_rate_syllables_per_second':len(expected)/max(.02,active.sum()*.02),'speech_rms_median_dbfs':float(np.median(db[active])),'speaker_similarity':float(np.dot(ref,embedding(audio,16000))),'speaker_windows':windows,'words':words,'estimated_word_gaps_over_250ms':[{'after':a['word'],'seconds':b['start']-a['end']} for a,b in zip(words,words[1:]) if b['start']-a['end']>.25]})
            print('AUDIT',engine,item['file'],'CER',d[-1]/len(expected),hyp,flush=True)
    result={'items':rows,'speaker_method':'Resemblyzer utterance/window cosine, no silence trimming for every model/reference; proxy sensitive to whisper phonation, not identity certification','asr_method':'large-v3-turbo ko beam5;16kHz float array avoids PyAV incompatibility','emotion_verified':False,'whisper_verified_by_listening':False}
    (out/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));archive(out);fish_cache.commit();return result


@app.local_entrypoint()
def main(folder:str,engine:str='drama'):
    p=Path(folder);m=json.loads((p/'manifest.json').read_text())
    if engine=='external-audit':result=audit_external.remote(m)
    elif engine=='verify':result=verify_asr.remote(m)
    elif engine=='audit':result=audit.remote(m)
    else:
        ref=Path(m['reference_local']).read_bytes();result=({'drama':drama,'qwen':qwen}[engine]).remote(m,ref)
    (p/f'{engine}_report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('DONE',engine)


@app.function(image=fish_image,gpu='L4',memory=16384,timeout=600,retries=0,volumes={'/fishcache':fish_cache,'/voices':voices})
def verify_asr(manifest):
    import re
    import numpy as np,librosa,soundfile as sf
    from faster_whisper import WhisperModel
    voices.reload();root=Path('/voices')/manifest['remote_output'];out=root/'audit';result=json.loads((out/'audit.json').read_text())
    asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/fishcache/asr');norm=lambda s:re.sub('[^가-힣]','',s)
    def cer(hyp):
        a=norm(manifest['text']);b=norm(hyp);d=list(range(len(b)+1))
        for i,ca in enumerate(a,1):
            prev,d[0]=d[0],i
            for j,cb in enumerate(b,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(ca!=cb))
        return d[-1]/len(a)
    for row in result['items']:
        if row['cer']<=.05:continue
        y,sr=sf.read(root/row['engine']/row['file']);a=librosa.resample(y.astype(np.float32),orig_sr=sr,target_sr=16000);checks=[]
        for vad in [True,False]:
            segs,_=asr.transcribe(a,language='ko',beam_size=5,vad_filter=vad,condition_on_previous_text=False,word_timestamps=False);hyp=' '.join(s.text.strip() for s in segs);checks.append({'vad_filter':vad,'word_timestamps':False,'condition_on_previous_text':False,'transcript':hyp,'cer':cer(hyp)})
        row['asr_rechecks']=checks;row['rechecks_agree']=norm(checks[0]['transcript'])==norm(checks[1]['transcript'])
        if row['rechecks_agree']:row['cer_checked']=checks[0]['cer'];row['transcript_checked']=checks[0]['transcript']
        print('ASR_RECHECK',row['file'],checks,flush=True)
    result['asr_recheck_note']='Flagged initial ASR results checked twice without word timestamps, with/without VAD; initial transcript retained. Long zero-duration repeated word timestamps are an ASR failure symptom, not proof of synthesis repetition.'
    (out/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));archive(out);return result


@app.function(image=fish_image,gpu='L4',memory=16384,timeout=600,retries=0,volumes={'/fishcache':fish_cache,'/voices':voices})
def audit_external(manifest):
    import re,hashlib
    import numpy as np,librosa,soundfile as sf
    from faster_whisper import WhisperModel
    from resemblyzer import VoiceEncoder
    from resemblyzer.audio import normalize_volume
    voices.reload();root=Path('/voices')/manifest['remote_output'];report=json.loads((root/'report.json').read_text());assert report['status']=='complete'
    out=root/'audit';out.mkdir(exist_ok=True);encoder=VoiceEncoder(device='cpu',verbose=False)
    def embed(path):
        y,sr=sf.read(path);a=librosa.resample(y.astype(np.float32),orig_sr=sr,target_sr=16000);return encoder.embed_utterance(normalize_volume(a,-30,increase_only=True))
    reference=embed(root/'normal_reference.wav');asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/fishcache/asr');rows=[]
    for item in report['items']:
        path=root/item['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256'];y,sr=sf.read(path);a=librosa.resample(y.astype(np.float32),orig_sr=sr,target_sr=16000)
        segs,_=asr.transcribe(a,language='ko',beam_size=5,vad_filter=True,condition_on_previous_text=False);hyp=' '.join(s.text.strip() for s in segs);norm=lambda s:re.sub('[^가-힣]','',s);expected=norm(item['text']);b=norm(hyp);d=list(range(len(b)+1))
        for i,ca in enumerate(expected,1):
            prev,d[0]=d[0],i
            for j,cb in enumerate(b,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(ca!=cb))
        row={'file':item['file'],'text':item['text'],'transcript':hyp,'cer':d[-1]/len(expected),'speaker_cosine_to_normal_007':float(np.dot(reference,embed(path))),'duration_seconds':len(y)/sr,'peak':float(np.abs(y).max())};rows.append(row);print('EXTERNAL_AUDIT',row,flush=True)
    result={'items':rows,'notes':'Internal diagnostic only; ASR errors can be recognition errors. Reference cosine is not emotion/naturalness or identity certification.'};(out/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));archive(out);return result
