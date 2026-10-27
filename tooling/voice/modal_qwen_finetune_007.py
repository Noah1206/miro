"""Bounded single-speaker pilot. Existing comparison utterances are held out."""
import json
from pathlib import Path
import modal

app = modal.App('miro-qwen-007-finetune')
voices = modal.Volume.from_name('miro-voices')
cache = modal.Volume.from_name('miro-voxcpm2-cache')
SOURCE = '022e286b98fbec7e1e916cb940cdf532cd9f488e'
BASE_REV = 'fd4b254389122332181a7c3db7f27e918eec64e3'
image = (modal.Image.debian_slim(python_version='3.11')
    .apt_install('git','ffmpeg','sox')
    .pip_install('torch==2.7.0','torchaudio==2.7.0',index_url='https://download.pytorch.org/whl/cu126')
    .pip_install('qwen-tts==0.1.1','soundfile','accelerate','tensorboard','transformers==4.57.3')
    .run_commands(f'git clone -q https://github.com/QwenLM/Qwen3-TTS.git /qwen3tts && cd /qwen3tts && git checkout {SOURCE}')
    .env({'HF_HOME':'/cache/huggingface','PYTHONUNBUFFERED':'1','TOKENIZERS_PARALLELISM':'false'}))

@app.function(image=image,gpu='A100-80GB',memory=32768,timeout=3600,retries=0,volumes={'/voices':voices,'/cache':cache})
def train(archive: bytes, manifest: dict):
    import io,zipfile,subprocess,time,traceback,os,random
    import numpy as np
    import torch,librosa,soundfile as sf
    from huggingface_hub import snapshot_download
    out=Path('/voices')/manifest['remote_output']
    out.mkdir(parents=True,exist_ok=True)
    for name in ['status.json','train.log']:
        previous=out/name
        if previous.exists():
            import shutil
            shutil.copy2(previous,out/(name+'.before-logging-fix'))
    report={'status':'preparing','source_commit':SOURCE,'base_revision':BASE_REV,'gpu':torch.cuda.get_device_name(), 'settings':{'epochs':1,'batch_size':1,'gradient_accumulation':4,'lr':2e-6,'seed':1234},'items':[]}
    def status(s):
        report['status']=s
        (out/'status.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        voices.commit()
        print('MIRO_STATUS',s,flush=True)
    try:
        random.seed(1234); np.random.seed(1234); torch.manual_seed(1234)
        data=out/'data'; data.mkdir(exist_ok=True)
        if archive:
            with zipfile.ZipFile(io.BytesIO(archive)) as z:
                for name in z.namelist():
                    if '/' in name or '..' in name: raise ValueError('Unsafe dataset archive')
                z.extractall(data)
        # Convert locally to fixed sample rate without changing prosody.
        for wav in (data.glob('*.wav') if archive else []):
            y,sr=sf.read(wav)
            if y.ndim>1:y=y.mean(axis=1)
            if sr!=24000:y=librosa.resample(y,orig_sr=sr,target_sr=24000)
            sf.write(wav,y,24000,subtype='PCM_16')
        raw=out/'train_raw.jsonl'
        with raw.open('w') as f:
            for row in manifest['train']:
                f.write(json.dumps({'audio':str(data/row['file']),'text':row['text'],'ref_audio':str(data/manifest['reference'])},ensure_ascii=False)+'\n')
        (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
        report['train_count']=len(manifest['train']); report['held_out']=manifest['excluded']
        base=snapshot_download('Qwen/Qwen3-TTS-12Hz-1.7B-Base',revision=BASE_REV)
        cache.commit()
        cwd=Path('/qwen3tts/finetuning')
        for name in ['sft_12hz.py','prepare_data.py']:
            file=cwd/name; file.write_text(file.read_text().replace('flash_attention_2','sdpa'))
        # Seed the training subprocess as well, leaving the official objective unchanged.
        sft=cwd/'sft_12hz.py'
        sft.write_text(sft.read_text().replace('log_with="tensorboard"', 'log_with=None').replace('    args = parser.parse_args()','    args = parser.parse_args()\n    from accelerate.utils import set_seed\n    set_seed(1234)'))
        def run(args,label,timeout):
            with (out/f'{label}.log').open('w') as log:
                subprocess.run(args,cwd=cwd,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=timeout)
        if not (out/'train_codes.jsonl').exists():
            status('extracting_audio_codes')
            run(['python','prepare_data.py','--device','cuda:0','--tokenizer_model_path','Qwen/Qwen3-TTS-Tokenizer-12Hz','--input_jsonl',str(raw),'--output_jsonl',str(out/'train_codes.jsonl')],'prepare',900)
        status('training')
        run(['python','sft_12hz.py','--init_model_path',base,'--output_model_path',str(out/'checkpoints'),'--train_jsonl',str(out/'train_codes.jsonl'),'--batch_size','1','--lr','2e-6','--num_epochs','1','--speaker_name','miro007'],'train',2200)
        status('checkpoint_saved_generating_comparison')
        from qwen_tts import Qwen3TTSModel
        model=Qwen3TTSModel.from_pretrained(str(out/'checkpoints/checkpoint-epoch-0'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
        for row in manifest['evaluation']:
            torch.manual_seed(1234)
            wavs,sr=model.generate_custom_voice(text=row['text'],language='Korean',speaker='miro007',max_new_tokens=500)
            name=row['id']+'_qwen_ft_epoch0.wav'
            sf.write(out/name,wavs[0],sr,subtype='FLOAT')
            report['items'].append({'id':row['id'],'file':name,'sr':sr})
            status('generating_comparison')
        status('complete')
    except Exception:
        report['error']=traceback.format_exc(); status('failed'); raise
    finally:
        voices.commit(); cache.commit()
    return report

@app.local_entrypoint()
def main(folder: str, resume: bool = False):
    import io,zipfile
    p=Path(folder); m=json.loads((p/'manifest.json').read_text())
    archive=io.BytesIO()
    if resume:
        print(json.dumps(train.remote(b'',m),ensure_ascii=False,indent=2))
        return
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_STORED) as z:
        for name in sorted({r['file'] for r in m['train']}|{m['reference']}):
            z.write(Path(m['dataset'])/name,arcname=name)
    print(json.dumps(train.remote(archive.getvalue(),m),ensure_ascii=False,indent=2))
