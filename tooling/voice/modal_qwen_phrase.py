"""Measured phrase conditioning and ICL-preserving bounded actor007 training."""
import json
from pathlib import Path
import modal
from modal_qwen_conditioned import image as previous_image
image=previous_image.add_local_python_source('modal_qwen_conditioned','qwen_phrase_data')
app=modal.App('miro-qwen-007-phrase-icl')
voices=modal.Volume.from_name('miro-voices');cache=modal.Volume.from_name('miro-voxcpm2-cache')

@app.function(image=image,gpu='A100-40GB',memory=16384,timeout=1200,retries=0,volumes={'/voices':voices,'/cache':cache})
def prepare(m):
 import hashlib,collections,traceback
 import torch,numpy as np,soundfile as sf
 from transformers import Wav2Vec2ForCTC,AutoProcessor
 from qwen_phrase_data import align_utterance,observed_plan,norm,ctc_word_spans,continuation_alignment
 voices.reload();out=Path('/voices')/m['remote_output'];out.mkdir(parents=True,exist_ok=True)
 (out/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2));accepted={'train':[],'validation':[]};rejected=[]
 model_id='kresnik/wav2vec2-large-xlsr-korean';revision='629c9a3501c10ba128bf3fa1eebb12af3be03f61'
 processor=AutoProcessor.from_pretrained(model_id,revision=revision);vocab=processor.tokenizer.get_vocab();blank=processor.tokenizer.pad_token_id;aligner=lambda emission,targets:ctc_word_spans(emission,targets,blank)
 # A perfect synthetic path with a nonzero blank reproduces the helper mismatch.
 synthetic=torch.full((7,len(vocab)),-50.,device='cuda');path=[blank,1,blank,1,2,blank,blank];synthetic[torch.arange(7),torch.tensor(path,device='cuda')]=0
 oracle=aligner(synthetic,[[1],[1,2]]);assert [[s.token for s in group] for group in oracle]==[[1],[1,2]]
 model=Wav2Vec2ForCTC.from_pretrained(model_id,revision=revision).to('cuda').eval();cache.commit()
 def tokenize(words):return [[vocab[c] for c in norm(w)]+([vocab['|']] if i+1<len(words) else []) for i,w in enumerate(words)]
 for split in accepted:
  for index,row in enumerate(m[split]):
   try:
    path=Path('/voices/_qwen_ft/007-20261023-pilot1/data')/row['file'];y,sr=sf.read(path);assert sr==24000
    a=align_utterance(y,sr,row['text'],row['ptr'],model,tokenize,aligner)
    accepted[split].append({**row,'alignment':a,'prepared_wave_sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
   except (ValueError,KeyError,RuntimeError) as e:rejected.append({'file':row['file'],'split':split,'reason':str(e)})
   if index%40==0:print('ALIGN',split,index,'accepted',len(accepted[split]),'rejected',len(rejected),flush=True)
 thresholds={}
 for mode in m['instructions']:
  values=[r['alignment']['syllables_per_second'] for r in accepted['train'] if r['mode']==mode]
  if len(values)<30:raise RuntimeError(f'Insufficient reliable alignment for {mode}: {len(values)}')
  thresholds[mode]=np.quantile(values,[1/3,2/3]).tolist()
 for rows in accepted.values():
  for row in rows:
   row['plan']=observed_plan(row['alignment'],thresholds[row['mode']]);alternate=continuation_alignment(row['alignment'])
   if alternate:row['continuation_plan']=observed_plan(alternate,thresholds[row['mode']]);row['continuation_alignment']=alternate
 if len(accepted['train'])<300 or len(accepted['validation'])<20:raise RuntimeError('Insufficient reliable data; do not train fabricated phrase targets')
 result={'train':accepted['train'],'validation':accepted['validation'],'rejected':rejected,'tempo_thresholds_train_only':thresholds,'aligner':{'model':model_id,'revision':revision,'license':'apache-2.0','blank_id':blank,'vocab_size':len(vocab)},'pause_thresholds_seconds':[.08,.30],'summary':{s:{'n':len(rs),'emotion':dict(collections.Counter(r['mode'] for r in rs)),'phrase_count':sum(len(r['plan']['phrases']) for r in rs),'pause':dict(collections.Counter(x['pause'] for r in rs for x in r['plan']['phrases']))} for s,rs in accepted.items()},'notes':['Alignment-derived labels are estimates, not manually verified precise timestamps.','Only train data determines speaking-rate thresholds; original test timings are never supplied to generation.','No audio stretching, pitch changes or inserted silences in targets.']}
 (out/'prepared.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));voices.commit();return result

@app.function(image=image,gpu='A100-80GB',memory=32768,timeout=3600,retries=0,volumes={'/voices':voices,'/cache':cache})
def train_and_compare(m,training_source,data_source):
 import hashlib,subprocess,random,time,traceback,zipfile,gc,re,shutil
 import numpy as np
 import torch,soundfile as sf
 from huggingface_hub import snapshot_download
 from qwen_tts import Qwen3TTSModel
 from qwen_phrase_data import requested_plan,instruction,align_utterance,norm,ctc_word_spans
 voices.reload();out=Path('/voices')/m['remote_output'];data=json.loads((out/'prepared.json').read_text());assert len(data['train'])>=300
 (out/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2));(out/'train_phrase.py').write_text(training_source);(out/'qwen_phrase_data.py').write_text(data_source)
 report={'status':'loading','items':[],'errors':[],'gpu':torch.cuda.get_device_name(),'train_count':len(data['train']),'validation_count':len(data['validation']),'training_source_sha256':hashlib.sha256(training_source.encode()).hexdigest(),'data_source_sha256':hashlib.sha256(data_source.encode()).hexdigest(),'limitations':['Measured alignment labels are estimates.','No whisper, nonverbal, male-character or adult acting trained.','Selection uses validation likelihood, not human naturalness.','Held-out comparison utterances were exposed in prior experiments; not a fresh independent benchmark.']}
 def status(value):
  report['status']=value;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));voices.commit();print('MIRO_STATUS',value,len(report['items']),flush=True)
 try:
  base=str(Path('/voices')/m['initial_checkpoint']) if m.get('initial_checkpoint') else snapshot_download('Qwen/Qwen3-TTS-12Hz-1.7B-Base',revision=m['base_revision']);cache.commit();status('training')
  with (out/'train.log').open('w') as f:subprocess.run(['python',str(out/'train_phrase.py'),'--manifest',str(out/'manifest.json'),'--prepared',str(out/'prepared.json'),'--base',base,'--output',str(out/'checkpoints')],stdout=f,stderr=subprocess.STDOUT,check=True,timeout=2200)
  history=json.loads((out/'checkpoints/training_history.json').read_text());report['best_epoch']=history['best_epoch'];report['best_checkpoint']=str(out/'checkpoints'/history['best_checkpoint']);status('checkpoint_saved')
  for epoch in range(1,m['settings']['epochs']+1):
   model=Qwen3TTSModel.from_pretrained(str(out/'checkpoints'/f'checkpoint-epoch-{epoch}'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa');prompts={}
   for mode,ref in m['references'].items():
    path=Path('/voices/_qwen_problem_search/007-20261023-prompt-v1')/ref['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==ref['sha256'];prompts[mode]=model.create_voice_clone_prompt(ref_audio=str(path),ref_text=ref['text'])
   def generate(row,mode,plan,suffix,ref_mode=None,no_instruction=False):
    random.seed(1234);np.random.seed(1234);torch.manual_seed(1234);torch.cuda.manual_seed_all(1234);inst='' if no_instruction else instruction(mode,plan);ids=model._tokenize_texts([model._build_instruct_text(inst)]) if inst else None;seen=[];original=model.model.generate
    def traced(*a,**kw):
     vp=kw['voice_clone_prompt'];ins=kw.get('instruct_ids');seen.append({'icl_mode':vp['icl_mode'],'ref_frames':[len(x) for x in vp['ref_code']],'instruct_tokens':0 if ins is None else sum(x.numel() for x in ins)});return original(*a,**kw)
    model.model.generate=traced;begin=time.monotonic()
    try:wavs,sr=model.generate_voice_clone(text=row['text'],language='Korean',voice_clone_prompt=prompts[ref_mode or mode],instruct_ids=ids,non_streaming_mode=True,max_new_tokens=180)
    finally:model.model.generate=original
    assert seen[0]['icl_mode']==[True] and (seen[0]['instruct_tokens']>0)==bool(inst)
    name=f"{row['id']}_{suffix}.wav";y=np.asarray(wavs[0],dtype=np.float32);assert len(y) and np.isfinite(y).all() and np.max(np.abs(y))>1e-6;sf.write(out/name,y,sr,subtype='FLOAT')
    item={'id':row['id'],'text':row['text'],'mode':mode,'file':name,'epoch':epoch,'plan':plan,'instruction':inst,'reference_mode':ref_mode or mode,'duration_seconds':len(y)/sr,'generation_seconds':time.monotonic()-begin,'token_limit_suspected':len(y)/sr>=14.2,'actual_model_input':seen[0],'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()};report['items'].append(item);status('generating');return item
   for row in m['test_items']:generate(row,row['mode'],requested_plan(row['text']),f'phrase_e{epoch}')
   if epoch==history['best_epoch']:
    for row in m['matrix_items']:
     for axis,values in [('speed',['slow','normal','fast']),('pause',['none','short','long'])]:
      for value in values:
       plan=requested_plan(row['text'],speed=value if axis=='speed' else 'normal',pause=value if axis=='pause' else 'short');name=f"{row['id']}_{axis}_{value}.wav"
       if (axis=='speed' and value=='normal') or (axis=='pause' and value=='short'):
        source=next(x for x in report['items'] if x['file']==f"{row['id']}_phrase_e{epoch}.wav");shutil.copy2(out/source['file'],out/name);report['items'].append({**source,'file':name,'reuse_of':source['file']})
       else:generate(row,row['mode'],plan,f'{axis}_{value}')
     generate(row,row['mode'],requested_plan(row['text']),'no_instruction',no_instruction=True)
    for mode in m['references']:generate(m['new_test'],mode,requested_plan(m['new_test']['text']),'miro_'+mode,ref_mode='normal')
    generate(m['new_test'],'normal',requested_plan(m['new_test']['text']),'miro_no_instruction',ref_mode='normal',no_instruction=True)
   del model;gc.collect();torch.cuda.empty_cache()
  for asset in m['baselines']:
   source=Path('/voices')/asset['remote'];shutil.copy2(source,out/asset['file']);assert hashlib.sha256((out/asset['file']).read_bytes()).hexdigest()==asset['sha256']
  status('auditing')
  from transformers import Wav2Vec2ForCTC,AutoProcessor
  aid=data['aligner'];processor=AutoProcessor.from_pretrained(aid['model'],revision=aid['revision']);vocab=processor.tokenizer.get_vocab();blank=processor.tokenizer.pad_token_id;acoustic=Wav2Vec2ForCTC.from_pretrained(aid['model'],revision=aid['revision']).to('cuda').eval()
  def tokenize(words):return [[vocab[c] for c in norm(w)]+([vocab['|']] if i+1<len(words) else []) for i,w in enumerate(words)]
  measured=[]
  for item in report['items']:
   try:
    y,sr=sf.read(out/item['file']);a=align_utterance(y,sr,item['text'],' / '.join(x['text'] for x in item['plan']['phrases']),acoustic,tokenize,lambda e,t:ctc_word_spans(e,t,blank));measured.append({'file':item['file'],'valid':True,'alignment':a})
   except (ValueError,KeyError,RuntimeError) as e:measured.append({'file':item['file'],'valid':False,'reason':str(e)})
  (out/'generated_alignment.json').write_text(json.dumps(measured,ensure_ascii=False,indent=2));del acoustic;gc.collect();torch.cuda.empty_cache()
  from faster_whisper import WhisperModel
  from resemblyzer import VoiceEncoder,preprocess_wav
  asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/cache/asr');encoder=VoiceEncoder(device='cpu',verbose=False);emb={}
  def embed(path):
   if str(path) not in emb:emb[str(path)]=encoder.embed_utterance(preprocess_wav(path))
   return emb[str(path)]
  files={x['file']:x for x in report['items']}
  for x in m['baselines']:files[x['file']]={**x,'plan':{}}
  audits=[]
  for file,item in files.items():
   segs,_=asr.transcribe(str(out/file),language='ko',beam_size=5,vad_filter=False);hyp=' '.join(x.text.strip() for x in segs);a=re.sub('[^가-힣]','',item['text']);b=re.sub('[^가-힣]','',hyp);d=list(range(len(b)+1))
   for i,ca in enumerate(a,1):
    prev,d[0]=d[0],i
    for j,cb in enumerate(b,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(ca!=cb))
   target=out/(item['id']+'_orig.wav');same=target.exists()
   if not same:target=Path('/voices/_qwen_problem_search/007-20261023-prompt-v1')/m['references']['normal']['file']
   audits.append({'file':file,'transcript':hyp,'cer':d[-1]/max(1,len(a)),'speaker_similarity':float(np.dot(embed(out/file),embed(target))),'speaker_target':'same_text_original' if same else 'normal_reference'})
  (out/'asr_audit.json').write_text(json.dumps(audits,ensure_ascii=False,indent=2));status('complete')
 except Exception:
  report['errors'].append(traceback.format_exc());status('failed');raise
 finally:
  with zipfile.ZipFile(out/'results.zip','w',zipfile.ZIP_DEFLATED) as z:
   for f in out.iterdir():
    if f.is_file() and f.name!='results.zip':z.write(f,f.name)
   for f in (out/'checkpoints').glob('*.json'):z.write(f,f.name)
  voices.commit();cache.commit()
 return report

@app.local_entrypoint()
def main(folder:str,phase:str='prepare'):
 p=Path(folder);m=json.loads((p/'manifest.json').read_text())
 if phase=='prepare':
  r=prepare.remote(m);(p/'prepared.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['summary'])
 elif phase=='train':
  r=train_and_compare.remote(m,Path('tooling/voice/qwen_phrase_train.py').read_text(),Path('tooling/voice/qwen_phrase_data.py').read_text());(p/'report.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['status'])
 else:raise ValueError(phase)
