import json,hashlib,time,os
os.environ['OMP_NUM_THREADS']='2';os.environ['MKL_NUM_THREADS']='2';os.environ['OPENBLAS_NUM_THREADS']='2'
from pathlib import Path
import numpy as np,librosa,soundfile as sf,torch
root=Path('/Users/johyeon-ung/Desktop/Miro/output/voice-compare/drama3-fullsize-ko-007-20261024-step23-preview');out=root/'analysis';torch.set_num_threads(2)
manifest=json.loads((root/'manifest.json').read_text());summary=json.loads((root/'comparison_results.json').read_text());result={'additional_cost_usd':0,'cloud_calls':0,'threshold_notes':['RMS gates are acoustic activity proxies, not speech/breath VAD.','F0/pYIN on whisper can invent pitch; no naturalness score is inferred.'],'items':[]}
def regions(mask,hop=.02):
 bounds=np.flatnonzero(np.diff(np.r_[False,mask,False])).reshape(-1,2);return [[round(a*hop,3),round(b*hop,3)] for a,b in bounds]
def features(path):
 y,sr=sf.read(path,dtype='float32');assert y.ndim==1 and np.isfinite(y).all();frame=round(sr*.02);n=len(y)//frame;rms=np.sqrt(np.mean(y[:n*frame].reshape(n,frame)**2,axis=1));db=20*np.log10(rms+1e-10);mask=db>max(float(db.max())-35,-60)
 y16=librosa.resample(y,orig_sr=sr,target_sr=16000);f0,voiced,prob=librosa.pyin(y16,fmin=70,fmax=600,sr=16000,frame_length=1024,hop_length=320);pdb=20*np.log10(librosa.feature.rms(y=y16,frame_length=1024,hop_length=320)[0]+1e-10);N=min(len(f0),len(pdb));active=pdb[:N]>max(float(pdb.max())-35,-60);v=voiced[:N]&active;freq=f0[:N][v]
 pause=regions(~mask);internal=[p for p in pause if p[0]>0 and p[1]<n*.02 and p[1]-p[0]>=.12]
 activeidx=np.flatnonzero(mask);span=[int(activeidx[0])*frame/sr,(int(activeidx[-1])+1)*frame/sr] if len(activeidx) else [None,None]
 second_rms=[]
 for start in range(0,len(y),sr):second_rms.append(float(20*np.log10(np.sqrt(np.mean(y[start:start+sr]**2))+1e-10)))
 return {'audio_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'seconds':len(y)/sr,'peak_dbfs':float(20*np.log10(abs(y).max()+1e-10)),'rms_dbfs':float(20*np.log10(np.sqrt(np.mean(y*y))+1e-10)),'clipped_fraction':float(np.mean(abs(y)>=1)),'active_gate_dbfs':max(float(db.max())-35,-60),'active_seconds':float(mask.sum()*.02),'active_span_seconds':span,'tail_after_activity_seconds':len(y)/sr-span[1] if span[1] is not None else None,'internal_pauses_at_least_120ms':internal,'longest_low_energy_run_seconds':max((p[1]-p[0] for p in pause),default=0),'last5_seconds_rms_dbfs':float(20*np.log10(np.sqrt(np.mean(y[-sr*5:]**2))+1e-10)),'seconds_below_minus60dbfs':float(np.mean(db<-60)*n*.02),'per_second_rms_dbfs':second_rms,'f0_median_hz':float(np.median(freq)) if len(freq)>10 else None,'f0_span_semitones':float(12*np.log2(np.percentile(freq,95)/np.percentile(freq,5))) if len(freq)>10 else None,'voiced_fraction_of_acoustic_activity':float(v.sum()/max(1,active.sum())),'voicing_probability_median_active':float(np.median(prob[:N][active])) if active.any() else None}
for item in summary['items']:
 begin=time.monotonic();f=features(root/item['file']);result['items'].append({**item,**f});(out/'acoustics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('ACOUSTICS',item['arm'],item['id'],item['seed'],round(time.monotonic()-begin,1),flush=True)
# Same actor's real reference and six heldout recordings anchor identity and pitch ranges.
real=Path('/Users/johyeon-ung/Desktop/Miro/output/voice-compare/drama3-fullsize-ko-007-20261024-step5-preview/real_recordings');result['real_recordings']=[]
for path in [root/'reference.wav',*sorted(real.glob('*.wav'))]:
 result['real_recordings'].append({'file':str(path),**features(path)})
result['complete']=True;(out/'acoustics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('ACOUSTICS_COMPLETE',flush=True)
