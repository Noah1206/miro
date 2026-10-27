"""Inspect source labels, waveform health and acting coverage before further SFT."""
import collections,hashlib,json,re,sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import numpy as np
import soundfile as sf
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.metrics import balanced_accuracy_score,confusion_matrix
from analyze_qwen_bottleneck import feature

ROOT=Path('/Users/johyeon-ung/GPT-SoVITS/jobs/aihub-f007/Miro_Dataset_Output')
LABELS=Path('/Users/johyeon-ung/.miro/aihub/d71349/labels/TL_대화체_007')

def health(path):
 y,sr=sf.read(path,always_2d=True);y=y.mean(axis=1);frame=max(1,int(sr*.02));n=len(y)//frame
 rms=np.sqrt(np.mean(y[:n*frame].reshape(n,frame)**2,axis=1));db=20*np.log10(rms+1e-10);active=db>db.max()-35
 return {'file':Path(path).name,'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'sr':sr,'duration_seconds':len(y)/sr,'clipped_fraction':float(np.mean(np.abs(y)>=.999)),'edge_20ms_db_below_max':[float(db[0]-db.max()),float(db[-1]-db.max())],'relative_silence_fraction':float(1-active.mean()),'rms_dbfs':float(20*np.log10(np.sqrt(np.mean(y*y))+1e-10))}

def main(folder):
 out=Path(folder);m=json.loads(Path('output/voice-compare/qwen-conditioned-007-20261023/final/manifest.json').read_text());metadata={}
 for f in LABELS.glob('*.json'):
  for d in json.loads(f.read_text(encoding='utf-8-sig')):
   for row in d.get('sentences',[]):metadata[row['voice_piece']['filename']]=row
 files=sorted(ROOT.glob('*.wav'));healthy=[health(x) for x in files];have={x.name for x in files}
 rows=[metadata[x] for x in have if x in metadata];train_names={x['file'] for x in m['train']};train=[metadata[x] for x in train_names]
 def coverage(rows):
  texts=collections.defaultdict(set)
  for row in rows:texts[re.sub(r'\W','',row['voice_piece'].get('tr',''))].add(row['style']['emotion'])
  return {'n':len(rows),'emotion':dict(collections.Counter(x['style']['emotion'] for x in rows)),'intensity':dict(collections.Counter(str(x['style'].get('intensity')) for x in rows)),'recording_style':dict(collections.Counter(x['style'].get('style') for x in rows)),'sub_style':dict(collections.Counter(x['style'].get('sub_style') for x in rows)),'phrase_marked':sum('/' in x['voice_piece'].get('ptr','') for x in rows),'same_text_multiple_emotions':sum(len(v)>1 for v in texts.values()),'short_at_most_2_sec':sum(x['voice_piece'].get('duration',100)<=2 for x in rows)}
 model=make_pipeline(TfidfVectorizer(analyzer='char',ngram_range=(2,4),min_df=2),LogisticRegression(max_iter=1000,class_weight='balanced',random_state=1234))
 model.fit([x['text'] for x in m['train']],[x['mode'] for x in m['train']]);pred=model.predict([x['text'] for x in m['validation']]);target=[x['mode'] for x in m['validation']]
 chosen=[]
 for mode in m['instructions']:
  candidates=sorted([x for x in m['train'] if x['mode']==mode],key=lambda x:hashlib.sha256(x['file'].encode()).hexdigest())[:16]
  chosen+=candidates
 with ProcessPoolExecutor(max_workers=4) as pool:features=list(pool.map(feature,[str(ROOT/x['file']) for x in chosen]))
 acoustic=[{**x,**f[0]} for x,f in zip(chosen,features)];summaries=[]
 for mode in m['instructions']:
  r=[x for x in acoustic if x['mode']==mode]
  summaries.append({'mode':mode,'n':len(r),**{k:float(np.median([x[k] for x in r if x[k] is not None])) for k in ['f0_range_semitones','f0_median_hz','relative_silence_fraction','rms_dbfs','voiced_fraction']},'median_syllables_per_total_second':float(np.median([len(re.sub('[^가-힣]','',x['text']))/x['duration_seconds'] for x in r]))})
 outdata={'available_waveforms':len(files),'source_metadata':coverage(list(metadata.values())),'available_coverage':coverage(rows),'training_coverage':coverage(train),'selection_bias':'aihub_prepare.py prefers high Likert ratings then durations close to 5 seconds with emotion quotas; this is not an ASMR-specific selection.','healthy':healthy,'duplicate_waveform_hashes':sum(v-1 for v in collections.Counter(x['sha256'] for x in healthy).values() if v>1),'clip_fraction_over_0_1_percent':sum(x['clipped_fraction']>.001 for x in healthy),'text_only_emotion_probe':{'balanced_accuracy':balanced_accuracy_score(target,pred),'n':len(target),'chance':.25,'labels':list(m['instructions']),'confusion_matrix':confusion_matrix(target,pred,labels=list(m['instructions'])).tolist(),'limitation':'Text/emotion confounding probe only; not an audio emotion recognizer.'},'acoustic_sample':acoustic,'acoustic_emotion_summary':summaries,'unvalidated_coverage':['whisper','nonverbal breath/laugh','phrase-local emotion','male-character identity','adult acting'],'notes':['Phrase markers in ptr are boundary hints, not measured timestamps.','The older claim that all 007 recordings were neutral reading is not supported by the original labels.','No parallel four-emotion takes in the current training subset means category instruction disentanglement is weakly supervised.']}
 (out/'data_audit.json').write_text(json.dumps(outdata,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in outdata.items() if k not in ['healthy','acoustic_sample']},ensure_ascii=False))

if __name__=='__main__':main(sys.argv[1])
