"""Delay-only codec diagnostics. These are not human naturalness/emotion scores."""
import argparse,json
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
from functools import lru_cache
import numpy as np
import soundfile as sf
import librosa
from scipy.signal import correlate


@lru_cache(maxsize=32)
def features(path):
    y,sr=sf.read(path,dtype='float32')
    if y.ndim!=1:raise ValueError('Expected mono')
    y=librosa.resample(y,orig_sr=sr,target_sr=16000)
    f0,voiced,prob=librosa.pyin(y,fmin=70,fmax=700,sr=16000,frame_length=1024,hop_length=160)
    rms=librosa.feature.rms(y=y,frame_length=1024,hop_length=160)[0]
    return {'y':y,'f0':f0,'voiced':voiced,'rms':rms}


def pair(source,decoded):
    a,b=features(source),features(decoded)
    aa=a['rms']-a['rms'].mean();bb=b['rms']-b['rms'].mean()
    cc=correlate(bb,aa,mode='full');lags=np.arange(-len(aa)+1,len(bb));mask=np.abs(lags)<=20
    lag=int(lags[mask][np.argmax(cc[mask])])
    ia=np.arange(len(a['rms']));ib=ia+lag;keep=(ib>=0)&(ib<len(b['rms']))
    ia,ib=ia[keep],ib[keep];v=a['voiced'][ia]&b['voiced'][ib]
    def corr(x,y):
        return float(np.corrcoef(x,y)[0,1]) if len(x)>2 and x.std()>1e-8 and y.std()>1e-8 else None
    def pitch_range(x):
        vals=x['f0'][x['voiced']];vals=12*np.log2(vals/100)
        return float(np.percentile(vals,95)-np.percentile(vals,5)) if len(vals)>10 else None
    ar,br=a['rms'][ia],b['rms'][ib]
    ad,bd=20*np.log10(ar+1e-9),20*np.log10(br+1e-9)
    threshold=float(np.percentile(ad,95)-35)
    out={'alignment':'energy_envelope_delay_only_no_time_warp','delay_seconds':lag*.01,
         'shared_voiced_frames':int(v.sum()),'voicing_agreement':float((a['voiced'][ia]==b['voiced'][ib]).mean()),
         'f0_correlation':corr(12*np.log2(a['f0'][ia[v]]),12*np.log2(b['f0'][ib[v]])) if v.sum()>10 else None,
         'f0_median_absolute_error_semitones':float(np.median(np.abs(12*np.log2(a['f0'][ia[v]]/b['f0'][ib[v]])))) if v.sum()>10 else None,
         'original_pitch_range_semitones':pitch_range(a),'decoded_pitch_range_semitones':pitch_range(b),
         'energy_envelope_correlation':corr(ar,br),'median_absolute_energy_error_db':float(np.median(np.abs(ad-bd))),
         'source_relative_pause_fraction':float((ad<threshold).mean()),
         'decoded_relative_pause_fraction':float((bd<threshold).mean()),
         'relative_pause_frame_agreement':float(((ad<threshold)==(bd<threshold)).mean()),
         'duration_delta_seconds':len(b['y'])/16000-len(a['y'])/16000}
    out['relative_pause_fraction_delta']=out['decoded_relative_pause_fraction']-out['source_relative_pause_fraction']
    if out['original_pitch_range_semitones'] is not None and out['decoded_pitch_range_semitones'] is not None:
        out['pitch_range_delta_semitones']=out['decoded_pitch_range_semitones']-out['original_pitch_range_semitones']
    offset=lag*160;xa=max(0,-offset);xb=max(0,offset);n=min(len(a['y'])-xa,len(b['y'])-xb)
    sa=np.abs(librosa.stft(a['y'][xa:xa+n],n_fft=1024,hop_length=256));sb=np.abs(librosa.stft(b['y'][xb:xb+n],n_fft=1024,hop_length=256))
    out['spectral_convergence']=float(np.linalg.norm(sa-sb)/(np.linalg.norm(sa)+1e-9))
    return out


