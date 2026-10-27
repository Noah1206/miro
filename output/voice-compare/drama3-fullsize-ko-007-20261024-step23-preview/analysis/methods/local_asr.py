import json,time,hashlib,re,torch,whisper
from pathlib import Path
root=Path('/Users/johyeon-ung/Desktop/Miro/output/voice-compare/drama3-fullsize-ko-007-20261024-step23-preview');out=root/'analysis';torch.set_num_threads(4)
report={'engine':'openai-whisper','model':'small','device':'cpu','language':'ko','fp16':False,'beam_size':5,'temperature':0,'condition_on_previous_text':False,'expected_text_prompted':False,'cloud_calls':0,'additional_cost_usd':0,'limitations':['ASR transcript/CER is an automatic recognizer proxy, not human listening or pronunciation truth.','Whisper may hallucinate over silence and struggle on whisper.'],'items':[]}
summary=json.loads((root/'comparison_results.json').read_text());manifest=json.loads((root/'manifest.json').read_text());lookup={(r['id'],r['seed']):r for r in manifest['requests']}
model=whisper.load_model('small',device='cpu',download_root=str(Path.home()/'.cache/whisper'))
def diff(a,b):
 a=re.sub('[^가-힣0-9a-zA-Z]','',a).lower();b=re.sub('[^가-힣0-9a-zA-Z]','',b).lower();dp=list(range(len(b)+1))
 for i,x in enumerate(a,1):
  prev,dp[0]=dp[0],i
  for j,y in enumerate(b,1):prev,dp[j]=dp[j],min(dp[j]+1,dp[j-1]+1,prev+(x!=y))
 return {'reference_characters':len(a),'edit_distance':dp[-1],'cer':dp[-1]/max(1,len(a))}
# Long and whisper first so the key diagnostic results arrive early.
items=sorted(summary['items'],key=lambda r:({'long_comfort':0,'whisper':1}.get(r['id'],2),r['id'],r['seed'],r['arm']))
for row in items:
 path=root/row['file'];start=time.monotonic();result=model.transcribe(str(path),language='ko',fp16=False,temperature=0,beam_size=5,condition_on_previous_text=False,word_timestamps=True,verbose=None)
 expected=lookup[row['id'],row['seed']]['text'];entry={**row,'audio_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'expected_text':expected,'transcript':result['text'].strip(),'segments':result['segments'],'asr_seconds':time.monotonic()-start,**diff(expected,result['text'])};report['items'].append(entry)
 (out/'local_asr.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:entry[k] for k in ['arm','id','seed','transcript','cer','asr_seconds']},ensure_ascii=False),flush=True)
report['complete']=True;(out/'local_asr.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
