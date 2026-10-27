"""Loopback-only research demo. Bounded live inference, no production changes."""
import json
from pathlib import Path
import modal
from modal_qwen_bottleneck import image as base_image
image=base_image.add_local_python_source('modal_qwen_bottleneck')
app=modal.App('miro-qwen-007-director-demo')
volume=modal.Volume.from_name('miro-voices')
cache=modal.Volume.from_name('miro-voxcpm2-cache')

@app.cls(image=image,gpu=['L40S','A100-40GB','L4'],memory=16384,timeout=180,scaledown_window=60,volumes={'/voices':volume,'/cache':cache})
class Voice:
 @modal.enter()
 def load(self):
  import torch
  from qwen_tts import Qwen3TTSModel
  self.model=Qwen3TTSModel.from_pretrained('/voices/_qwen_ft/007-20261023-pilot1/checkpoints/checkpoint-epoch-0',device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
 @modal.method()
 def speak(self,text:str,instruct:str,seed:int=1234):
  import io,time,random
  import numpy as np
  import torch,soundfile as sf
  random.seed(seed);np.random.seed(seed);torch.manual_seed(seed);torch.cuda.manual_seed_all(seed)
  t=time.monotonic();wavs,sr=self.model.generate_custom_voice(text=text,language='Korean',speaker='miro007',instruct=instruct,max_new_tokens=300)
  y=np.asarray(wavs[0]);peak=float(np.max(np.abs(y)));gain=min(1.,10**(-1/20)/max(peak,1e-9));buf=io.BytesIO();sf.write(buf,y*gain,sr,format='WAV',subtype='PCM_16')
  return {'audio':buf.getvalue(),'sr':sr,'generation_seconds':time.monotonic()-t,'duration_seconds':len(y)/sr,'peak_gain':gain}


def plan(context,instructions):
 import re
 for pattern,mode in [(r'속삭|귓가|귀에|소곤','whisper'),(r'분노|화가|화남|질투','angry'),(r'슬픔|슬프|서운|눈물','sad'),(r'기쁨|기쁜|반가|행복','happy')]:
  if re.search(pattern,context):return {'mode':mode,'instruction':instructions[mode],'director':'explicit keyword rules','semantic_control_validated':False,'phrase_timing_supported':False,'nonverbal_insertion_supported':False}
 return {'mode':'none','instruction':'','director':'no matching supported keyword → no instruction','semantic_control_validated':False,'phrase_timing_supported':False,'nonverbal_insertion_supported':False}

@app.local_entrypoint()
def main(folder:str,port:int=8796):
 import base64,hashlib,threading,time
 from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
 p=Path(folder).resolve();manifest=json.loads((p/'manifest.json').read_text());voice=Voice();lock=threading.Lock();budget={'used':0,'limit':8};store=p/'live';store.mkdir(exist_ok=True)
 class Handler(SimpleHTTPRequestHandler):
  def __init__(self,*a,**kw):super().__init__(*a,directory=str(p),**kw)
  def reply(self,status,obj):
   body=json.dumps(obj,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
  def do_GET(self):
   if self.path=='/api/health':return self.reply(200,{'ok':True,'voice':'007 female pilot','production_ready':False,'budget':budget,'instruction_transport':True,'semantic_control_validated':False,'warm_idle_seconds':60})
   return super().do_GET()
  def do_POST(self):
   if self.path!='/api/generate':return self.reply(404,{'error':'not found'})
   origin=self.headers.get('Origin')
   if origin and origin not in [f'http://127.0.0.1:{port}',f'http://localhost:{port}']:return self.reply(403,{'error':'origin denied'})
   try:
    n=int(self.headers.get('Content-Length','0'))
    if n<1 or n>16384:return self.reply(400,{'error':'invalid request size'})
    req=json.loads(self.rfile.read(n));text=req.get('text','');context=req.get('context','')
    if not isinstance(text,str) or not 1<=len(text.strip())<=160 or not isinstance(context,str) or len(context)>500:return self.reply(400,{'error':'대사는 1~160자, 장면은 500자 이내로 입력하세요.'})
    text=text.strip();decision=plan(context,manifest['instructions']);key=hashlib.sha256(json.dumps([text,decision['instruction'],1234,'007-epoch0'],ensure_ascii=False).encode()).hexdigest();meta_path=store/(key+'.json');wav_path=store/(key+'.wav');t=time.monotonic()
    with lock:
     cached=meta_path.exists() and wav_path.exists()
     if cached:meta=json.loads(meta_path.read_text())
     else:
      if budget['used']>=budget['limit']:return self.reply(429,{'error':'이 시연의 새 생성 8회 한도에 도달했습니다. 저장된 결과는 계속 재생할 수 있습니다.'})
      budget['used']+=1
      result=voice.speak.remote(text,decision['instruction']);wav_path.write_bytes(result.pop('audio'));meta={'text':text,'context':context,'plan':decision,**result};meta_path.write_text(json.dumps(meta,ensure_ascii=False,indent=2))
    return self.reply(200,{'audio_url':'live/'+key+'.wav','cached':cached,'request_seconds':time.monotonic()-t,'metadata':{**meta,'context':context,'plan':decision},'budget':budget})
   except Exception as e:return self.reply(500,{'error':str(e)})
  def log_message(self,fmt,*args):print(self.command,self.path.split('?')[0],flush=True)
 print(f'LOCAL_DIRECTOR http://127.0.0.1:{port}/live.html · maximum 8 new generations · GPU scales down after 60 idle seconds',flush=True)
 ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
