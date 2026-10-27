"""Compare held-out content, speaker and prosody; no automated naturalness claim."""
import json,sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from analyze_qwen_bottleneck import feature,pitchpair

def main(folder):
 p=Path(folder);m=json.loads((p/'manifest.json').read_text());r=json.loads((p/'report.json').read_text());a={x['file']:x for x in json.loads((p/'asr_speaker_audit.json').read_text())};h=json.loads((p/'training_history.json').read_text())
 names=sorted({x['file'] for x in r['items']}|{x['file'] for x in m['baselines']})
 with ProcessPoolExecutor(max_workers=3) as pool:result=list(pool.map(feature,[str(p/n) for n in names]))
 feats={d['file']:d for d,x in result};arrays={d['file']:x for d,x in result};rows=[]
 modes=['clone','previous_ft']+[f'conditioned_e{epoch}' for epoch in range(1,m['settings']['epochs']+1)]
 for row in m['test_items']:
  sid=row['id'];orig=f'{sid}_orig.wav'
  for suffix in modes:
   name=f'{sid}_{suffix}.wav';f=feats[name];cmp=pitchpair(arrays[orig],arrays[name],dtw=True)
   rows.append({'id':sid,'mode':suffix,'file':name,'duration_ratio_to_original':f['duration_seconds']/feats[orig]['duration_seconds'],'f0_range_semitones':f['f0_range_semitones'],'pause_fraction':f['relative_silence_fraction'],'cer':a[name]['cer'],'speaker_similarity':a[name]['speaker_similarity'],**cmp})
 summary=[]
 for mode in modes:
  selected=[x for x in rows if x['mode']==mode];summary.append({'mode':mode,'n':len(selected),**{k:float(np.mean([x[k] for x in selected if x[k] is not None])) for k in ['cer','speaker_similarity','f0_correlation','f0_median_absolute_error_semitones','duration_ratio_to_original','f0_range_semitones','pause_fraction']}})
 controls=[]
 for row in m['matrix_items']:
  sid=row['id']
  for seed in [1234,4321]:
   base=feats[f'{sid}_normal_s{seed}.wav']
   for mode in m['instructions']:
    name=f'{sid}_{mode}_s{seed}.wav';f=feats[name]
    controls.append({'id':sid,'mode':mode,'seed':seed,'duration_ratio_to_normal':f['duration_seconds']/base['duration_seconds'],'rms_delta_db_to_normal':f['rms_dbfs']-base['rms_dbfs'],'f0_range_delta_to_normal':f['f0_range_semitones']-base['f0_range_semitones'],'voiced_fraction':f['voiced_fraction'],'cer':a[name]['cer']})
 margins=[]
 for label,val in [('initial',h['initial_validation'])]+[(f"epoch_{x['epoch']}",x['validation']) for x in h['epochs']]:
  c=val['instruction_contrast'];margins.append({'stage':label,'validation_macro_loss':val['macro_loss'],'contrast_count':len(c),'mean_wrong_minus_correct_nll':float(np.mean([x['wrong_minus_correct_nll'] for x in c])),'correct_prompt_better_count':sum(x['wrong_minus_correct_nll']>0 for x in c)})
 out={'best_epoch_by_validation':r['best_epoch'],'comparison_summary':summary,'test_comparisons':rows,'instruction_controls':controls,'validation_diagnostics':margins,'features':list(feats.values()),'limitations':['No subjective listening or naturalness score.','DTW F0 match to one actor take does not determine the only valid performance.','Dataset label predicts emotion category; instruction paraphrases, whispers, nonverbal sounds and phrase timing were not trained.','Both prompt alignment and conditioning changed, and validation split differs from earlier SFT. Not an isolated causal test of instruction conditioning.']}
 (p/'comparison_analysis.json').write_text(json.dumps(out,ensure_ascii=False,indent=2,allow_nan=False));print(json.dumps({'summary':summary,'validation':margins,'best_epoch':r['best_epoch']},ensure_ascii=False))
if __name__=='__main__':main(sys.argv[1])
