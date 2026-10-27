from pathlib import Path
import json,numpy as np,soundfile as sf,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=Path('/Users/johyeon-ung/Desktop/Miro/output/voice-compare/drama3-fullsize-ko-007-20261024-step23-preview');out=root/'analysis';data=json.loads((out/'acoustics.json').read_text());asr=json.loads((out/'local_asr.json').read_text())
fig,axes=plt.subplots(3,1,figsize=(11,7.7),sharex=True,sharey=True,layout='constrained')
for ax,arm,label,color in zip(axes,['original','step5','step23'],['Original Drama 3','Miro step5','Miro step23'],['#7979ad','#4d8ca1','#7453ad']):
 row=next(x for x in data['items'] if x['arm']==arm and x['id']=='long_comfort');y,sr=sf.read(root/row['file']);n=int(sr*.02);blocks=y[:len(y)//n*n].reshape(-1,n);db=20*np.log10(np.sqrt(np.mean(blocks**2,axis=1))+1e-10);t=(np.arange(len(db))+.5)*.02
 ax.plot(t,db,color=color,lw=.85);ax.axhline(row['active_gate_dbfs'],ls=':',color='#777777',lw=.7);end=row['active_span_seconds'][1]
 ax.axvspan(end,len(y)/sr,color='#ddc2bb',alpha=.45)
 cer=next(x['cer'] for x in asr['items'] if x['arm']==arm and x['id']=='long_comfort')
 ax.set_title(f"{label} | ASR CER {cer*100:.1f}% | low-energy tail {row['tail_after_activity_seconds']:.2f}s",loc='left',fontsize=11)
 ax.set_ylim(-90,-10);ax.set_ylabel('RMS dBFS');ax.grid(alpha=.15)
axes[-1].set_xlim(0,43);axes[-1].set_xlabel('Seconds (same scale; raw audio, no gain/time processing)')
fig.suptitle('Long line: speech delivery improved; shorter duration alone is not the evidence',fontsize=13)
fig.savefig(out/'long_delivery_diagnostic.png',dpi=160);print('Saved long_delivery_diagnostic.png')
