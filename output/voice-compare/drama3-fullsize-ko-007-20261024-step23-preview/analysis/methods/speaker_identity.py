import os
os.environ['OMP_NUM_THREADS']='2';os.environ['MKL_NUM_THREADS']='2';os.environ['OPENBLAS_NUM_THREADS']='2'
from pathlib import Path
import json,numpy as np,torch,soundfile as sf
from resemblyzer import VoiceEncoder,preprocess_wav
root=Path('/Users/johyeon-ung/Desktop/Miro/output/voice-compare/drama3-fullsize-ko-007-20261024-step23-preview');out=root/'analysis';torch.set_num_threads(2)
encoder=VoiceEncoder(device='cpu',verbose=False)
real=Path('/Users/johyeon-ung/Desktop/Miro/output/voice-compare/drama3-fullsize-ko-007-20261024-step5-preview/real_recordings');paths=[root/'reference.wav',*sorted(real.glob('*.wav'))]
def emb(path):
 y,sr=sf.read(path,dtype='float32');return encoder.embed_utterance(preprocess_wav(y,source_sr=sr))
enrollment=np.array([emb(p) for p in paths]);centroid=enrollment.mean(0);centroid/=np.linalg.norm(centroid)
human=[]
for i,path in enumerate(paths):
 others=np.delete(enrollment,i,axis=0).mean(0);others/=np.linalg.norm(others);human.append({'file':str(path),'leave_one_out_centroid_cosine':float(enrollment[i]@others),'to_reference_cosine':float(enrollment[i]@enrollment[0])})
report={'additional_cost_usd':0,'cloud_calls':0,'model':'resemblyzer packaged pretrained CPU','analysis_only_preprocessing':'16kHz resampling, VAD and loudness normalization in speaker features; listening WAVs unchanged','limitations':['Cosine is a model-dependent identity proxy, not listening preference or voice authenticity.','Whisper and noise can change the score; no calibrated threshold for Korean actor007.'],'real_enrollment':human,'items':[]}
for row in json.loads((root/'comparison_results.json').read_text())['items']:
 e=emb(root/row['file']);r={**row,'cosine_to_007_reference':float(e@enrollment[0]),'cosine_to_007_real_centroid':float(e@centroid)};report['items'].append(r);(out/'speaker_identity.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('SPEAKER',row['arm'],row['id'],row['seed'],round(r['cosine_to_007_real_centroid'],3),flush=True)
report['complete']=True;(out/'speaker_identity.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
