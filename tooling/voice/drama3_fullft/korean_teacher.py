"""Training-only Korean HuBERT supervision; leaves Drama3 codec and inference schema intact."""
import hashlib,json
from pathlib import Path
import torch
import torch.nn.functional as F
from functools import lru_cache

TEACHER_ID='team-lucid/hubert-large-korean'
TEACHER_REV='62054d17ebf51437336a371a2cdd80d5da2b44ac'
TEACHER_LAYER=12
TEACHER_DIM=1024


def build_training_stats(root,rows,codec_contract):
    root=Path(root);total=torch.zeros(TEACHER_DIM,dtype=torch.float64);squared=torch.zeros_like(total);count=0
    for row in rows:
        if row['split']!='train':continue
        data=torch.load(root/(row['clip_id']+'.pt'),map_location='cpu',weights_only=True)
        if data['source_sha256']!=row['sha256'] or data['teacher_revision']!=TEACHER_REV:
            raise ValueError('Changed training target in teacher statistics')
        value=data['features'].double();total+=value.sum(0);squared+=value.square().sum(0);count+=len(value)
    if not count:raise ValueError('No training frames')
    mean=total/count;std=(squared/count-mean.square()).clamp_min(0).sqrt()
    identities={row['clip_id']:row['sha256'] for row in rows if row['split']=='train'}
    stats={'mean':mean.float(),'std':std.float(),'frames':count,'split':'train','teacher_revision':TEACHER_REV,
           'training_source_hashes':identities,
           'layer':TEACHER_LAYER,'codec_profile_id':codec_contract['codec_profile_id']}
    torch.save(stats,root/'training_stats.pt');load_stats.cache_clear();return stats


@lru_cache(maxsize=4)
def load_stats(root):
    stats=torch.load(Path(root)/'training_stats.pt',map_location='cpu',weights_only=True)
    if stats['teacher_revision']!=TEACHER_REV or stats['layer']!=TEACHER_LAYER:raise ValueError('Teacher normalization profile mismatch')
    if stats['split']!='train' or stats['mean'].shape!=(TEACHER_DIM,) or stats['std'].shape!=(TEACHER_DIM,):
        raise ValueError('Teacher normalization must use training clips only')
    return stats


def align_features(features,frames,*,sample_rate=44100,frame_length=2048):
    """Interpolate contextual teacher states at codec frame centers, without time warping.

    HuBERT convolutions:320sample stride,400sample receptive field at16kHz.
    Frame-center alignment is an approximation, not a phoneme forced alignment.
    """
    if features.ndim!=2 or len(features)==0:raise ValueError('Expected teacher time x hidden states')
    times=(torch.arange(frames,device=features.device,dtype=torch.float32)+.5)*frame_length/sample_rate
    indices=((times*16000-199.5)/320).clamp(0,len(features)-1)
    lo=indices.floor().long();hi=(lo+1).clamp_max(len(features)-1);alpha=(indices-lo).unsqueeze(-1)
    return features[lo]*(1-alpha)+features[hi]*alpha


def load_teacher_targets(root,row,frames,codec_contract):
    data=torch.load(Path(root)/(row['clip_id']+'.pt'),map_location='cpu',weights_only=True)
    if data.get('source_sha256')!=row['sha256']:raise ValueError('Teacher features refer to another recording')
    if data.get('teacher_id')!=TEACHER_ID or data.get('teacher_revision')!=TEACHER_REV or data.get('layer')!=TEACHER_LAYER:
        raise ValueError('Teacher feature profile mismatch')
    if data.get('codec_profile_id')!=codec_contract['codec_profile_id']:raise ValueError('Teacher/codec frame profile mismatch')
    values=data['features']
    if values.shape!=(frames,TEACHER_DIM) or not torch.isfinite(values).all():raise ValueError('Invalid aligned teacher targets')
    stats=load_stats(str(root))
    if stats['codec_profile_id']!=codec_contract['codec_profile_id']:raise ValueError('Teacher normalization codec mismatch')
    # Remove a corpus-level constant direction so a head cannot win by predicting only the global mean.
    return ((values.float()-stats['mean'])/stats['std'].clamp_min(.05)).clamp(-10,10)


def teacher_loss(head,hidden,mask,targets):
    expected=int(mask.sum())
    if targets is None or tuple(targets.shape)!=(expected,head.out_features):raise ValueError('Teacher targets must cover assistant audio only')
    predicted=head(hidden[mask]).float();targets=targets.to(predicted.device,dtype=torch.float32).detach()
    # Cosine avoids rewarding arbitrary teacher-state scale or importing loudness as linguistic content.
    return (1-F.cosine_similarity(predicted,targets,dim=-1,eps=1e-6)).mean()
