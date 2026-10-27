"""Time-aligned acoustic controls for the pinned Qwen Base research model.

The adapter is separate from Qwen weights and is required at inference.
Targets are observed acoustics, not invented scene annotations.
"""
import re
import numpy as np
import torch
from torch import nn

FPS = 12.5
FEATURES = ['progress', 'duration_over_8s', 'remaining_over_8s',
            'phrase_rate_over_8', 'energy_relative_over_12db', 'speech_region',
            'phrase_progress']


class FrameAdapter(nn.Module):
    def __init__(self, hidden):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(len(FEATURES),128),nn.SiLU(),nn.Linear(128,hidden))
        nn.init.zeros_(self.net[-1].weight);nn.init.zeros_(self.net[-1].bias)

    def forward(self, features):
        return self.net(features.to(self.net[0].weight.dtype))


def trajectory(n, duration, regions, energy_time, energy_db, speaker_db):
    # The last entry predicts EOS. No codec token or phonetic identity is a
    # feature; duration and envelopes are explicit requested controls.
    ts = np.arange(n+1)/FPS
    x = np.zeros((n+1,len(FEATURES)),np.float32)
    x[:,0] = np.minimum(ts/max(.08,duration),1.5)
    x[:,1] = duration/8
    x[:,2] = np.clip((duration-ts)/8,-1,2)
    for part in regions:
        active = (ts >= part['start']) & (ts < part['end'])
        x[active,3] = part['rate']/8
        x[active,5] = 1
        x[active,6] = (ts[active]-part['start'])/max(.08,part['end']-part['start'])
    x[:,4] = np.clip((np.interp(ts,energy_time,energy_db)-speaker_db)/12,-2,1)
    x[x[:,5]==0,4] = 0
    return x


def observed_features(y,sr,row,n,speaker_db):
    if y.ndim==2:y=y.mean(axis=1)
    size=round(sr*.02);count=len(y)//size
    db=20*np.log10(np.sqrt(np.mean(y[:count*size].reshape(count,size)**2,axis=1))+1e-10)
    # A 400ms median envelope avoids exposing phone-scale amplitude patterns.
    smooth=np.array([np.median(db[max(0,i-10):min(count,i+11)]) for i in range(count)])
    regions=[{'start':p['start'],'end':p['end'],'rate':p['syllables_per_second']} for p in row['alignment']['phrases']]
    return trajectory(n,n/FPS,regions,(np.arange(count)+.5)*.02,smooth,speaker_db)


def planned_features(plan,base_rate,speaker_db,max_frames=180):
    regions=[];times=[0.];levels=[speaker_db];cursor=.16
    for p in plan['phrases']:
        syllables=len(re.sub('[^가-힣]','',p['text']))
        rate=base_rate*p['rate_relative_to_character']
        duration=max(.16,syllables/rate)
        regions.append({'start':cursor,'end':cursor+duration,'rate':rate})
        for position,db in [(0,p['energy_start_db']),(.5,p['energy_mid_db']),(1,p['energy_end_db'])]:
            times.append(cursor+position*duration);levels.append(speaker_db+db)
        cursor+=duration+p['pause_after_ms']/1000
    duration=cursor+.12
    if duration>12:raise ValueError('Requested trajectory exceeds bounded generation')
    features=trajectory(max_frames,duration,regions,times,levels,speaker_db)
    return features,{'planned_duration_seconds':duration,'regions':regions,'base_rate':base_rate,
                     'speaker_speech_dbfs':speaker_db,'features':FEATURES}


class GenerationControl:
    """Inject at the same prediction positions as teacher-forced training."""
    def __init__(self,qwen,adapter,features,enabled=True):
        self.qwen=qwen;self.adapter=adapter;self.features=features;self.enabled=enabled
        self.frame=0;self.calls=[];self.handle=None

    def __enter__(self):
        def hook(module,args,kwargs):
            embeds=kwargs['inputs_embeds'];length=embeds.shape[1]
            if not self.calls:
                if length<2:raise RuntimeError('Expected SDK nonstreaming prefill')
                frame=0
            else:
                if length!=1:raise RuntimeError('Expected cached single-frame decode')
                frame=self.frame+1
            if frame>=len(self.features):raise RuntimeError('Control trajectory exhausted')
            self.frame=frame;self.calls.append({'frame':frame,'input_length':length})
            if self.enabled:
                delta=self.adapter(self.features[frame:frame+1]).to(embeds.dtype)
                updated=embeds.clone();updated[:,-1,:]=updated[:,-1,:]+delta
                kwargs={**kwargs,'inputs_embeds':updated}
            return args,kwargs
        self.handle=self.qwen.model.talker.model.register_forward_pre_hook(hook,with_kwargs=True)
        return self

    def __exit__(self,*args):
        self.handle.remove()


def validate_plan(plan,text):
    parts=plan.get('phrases',[])
    normalize=lambda s:re.sub(r'[^가-힣A-Za-z0-9]','',s)
    if not 1<=len(parts)<=6 or ''.join(normalize(p['text']) for p in parts)!=normalize(text):
        raise ValueError('Planner changed spoken text')
    for p in parts:
        for name,low,high in [('rate_relative_to_character',.7,1.3),('energy_start_db',-5,4),
                              ('energy_mid_db',-5,4),('energy_end_db',-5,4),('pause_after_ms',0,700)]:
            value=p[name]
            if isinstance(value,bool) or not isinstance(value,(float,int)) or not np.isfinite(value) or not low<=value<=high:
                raise ValueError(f'Invalid director control {name}: {value}')
    return plan