def run_job(job):
    sid,key,a,b=job
    return {'clip_id':sid,'variant':key,**pair(a,b)}


def main():
    ap=argparse.ArgumentParser();ap.add_argument('folder');ap.add_argument('--workers',type=int,default=3);a=ap.parse_args()
    root=Path(a.folder);report=json.loads((root/'report.json').read_text());jobs=[]
    for item in report['items']:
        for key in ['codec_file','q0_file','q01_file','continuous_intervention_file','bf16_file']:
            if key in item:jobs.append((item['clip_id'],key,str(root/item['original_file']),str(root/item[key])))
    with ProcessPoolExecutor(max_workers=a.workers) as pool:
        pairs=[]
        for row in pool.map(run_job,jobs):
            pairs.append(row);print('ANALYZED',row['clip_id'],row['variant'],row['f0_correlation'],flush=True)
    primary=[p for p in pairs if p['variant']=='codec_file']
    def summary(key):
        v=np.array([x[key] for x in primary if x.get(key) is not None]);return {'n':len(v),'mean':float(v.mean()),'median':float(np.median(v)),'p10':float(np.percentile(v,10)),'p90':float(np.percentile(v,90))}
    summary_fields=['f0_correlation','f0_median_absolute_error_semitones','pitch_range_delta_semitones',
                    'energy_envelope_correlation','relative_pause_fraction_delta','relative_pause_frame_agreement',
                    'spectral_convergence','duration_delta_seconds']
    aggregate={key:summary(key) for key in summary_fields}
    aggregate['asr']={k:float(np.mean([r['asr'][k]['cer_to_verified_text'] for r in report['items']])) for k in ['original_file','codec_file']}
    aggregate['asr']['mean_paired_cer_delta']=aggregate['asr']['codec_file']-aggregate['asr']['original_file']
    limits=json.loads((root/'diagnostic_limits.json').read_text())
    checks={'enough_clips':len(primary)>=limits['min_clips'],
        'median_f0_corr':aggregate['f0_correlation']['median']>=limits['median_f0_correlation_min'],
        'p10_f0_corr':aggregate['f0_correlation']['p10']>=limits['p10_f0_correlation_min'],
        'median_f0_error':aggregate['f0_median_absolute_error_semitones']['median']<=limits['median_f0_error_semitones_max'],
        'median_energy_corr':aggregate['energy_envelope_correlation']['median']>=limits['median_energy_correlation_min'],
        'p10_energy_corr':aggregate['energy_envelope_correlation']['p10']>=limits['p10_energy_correlation_min'],
        'median_pause_delta':float(np.median([abs(p['relative_pause_fraction_delta']) for p in primary]))<=limits['median_absolute_pause_fraction_delta_max'],
        'paired_asr_delta':aggregate['asr']['mean_paired_cer_delta']<=limits['mean_paired_cer_delta_max']}
    result={'scope':'Miro actor007, original-to-codec reconstruction only; not TTS quality or Korean-wide evaluation',
        'notes':['Emotion labels come from filenames; emotional correctness not independently rated.',
                 'No verified natural whisper recordings exist in this sample; whisper retention remains untested.',
                 'Continuous intervention is off-distribution and is not a perceptual upper bound or an exact isolated quantization-loss measurement.',
                 'q0-only and q0+q1 ablations omit residual channels; degraded sound does not mean full10-codebook inference loses the same information.',
                 'Relative energy pause masks may include breaths; F0 is undefined for unvoiced whisper.',
                 'Limits are predeclared engineering diagnostics, not validated perceptual acceptance thresholds.'],
        'pairs':pairs,'aggregate':aggregate,'diagnostic_checks':checks,'diagnostic_limits':limits,
        'all_diagnostic_checks_pass':all(checks.values())}
    (root/'analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False))
    print(json.dumps({'aggregate':aggregate,'diagnostic_checks':checks},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
