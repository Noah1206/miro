"""Fixed-input reference-content ablation; no optimizer or training."""
import json
from pathlib import Path
import modal
from modal_qwen_conditioned import image as previous_image
image=previous_image.add_local_python_source('modal_qwen_conditioned','qwen_conditioned_train')

app=modal.App('miro-qwen-007-prompt-ablation')
voices=modal.Volume.from_name('miro-voices')
cache=modal.Volume.from_name('miro-voxcpm2-cache')

@app.function(image=image,gpu='A100-80GB',memory=32768,timeout=2400,retries=0,volumes={'/voices':voices,'/cache':cache})
def run(manifest,references):
 import hashlib,random,time,traceback,zipfile,re,gc,copy,inspect
 import numpy as np
 import soundfile as sf
 import torch
 from huggingface_hub import snapshot_download
 from safetensors.torch import load_file
 from qwen_tts import Qwen3TTSModel
 from faster_whisper import WhisperModel
 from resemblyzer import VoiceEncoder,preprocess_wav
 voices.reload();out=Path('/voices')/manifest['remote_output'];out.mkdir(parents=True,exist_ok=True)
 (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
 report={'status':'loading','items':[],'errors':[],'training':False,'gpu':torch.cuda.get_device_name(),'seed':manifest['seed'],'limitations':['Single reference per emotion confounds reference text, take and style; not a general emotion accuracy test.','Only 3 previously exposed held-out texts and 1 fresh Miro text.','Fine-tuned ICL was not trained on ICL prefixes; diagnostic only.']}
 def status(value):
  report['status']=value;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));voices.commit();print('MIRO_STATUS',value,len(report['items']),flush=True)
 def generate(row,mode,variant,model,prompt=None,suffix=None):
  random.seed(manifest['seed']);np.random.seed(manifest['seed']);torch.manual_seed(manifest['seed']);torch.cuda.manual_seed_all(manifest['seed'])
  begin=time.monotonic();captured=[];original=model.model.generate
  def traced(*args,**kwargs):
   vp=kwargs.get('voice_clone_prompt')
   captured.append({'instruct_lengths':[0 if x is None else x.numel() for x in kwargs.get('instruct_ids',[])], 'icl_mode':None if vp is None else vp['icl_mode'],'ref_code_frames':None if vp is None else [None if x is None else len(x) for x in vp['ref_code']]})
   return original(*args,**kwargs)
  model.model.generate=traced
  try:
   if variant=='trained_fixed':wavs,sr=model.generate_custom_voice(text=row['text'],language='Korean',speaker='miro007',instruct=manifest['instructions'][mode],max_new_tokens=manifest['max_new_tokens'])
   else:wavs,sr=model.generate_voice_clone(text=row['text'],language='Korean',voice_clone_prompt=prompt,max_new_tokens=manifest['max_new_tokens'])
  finally:model.model.generate=original
  name=f"{row['id']}_{variant}_{mode}{suffix or ''}.wav";y=np.asarray(wavs[0],dtype=np.float32)
  if not len(y) or not np.isfinite(y).all() or np.max(np.abs(y))<1e-6:raise ValueError(name)
  sf.write(out/name,y,sr,subtype='FLOAT');item={'id':row['id'],'text':row['text'],'mode':mode,'variant':variant,'file':name,'sr':sr,'duration_seconds':len(y)/sr,'generation_seconds':time.monotonic()-begin,'token_limit_suspected':len(y)/sr>=14.2,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest(),'actual_model_input':captured}
  report['items'].append(item);status('generating');return item
 try:
  base=snapshot_download('Qwen/Qwen3-TTS-12Hz-1.7B-Base',revision=manifest['base_revision']);cache.commit()
  model=Qwen3TTSModel.from_pretrained(base,device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
  report['generation_defaults']=model.generate_defaults;report['clone_api_sha256']=hashlib.sha256(inspect.getsource(type(model).generate_voice_clone).encode()).hexdigest()
  prompts={}
  for mode,ref in manifest['references'].items():
   path=out/ref['file'];path.write_bytes(references[ref['file']]);assert hashlib.sha256(path.read_bytes()).hexdigest()==ref['sha256']
   icl=model.create_voice_clone_prompt(ref_audio=str(path),ref_text=ref['text'])
   xv=copy.deepcopy(icl);xv[0].x_vector_only_mode=True;xv[0].icl_mode=False;xv[0].ref_code=None;xv[0].ref_text=None
   assert torch.equal(icl[0].ref_spk_embedding,xv[0].ref_spk_embedding)
   prompts[mode]={'base_icl':icl,'base_speaker_only':xv}
   sf.write(out/('reference_'+mode+'.wav'),sf.read(path)[0],sf.info(path).samplerate,subtype='FLOAT')
  report['speaker_embedding_control']='bit-identical between ICL and speaker-only within each reference'
  for row in manifest['tests']:
   for mode in manifest['references']:
    for variant in ['base_icl','base_speaker_only']:generate(row,mode,variant,model,prompts[mode][variant])
  row=manifest['tests'][0];generate(row,row['mode'],'base_icl',model,prompts[row['mode']]['base_icl'],suffix='_repeat')
  for mode in manifest['references']:generate(manifest['new_test'],mode,'base_icl',model,prompts[mode]['base_icl'])
  # Isolate whether speaker-only SFT has retained the original audio-prefix path.
  weights=load_file(str(Path('/voices')/manifest['trained_checkpoint']/'model.safetensors'),device='cpu')
  talker_state={k.removeprefix('talker.'):v for k,v in weights.items() if k.startswith('talker.')}
  model.model.talker.load_state_dict(talker_state,strict=True);del weights,talker_state;gc.collect()
  for row in manifest['tests']:generate(row,row['mode'],'trained_icl_diagnostic',model,prompts[row['mode']]['base_icl'])
  del model;gc.collect();torch.cuda.empty_cache()
  model=Qwen3TTSModel.from_pretrained(str(Path('/voices')/manifest['trained_checkpoint']),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
  for mode in manifest['references']:generate(manifest['new_test'],mode,'trained_fixed',model)
  del model;gc.collect();torch.cuda.empty_cache();status('auditing')
  asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/cache/asr');encoder=VoiceEncoder(device='cpu',verbose=False);cache.commit();emb={}
  def embedding(path):
   if str(path) not in emb:emb[str(path)]=encoder.embed_utterance(preprocess_wav(path))
   return emb[str(path)]
  checks=[]
  for item in report['items']:
   path=out/item['file'];segments,_=asr.transcribe(str(path),language='ko',beam_size=5,vad_filter=False);transcript=' '.join(s.text.strip() for s in segments)
   a=re.sub('[^가-힣]','',item['text']);b=re.sub('[^가-힣]','',transcript);d=list(range(len(b)+1))
   for i,ca in enumerate(a,1):
    prev,d[0]=d[0],i
    for j,cb in enumerate(b,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(ca!=cb))
   origin=Path('/voices/_qwen_bottleneck/007-20261023-v1')/(item['id']+'_source.wav')
   target=origin if origin.exists() else out/'reference_normal.wav'
   checks.append({'file':item['file'],'transcript':transcript,'cer':d[-1]/max(1,len(a)),'speaker_similarity':float(np.dot(embedding(path),embedding(target))),'speaker_target':'same_text_original' if origin.exists() else 'normal_reference'})
  (out/'asr_audit.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));status('complete')
 except Exception:
  report['errors'].append(traceback.format_exc());status('failed');raise
 finally:
  with zipfile.ZipFile(out/'results.zip','w',zipfile.ZIP_DEFLATED) as z:
   for f in out.iterdir():
    if f.is_file() and f.name!='results.zip':z.write(f,f.name)
  voices.commit()
 return report

@app.function(image=image,memory=8192,cpu=2,timeout=600,retries=0,volumes={'/voices':voices})
def repair_speaker_audit(manifest):
 """Use the same actor take as prior reports; no regeneration or ASR rerun."""
 import numpy as np
 from resemblyzer import VoiceEncoder,preprocess_wav
 voices.reload();out=Path('/voices')/manifest['remote_output'];audit=json.loads((out/'asr_audit.json').read_text());r=json.loads((out/'report.json').read_text());items={x['file']:x for x in r['items']};encoder=VoiceEncoder(device='cpu',verbose=False);emb={}
 def embed(path):
  if str(path) not in emb:emb[str(path)]=encoder.embed_utterance(preprocess_wav(path))
  return emb[str(path)]
 for row in audit:
  item=items[row['file']];origin=Path('/voices/_qwen_bottleneck/007-20261023-v1')/(item['id']+'_source.wav');target=origin if origin.exists() else out/'reference_normal.wav'
  row['speaker_similarity']=float(np.dot(embed(out/row['file']),embed(target)));row['speaker_target']='same_text_original' if origin.exists() else 'normal_reference'
 (out/'asr_audit_same_text.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2));voices.commit();return audit

@app.function(image=image,gpu='A100-80GB',memory=24576,timeout=600,retries=0,volumes={'/voices':voices,'/cache':cache})
def instruction_audit(manifest,training_manifest):
 import torch,numpy as np
 from qwen_tts import Qwen3TTSModel
 from qwen_conditioned_train import tokens,objective
 voices.reload();out=Path('/voices')/manifest['remote_output'];qwen=Qwen3TTSModel.from_pretrained(str(Path('/voices')/manifest['trained_checkpoint']),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa');qwen.model.eval();speaker=qwen.model.talker.get_input_embeddings().weight[3000].detach()
 codes={Path(x['audio']).name:x for x in [json.loads(s) for s in Path('/voices/_qwen_ft/007-20261023-pilot1/train_codes.jsonl').read_text().splitlines()]}
 short={'normal':'평범하게 말하세요.','happy':'기쁘게 말하세요.','sad':'슬프게 말하세요.','angry':'화난 말투로 말하세요.'};results=[]
 with torch.no_grad():
  for meta in training_manifest['validation']:
   row={'text_ids':tokens(qwen,meta['text'],'')[0],'codes':torch.tensor(codes[meta['file']]['audio_codes'],device='cuda',dtype=torch.long),'instruction_ids':None};item={'file':meta['file'],'true_mode':meta['mode'],'codec0_nll':{}}
   for form,prompts in [('canonical',manifest['instructions']),('paraphrase',short),('none',{'none':''})]:
    scores={}
    for mode,instruct in prompts.items():
     row['instruction_ids']=tokens(qwen,meta['text'],instruct)[1];scores[mode]=float(objective(qwen,row,speaker,only_codec0=True)[0])
    item['codec0_nll'][form]=scores
   results.append(item)
 summary={}
 for form in ['canonical','paraphrase']:
  margins=[];win=[]
  for item in results:
   scores=item['codec0_nll'][form];right=scores[item['true_mode']];wrong=[v for k,v in scores.items() if k!=item['true_mode']];margins.append(float(np.mean(wrong)-right));win.append(right<min(wrong))
  summary[form]={'n':len(results),'correct_label_lowest_nll':sum(win),'mean_wrong_minus_correct_nll':float(np.mean(margins)),'mean_correct_codec0_nll':float(np.mean([x['codec0_nll'][form][x['true_mode']] for x in results]))}
 report={'items':results,'summary':summary,'no_instruction_mean_codec0_nll':float(np.mean([x['codec0_nll']['none']['none'] for x in results])),'notes':['Teacher-forced likelihood on real audio is not generated emotion accuracy, listening preference or naturalness.','Entire 32-item held-out validation; 4 canonical versus 4 short paraphrase instructions plus no instruction.','Only codec0 likelihood used here; do not compare directly with prior codec0 + residual validation loss.']}
 (out/'instruction_audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));voices.commit();return report

@app.local_entrypoint()
def main(folder:str,audit_only:bool=False,instruction_only:bool=False):
 p=Path(folder);m=json.loads((p/'manifest.json').read_text())
 if instruction_only:
  tm=json.loads(Path('output/voice-compare/qwen-conditioned-007-20261023/final/manifest.json').read_text());r=instruction_audit.remote(m,tm);(p/'instruction_audit.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['summary']);return
 if audit_only:
  (p/'asr_audit_same_text.json').write_text(json.dumps(repair_speaker_audit.remote(m),ensure_ascii=False,indent=2));return
 source=Path('/Users/johyeon-ung/GPT-SoVITS/jobs/aihub-f007/Miro_Dataset_Output');references={r['file']:(source/r['file']).read_bytes() for r in m['references'].values()};r=run.remote(m,references);(p/'report.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['status'])
