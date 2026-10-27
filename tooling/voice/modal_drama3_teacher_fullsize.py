"""Bounded actual35B one-step integration check; no production deployment."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,cache,voices,MODEL_REV
image=(base_image.env({'DS_BUILD_OPS':'0'}).pip_install('deepspeed==0.19.8','ninja')
       .add_local_python_source('drama3_fullft','modal_drama3_compare'))
app=modal.App('miro-drama3-teacher-fullsize-preflight')


@app.function(image=image,gpu='H100:8',cpu=16,memory=(655360,786432),timeout=1800,retries=0,
              volumes={'/fishcache':cache,'/voices':voices})
def preflight(cfg,run_tag):
    import os,subprocess,signal,threading,shutil,hashlib,re
    import drama3_fullft
    if not re.fullmatch(r'[a-zA-Z0-9_-]+',run_tag):raise ValueError('Unsafe run tag')
    voices.reload();cache.reload();root=Path('/voices/_drama3/korean-teacher-007-20261023')
    assert (root/'teacher_features/training_stats.pt').is_file(),'Run the matched pilot/statistics preparation first'
    original=Path('/fishcache/huggingface/hub/models--fishaudio--drama-3/snapshots')/MODEL_REV
    out=root/run_tag;out.mkdir(exist_ok=True)
    if (out/'attempt.json').exists() or (out/'fullsize_preflight.json').exists():raise FileExistsError('Choose a new run tag')
    source=Path(next(iter(drama3_fullft.__path__)));snapshot=out/'code';snapshot.mkdir(exist_ok=True)
    hashes={}
    for file in source.glob('*.py'):
        shutil.copy2(file,snapshot/file.name);hashes[file.name]=hashlib.sha256(file.read_bytes()).hexdigest()
    (snapshot/'source_hashes.json').write_text(json.dumps(hashes,indent=2))
    cfg['gradient_accumulation_steps']=1
    (out/'zero3.json').write_text(json.dumps(cfg))
    cmd=['torchrun','--standalone','--nproc_per_node=8','--module','drama3_fullft.train',
         '--checkpoint',str(original),'--manifest',str(root/'data/recordings.jsonl'),'--codes',str(root/'codes'),
         '--output',str(out),'--deepspeed-config',str(out/'zero3.json'),'--max-steps','1','--preflight-only',
         '--teacher-features',str(root/'teacher_features'),'--teacher-weight','0.1']
    env=dict(os.environ,OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',TOKENIZERS_PARALLELISM='false')
    try:
        with (out/'torchrun.log').open('w') as log:
            process=subprocess.Popen(cmd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
            timer=threading.Timer(1500,lambda:os.killpg(process.pid,signal.SIGTERM) if process.poll() is None else None)
            timer.daemon=True;timer.start()
            try:
                for line in process.stdout:log.write(line);log.flush();print(line,end='',flush=True)
                code=process.wait(timeout=30)
            finally:
                timer.cancel()
                if process.poll() is None:os.killpg(process.pid,signal.SIGKILL)
        if code:raise RuntimeError('Full-size preflight exited '+str(code))
        result=json.loads((out/'fullsize_preflight.json').read_text())
    except Exception as e:
        result={'status':'failed','error':repr(e),'scope':'Actual35B integration attempt; no completed trained voice or serving checkpoint','production_changed':False}
        (out/'attempt.json').write_text(json.dumps(result,indent=2));raise
    finally:voices.commit()
    return result


@app.local_entrypoint()
def main(folder:str,run_tag:str='fullsize_preflight'):
    out=Path(folder);out.mkdir(parents=True,exist_ok=True)
    cfg=json.loads(Path('tooling/voice/drama3_fullft/zero3.json').read_text())
    result=preflight.remote(cfg,run_tag);(out/(run_tag+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(result)
