"""Corrected Coqui blog experiment: internal CPML evaluation, no training/deploy."""
import json
from pathlib import Path
import modal
from modal_three_tts_compare import qwen_image,cache,outputs

app=modal.App('miro-coqui-blog-007-evaluation')
image=(qwen_image.pip_install('coqui-tts[ko]==0.28.0','transformers==4.57.6','hangul-romanize==0.1.0')
       .pip_install('spacy==3.8.16')
       .run_commands('python -c "from TTS.tts.configs.xtts_config import XttsConfig; from TTS.tts.models.xtts import Xtts"')
       .add_local_python_source('modal_three_tts_compare'))
MODEL_REV='6c2b0d75eae4b7047358e3b6bd9325f857d43f77'


@app.function(image=image,gpu='L4',memory=16384,timeout=1800,retries=0,volumes={'/cache':cache,'/voices':outputs})
def run(manifest,references):
    import hashlib,random,time,traceback,zipfile
    import torch,numpy as np,soundfile as sf
    from huggingface_hub import snapshot_download
    from TTS.tts.configs.xtts_config import XttsConfig
    from TTS.tts.models.xtts import Xtts
    outputs.reload();out=Path('/voices')/manifest['remote_output'];out.mkdir(parents=True,exist_ok=True)
    for name,data in references.items():
        assert hashlib.sha256(data).hexdigest()==manifest['references'][name]['sha256'];(out/name).write_bytes(data)
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    report={'status':'loading','model':'coqui/XTTS-v2','revision':MODEL_REV,'software':'coqui-tts0.28.0','training':False,'enable_text_splitting':manifest.get('enable_text_splitting',True),'production_changed':False,'license':'CPML1.0 internal evaluation only; no commercial deployment or training for commercial use','gpu':torch.cuda.get_device_name(),'items':[],'errors':[]}
    def status(value):
        report['status']=value;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));outputs.commit();print('COQUI_STATUS',value,len(report['items']),flush=True)
    try:
        status('loading');folder=Path(snapshot_download('coqui/XTTS-v2',revision=MODEL_REV,allow_patterns=['LICENSE.txt','config.json','model.pth','vocab.json','speakers_xtts.pth']))
        license_text=(folder/'LICENSE.txt').read_text();assert 'Use by commercial or for-profit entities for testing' in license_text
        (out/'MODEL_LICENSE.txt').write_text(license_text);cache.commit()
        config=XttsConfig();config.load_json(str(folder/'config.json'));model=Xtts.init_from_config(config);model.load_checkpoint(config,checkpoint_dir=str(folder),use_deepspeed=False);model.cuda();model.eval()
        for req in manifest['requests']:
            random.seed(req['seed']);np.random.seed(req['seed']);torch.manual_seed(req['seed']);torch.cuda.manual_seed_all(req['seed'])
            with torch.inference_mode():
                latent,speaker=model.get_conditioning_latents(audio_path=[str(out/req['reference'])])
                start=time.monotonic();result=model.inference(req['text'],'ko',latent,speaker,temperature=.65,top_k=50,top_p=.8,repetition_penalty=2.0,speed=1.0,enable_text_splitting=manifest.get('enable_text_splitting',True));elapsed=time.monotonic()-start
            y=np.asarray(result['wav'],dtype=np.float32);assert len(y)>0 and np.isfinite(y).all()
            file=req['id']+'.wav';sf.write(out/file,y,24000,subtype='FLOAT')
            report['items'].append({**req,'file':file,'sr':24000,'duration_seconds':len(y)/24000,'generation_seconds':elapsed,'sha256':hashlib.sha256((out/file).read_bytes()).hexdigest()});status('generating')
        status('complete')
    except Exception:
        report['errors'].append(traceback.format_exc());status('failed');raise
    finally:
        with zipfile.ZipFile(out/'results.zip','w',zipfile.ZIP_DEFLATED) as z:
            for f in out.iterdir():
                if f.is_file() and f.name!='results.zip':z.write(f,f.name)
        outputs.commit();cache.commit()
    return report


@app.local_entrypoint()
def main(folder:str):
    p=Path(folder);m=json.loads((p/'manifest.json').read_text());refs={name:Path(x['source']).read_bytes() for name,x in m['references'].items()};r=run.remote(m,refs);(p/'report.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['status'])
