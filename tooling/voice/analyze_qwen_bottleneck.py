"""Acoustic diagnostics; no automatic emotion/naturalness claims."""
import json,os,sys,math
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import numpy as np
import soundfile as sf
from scipy.signal import correlate
import librosa

def feature(path):
 y,sr=librosa.load(path,sr=16000)
 f0,v,prob=librosa.pyin(y,fmin=70,fmax=600,sr=16000,frame_length=1024,hop_length=160)
 rms=librosa.feature.rms(y=y,frame_length=1024,hop_length=160)[0]
 db=20*np.log10(rms+1e-8);active=db>db.max()-35
 st=12*np.log2(f0[v]/100) if v.any() else np.array([])
 mfcc=librosa.feature.mfcc(y=y,sr=16000,n_mfcc=13,hop_length=160)
 data={'file':Path(path).name,'duration_seconds':len(y)/16000,'rms_dbfs':float(20*np.log10(np.sqrt(np.mean(y*y))+1e-8)), 'voiced_fraction':float(v.mean()),'voicing_probability_mean':float(np.nanmean(prob)),'relative_silence_fraction':float(1-active.mean()),'f0_range_semitones':float(np.percentile(st,95)-np.percentile(st,5)) if len(st) else None,'f0_median_hz':float(np.median(f0[v])) if v.any() else None,'energy_range_db':float(np.percentile(db[active],95)-np.percentile(db[active],5)) if active.any() else None}
 return data,{'f0':f0,'voiced':v,'rms':rms,'mfcc':mfcc}

def pitchpair(a,b,dtw=False):
 if dtw:
  _,wp=librosa.sequence.dtw(X=a['mfcc'],Y=b['mfcc'],metric='cosine');ia,ib=wp[::-1,0],wp[::-1,1]
  lag=None
 else:
  # At most 200ms codec delay, align energy envelope without changing the audio files.
  aa=a['rms']-a['rms'].mean();bb=b['rms']-b['rms'].mean()
  cc=correlate(bb,aa,mode='full');lags=np.arange(-len(aa)+1,len(bb));mask=np.abs(lags)<=20
  lag=int(lags[mask][np.argmax(cc[mask])]);ia=np.arange(len(a['f0']));ib=ia+lag
 keep=(ia<len(a['f0']))&(ib>=0)&(ib<len(b['f0']));ia,ib=ia[keep],ib[keep]
 vo=a['voiced'][ia]&b['voiced'][ib]
 out={'alignment':'MFCC_DTW' if dtw else 'energy_delay_only','codec_delay_seconds':None if lag is None else lag*.01,'shared_voiced_frames':int(vo.sum()),'voicing_agreement':float(np.mean(a['voiced'][ia]==b['voiced'][ib]))}
 if vo.sum()>=10:
  x,z=12*np.log2(a['f0'][ia[vo]]),12*np.log2(b['f0'][ib[vo]])
  out.update(f0_correlation=float(np.corrcoef(x,z)[0,1]) if x.std()>1e-6 and z.std()>1e-6 else None,f0_median_absolute_error_semitones=float(np.median(np.abs(x-z))))
 else:out.update(f0_correlation=None,f0_median_absolute_error_semitones=None)
 ra,rb=a['rms'][ia],b['rms'][ib]
 out['energy_envelope_correlation']=float(np.corrcoef(ra,rb)[0,1]) if ra.std()>1e-9 and rb.std()>1e-9 else None
 return out

def main(folder):
 p=Path(folder);r=json.loads((p/'report.json').read_text());m=json.loads((p/'manifest.json').read_text())
 codec_only='--codec-only' in sys.argv
 if codec_only:
  r['items']=[i for i in r['items'] if i['kind'] in ['codec_input','codec_roundtrip']]
  m['instruction_items']=[];m['instructions']={}
 files=[str(p/i['file']) for i in r['items']]
 with ProcessPoolExecutor(max_workers=3) as pool:features=list(pool.map(feature,files))
 table={d['file']:d for d,a in features};arrays={d['file']:a for d,a in features};codec=[];instructions=[];repeats=[]
 for row in m['codec_items']:
  sid=row['id'];a=sid+'_input24.wav';b=sid+'_codec.wav';cmp=pitchpair(arrays[a],arrays[b]);codec.append({'id':sid,'emotion':row['emotion'],'source':table[a],'decoded':table[b],'duration_delta_seconds':table[b]['duration_seconds']-table[a]['duration_seconds'],**cmp})
 for row in m['instruction_items']:
  sid=row['id']
  for seed in m['seeds']:
   base=f'{sid}_none_s{seed}.wav'
   for mode in m['instructions']:
    name=f'{sid}_{mode}_s{seed}.wav';a,sra=sf.read(p/base);b,srb=sf.read(p/name)
    instructions.append({'id':sid,'seed':seed,'mode':mode,'exact_same_waveform_as_no_instruction':sra==srb and a.shape==b.shape and np.array_equal(a,b),'duration_ratio_to_none':table[name]['duration_seconds']/table[base]['duration_seconds'],'rms_delta_db_to_none':table[name]['rms_dbfs']-table[base]['rms_dbfs'],'voiced_fraction_delta_to_none':table[name]['voiced_fraction']-table[base]['voiced_fraction'],**pitchpair(arrays[base],arrays[name],dtw=True)})
  a,sra=sf.read(p/f'{sid}_none_s1234.wav');b,srb=sf.read(p/f'{sid}_none_repeat_s1234.wav')
  repeats.append({'id':sid,'identical':sra==srb and a.shape==b.shape and np.array_equal(a,b),'max_abs_difference':float(np.max(np.abs(a-b))) if a.shape==b.shape else None})
 summary=[]
 for mode in m['instructions']:
  selected=[i for i in instructions if i['mode']==mode]
  summary.append({'mode':mode,'n':len(selected),'duration_ratio_mean':float(np.mean([i['duration_ratio_to_none'] for i in selected])),'rms_delta_db_mean':float(np.mean([i['rms_delta_db_to_none'] for i in selected])),'voiced_fraction_delta_mean':float(np.mean([i['voiced_fraction_delta_to_none'] for i in selected])),'identical_to_none_count':sum(i['exact_same_waveform_as_no_instruction'] for i in selected)})
 out={'notes':['pYIN-derived acoustic diagnostics, not human emotion/naturalness scores.','Relative-silence threshold may count breaths/whispers as silence.','F0 is undefined for unvoiced whisper; voiced fraction is a clue, not a validated whisper classifier.','Instruction changes and differences between seeds do not prove correct emotional response.'], 'features':list(table.values()),'codec_pairs':codec,'instruction_pairs':instructions,'repeat_controls':repeats,'instruction_summary':summary}
 (p/('codec_preliminary.json' if codec_only else 'acoustic_analysis.json')).write_text(json.dumps(out,ensure_ascii=False,indent=2,allow_nan=False))
 print(json.dumps({'codec_mean_f0_correlation':float(np.mean([i['f0_correlation'] for i in codec if i['f0_correlation'] is not None])),'codec_mean_f0_error_semitones':float(np.mean([i['f0_median_absolute_error_semitones'] for i in codec if i['f0_median_absolute_error_semitones'] is not None])),'repeat_controls':repeats,'instruction_summary':summary},ensure_ascii=False))
if __name__=='__main__':main(sys.argv[1])
