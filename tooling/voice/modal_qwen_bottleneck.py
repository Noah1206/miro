"""007 codec roundtrip and fixed-text instruction response. Inference only."""
import json
from pathlib import Path
import modal
app=modal.App('miro-qwen-007-bottleneck')
outputs=modal.Volume.from_name('miro-voices')
cache=modal.Volume.from_name('miro-voxcpm2-cache')
image=(modal.Image.debian_slim(python_version='3.11').apt_install('git','ffmpeg','sox')
 .pip_install('torch==2.7.0','torchaudio==2.7.0',index_url='https://download.pytorch.org/whl/cu126')
 .pip_install('qwen-tts==0.1.1','soundfile','accelerate','tensorboard','transformers==4.57.3')
 .run_commands('git clone -q https://github.com/QwenLM/Qwen3-TTS.git /qwen3tts && cd /qwen3tts && git checkout 022e286b98fbec7e1e916cb940cdf532cd9f488e')
 .env({'HF_HOME':'/cache/huggingface','PYTHONUNBUFFERED':'1','TOKENIZERS_PARALLELISM':'false'})
 .pip_install('faster-whisper==1.2.1')
 .env({'LD_LIBRARY_PATH':'/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib'}))

@app.function(image=image,gpu=['L40S','A100-40GB','L4'],memory=24576,timeout=2400,retries=0,volumes={'/voices':outputs,'/cache':cache})
def experiment(manifest:dict, originals:dict[str,bytes]):
 import random,time,hashlib,traceback,zipfile,inspect,re,gc
 import numpy as np
 import torch,soundfile as sf,librosa
 from qwen_tts import Qwen3TTSModel
 outputs.reload()
 p=Path('/voices')/manifest['remote_output'];p.mkdir(parents=True,exist_ok=True)
 report={'status':'loading','inference_only':True,'gpu':torch.cuda.get_device_name(),'checkpoint':manifest['checkpoint'],'items':[],'errors':[],'seeds':manifest['seeds'],'settings':{'max_new_tokens':500,'sampling':'checkpoint defaults; identical for all conditions'},'limitations':['No verified whispered/laugh/breath original in this selected speaker corpus; codec conclusions limited to supplied normal/emotional speech.','A changed output alone is not evidence of correct emotion or whisper.','Base cloning has no supported natural-language instruction path; do not pass ignored kwargs.']}
 def save(status):
  report['status']=status;(p/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));outputs.commit();print('MIRO_STATUS',status,len(report['items']),flush=True)
 def seed(n):
  random.seed(n);np.random.seed(n);torch.manual_seed(n);torch.cuda.manual_seed_all(n)
 def write(name,y,sr,meta):
  y=np.asarray(y,dtype=np.float32).reshape(-1)
  if not len(y) or not np.isfinite(y).all() or np.max(np.abs(y))<1e-6:raise ValueError('Invalid audio '+name)
  sf.write(p/name,y,sr,subtype='FLOAT')
  report['items'].append({'file':name,'sr':sr,'duration_seconds':len(y)/sr,'peak':float(np.max(np.abs(y))),'sha256':hashlib.sha256((p/name).read_bytes()).hexdigest(),**meta})
 try:
  ckpt=Path('/voices')/manifest['checkpoint']
  model=Qwen3TTSModel.from_pretrained(str(ckpt),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
  report['model_config']={k:getattr(model.model.config,k,None) for k in ['tts_model_type','tts_model_size','tokenizer_type']}
  report['generation_defaults']=json.loads((ckpt/'generation_config.json').read_text()) if (ckpt/'generation_config.json').exists() else {}
  report['instruction_api_source_sha256']=hashlib.sha256(inspect.getsource(type(model).generate_custom_voice).encode()).hexdigest()
  (p/'inference_generate_custom_voice.txt').write_text(inspect.getsource(type(model).generate_custom_voice))
  tokenizer=model.model.speech_tokenizer
  report['codec_class']=type(tokenizer).__name__
  for row in manifest['codec_items']:
   raw=p/(row['id']+'_source.wav');raw.write_bytes(originals[row['id']])
   y,sr=sf.read(raw,always_2d=True);y=y.mean(axis=1)
   if sr!=24000:y=librosa.resample(y,orig_sr=sr,target_sr=24000)
   write(row['id']+'_input24.wav',y,24000,{'id':row['id'],'kind':'codec_input','text':row['text']})
   enc=tokenizer.encode(y,sr=24000);decoded,dsr=tokenizer.decode(enc)
   np.save(p/(row['id']+'_codes.npy'),enc.audio_codes[0].cpu().numpy())
   write(row['id']+'_codec.wav',decoded[0],dsr,{'id':row['id'],'kind':'codec_roundtrip','text':row['text']})
   save('codec_roundtrip')
  # Verify the instruction prefix reaches the actual model call, without altering model generation.
  original_generate=model.model.generate
  audit=[]
  def traced_generate(*args,**kwargs):
   ids=kwargs.get('instruct_ids')
   audit.append([None if t is None else {'tokens':int(t.numel()),'sha256':hashlib.sha256(t.detach().cpu().numpy().tobytes()).hexdigest()} for t in ids] if ids is not None else None)
   return original_generate(*args,**kwargs)
  model.model.generate=traced_generate
  for row in manifest['instruction_items']:
   for n in manifest['seeds']:
    for mode,instruct in manifest['instructions'].items():
     seed(n);t=time.monotonic()
     wavs,sr=model.generate_custom_voice(text=row['text'],language='Korean',speaker='miro007',instruct=instruct,max_new_tokens=500)
     write(f'{row["id"]}_{mode}_s{n}.wav',wavs[0],sr,{'id':row['id'],'text':row['text'],'kind':'instruction','mode':mode,'instruction':instruct,'seed':n,'elapsed_seconds':time.monotonic()-t,'instruction_at_model':audit[-1]})
     save('instruction_generation')
   seed(manifest['seeds'][0])
   wavs,sr=model.generate_custom_voice(text=row['text'],language='Korean',speaker='miro007',instruct='',max_new_tokens=500)
   write(f'{row["id"]}_none_repeat_s{manifest["seeds"][0]}.wav',wavs[0],sr,{'id':row['id'],'text':row['text'],'kind':'repeat_control','mode':'none_repeat','seed':manifest['seeds'][0],'instruction_at_model':audit[-1]})
   save('repeat_control')
  model.model.generate=original_generate
  del traced_generate,original_generate,model,tokenizer;gc.collect();torch.cuda.empty_cache()
  # ASR flags omissions / unexpected instruction readout, not expression quality.
  from faster_whisper import WhisperModel
  asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/cache/asr')
  cache.commit();asrrows=[]
  for item in report['items']:
   segs,_=asr.transcribe(str(p/item['file']),language='ko',beam_size=5,vad_filter=False)
   hyp=' '.join(s.text.strip() for s in segs)
   a=re.sub('[^가-힣]','',item['text']);b=re.sub('[^가-힣]','',hyp);d=list(range(len(b)+1))
   for i,ca in enumerate(a,1):
    prev,d[0]=d[0],i
    for j,cb in enumerate(b,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(ca!=cb))
   asrrows.append({'file':item['file'],'text':item['text'],'transcript':hyp,'cer':d[-1]/max(1,len(a))})
  (p/'asr_audit.json').write_text(json.dumps(asrrows,ensure_ascii=False,indent=2))
  save('complete')
 except Exception:
  report['errors'].append(traceback.format_exc());save('failed');raise
 finally:
  with zipfile.ZipFile(p/'results.zip','w',zipfile.ZIP_DEFLATED) as z:
   for f in p.iterdir():
    if f.name!='results.zip' and f.is_file():z.write(f,arcname=f.name)
  outputs.commit();cache.commit()
 return report

@app.local_entrypoint()
def main(manifest:str):
 m=json.loads(Path(manifest).read_text());originals={r['id']:Path(r['source']).read_bytes() for r in m['codec_items']}
 r=experiment.remote(m,originals);(Path(manifest).parent/'report.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['status'],len(r['items']))
