"""Train a bounded actor007 emotion-conditional pilot, preserve all baselines."""
import json
from pathlib import Path
import modal
from modal_qwen_bottleneck import image as previous_image
image=previous_image.pip_install('resemblyzer==0.1.4').add_local_python_source('modal_qwen_bottleneck')
app=modal.App('miro-qwen-007-emotion-conditioned')
voices=modal.Volume.from_name('miro-voices')
cache=modal.Volume.from_name('miro-voxcpm2-cache')

@app.function(image=image,gpu='A100-80GB',memory=32768,timeout=3600,retries=0,volumes={'/voices':voices,'/cache':cache})
def run(manifest:dict,training_source:str):
    import traceback,subprocess,time,shutil,random,hashlib,zipfile,gc,os,inspect,re
    import numpy as np
    import torch,soundfile as sf
    from huggingface_hub import snapshot_download
    voices.reload();out=Path('/voices')/manifest['remote_output'];out.mkdir(parents=True,exist_ok=True)
    report={'status':'preparing','training':True,'gpu':torch.cuda.get_device_name(),'items':[],'errors':[],'settings':manifest['settings'],'training_source_sha256':hashlib.sha256(training_source.encode()).hexdigest(),'voice':'007 female','whisper_trained':False}
    def status(s):
        report['status']=s;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));voices.commit();print('MIRO_STATUS',s,len(report['items']),flush=True)
    try:
        (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));(out/'train_conditioned.py').write_text(training_source)
        base=str(Path('/voices')/manifest['initial_checkpoint']) if manifest.get('initial_checkpoint') else snapshot_download('Qwen/Qwen3-TTS-12Hz-1.7B-Base',revision='fd4b254389122332181a7c3db7f27e918eec64e3');cache.commit()
        status('training')
        with (out/'train.log').open('w') as log:
            subprocess.run(['python',str(out/'train_conditioned.py'),'--manifest',str(out/'manifest.json'),'--codes','/voices/_qwen_ft/007-20261023-pilot1/train_codes.jsonl','--base',base,'--output',str(out/'checkpoints')],stdout=log,stderr=subprocess.STDOUT,check=True,timeout=2200)
        history=json.loads((out/'checkpoints/training_history.json').read_text());report['best_epoch']=history['best_epoch'];report['best_checkpoint']=str(out/'checkpoints'/history['best_checkpoint']);status('checkpoint_saved')
        from qwen_tts import Qwen3TTSModel
        # Every declared epoch gets the six fixed held-out test utterances.
        selected={row['id'] for row in manifest['matrix_items']}
        for epoch in range(1,manifest['settings']['epochs']+1):
            model=Qwen3TTSModel.from_pretrained(str(out/'checkpoints'/f'checkpoint-epoch-{epoch}'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
            def generate(row,mode,seed,suffix):
                random.seed(seed);np.random.seed(seed);torch.manual_seed(seed);torch.cuda.manual_seed_all(seed)
                begin=time.monotonic();instruct=manifest['instructions'][mode]
                wavs,sr=model.generate_custom_voice(text=row['text'],language='Korean',speaker='miro007',instruct=instruct,max_new_tokens=180)
                y=np.asarray(wavs[0],dtype=np.float32);name=f'{row["id"]}_{suffix}.wav';sf.write(out/name,y,sr,subtype='FLOAT')
                if not len(y) or not np.isfinite(y).all() or np.max(np.abs(y))<1e-6:raise ValueError(name)
                report['items'].append({'id':row['id'],'text':row['text'],'mode':mode,'instruction':instruct,'seed':seed,'epoch':epoch,'file':name,'sr':sr,'duration_seconds':len(y)/sr,'max_new_tokens':180,'token_limit_suspected':len(y)/sr>=14.2,'generation_seconds':time.monotonic()-begin,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()});status('generating_comparison')
            for row in manifest['test_items']:generate(row,row['mode'],1234,f'conditioned_e{epoch}')
            if epoch==history['best_epoch']:
                for row in manifest['matrix_items']:
                    for seed in [1234,4321]:
                        for mode in manifest['instructions']:
                            name=f'{row["id"]}_{mode}_s{seed}.wav'
                            # Reuse matching first take rather than generate/select another one.
                            if seed==1234 and mode==row['mode']:
                                shutil.copy2(out/f'{row["id"]}_conditioned_e{epoch}.wav',out/name)
                                original=next(x for x in report['items'] if x['file']==f'{row["id"]}_conditioned_e{epoch}.wav')
                                report['items'].append({**original,'file':name,'reuse_of':original['file']});continue
                            generate(row,mode,seed,f'{mode}_s{seed}')
            del model;gc.collect();torch.cuda.empty_cache()
        # Original comparison assets remain byte-for-byte copies.
        for asset in manifest['baselines']:
            source=Path('/voices')/asset['remote'];dest=out/asset['file'];shutil.copy2(source,dest)
            if hashlib.sha256(dest.read_bytes()).hexdigest()!=asset['sha256']:raise AssertionError('Baseline changed '+asset['file'])
        status('auditing')
        from faster_whisper import WhisperModel
        from resemblyzer import VoiceEncoder,preprocess_wav
        asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/cache/asr');encoder=VoiceEncoder(device='cpu',verbose=False);cache.commit()
        ref_path=out/manifest['test_items'][0]['id'];embeddings={}
        def embed(path):
            key=str(path)
            if key not in embeddings:embeddings[key]=encoder.embed_utterance(preprocess_wav(path))
            return embeddings[key]
        audits=[];files={x['file']:x for x in report['items']}
        for b in manifest['baselines']:files[b['file']]={'id':b['id'],'text':b['text'],'file':b['file']}
        for file,item in files.items():
            segs,_=asr.transcribe(str(out/file),language='ko',beam_size=5,vad_filter=False);hyp=' '.join(s.text.strip() for s in segs)
            a=re.sub('[^가-힣]','',item['text']);b=re.sub('[^가-힣]','',hyp);d=list(range(len(b)+1))
            for i,ca in enumerate(a,1):
                prev,d[0]=d[0],i
                for j,cb in enumerate(b,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(ca!=cb))
            similarity=float(np.dot(embed(out/file),embed(out/(item['id']+'_orig.wav'))))
            audits.append({'file':file,'text':item['text'],'transcript':hyp,'cer':d[-1]/max(1,len(a)),'speaker_similarity':similarity})
        (out/'asr_speaker_audit.json').write_text(json.dumps(audits,ensure_ascii=False,indent=2));status('complete')
    except Exception:
        report['errors'].append(traceback.format_exc());status('failed');raise
    finally:
        with zipfile.ZipFile(out/'results.zip','w',zipfile.ZIP_DEFLATED) as z:
            for f in out.iterdir():
                if f.is_file() and f.name!='results.zip':z.write(f,arcname=f.name)
            for f in (out/'checkpoints').glob('*.json'):z.write(f,arcname=f.name)
        voices.commit();cache.commit()
    return report

@app.local_entrypoint()
def main(folder:str):
    p=Path(folder);m=json.loads((p/'manifest.json').read_text());source=Path('tooling/voice/qwen_conditioned_train.py').read_text();r=run.remote(m,source);(p/'report.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['status'])
