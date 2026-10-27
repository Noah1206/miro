"""Breath-aware, versioned audio preparation. No training or paid dispatch.

A low sound-class score is not proof of absence. Word spans, suspected breaths,
whispers and uncertain gaps must be protected by the caller. Only confirmed
point events enter training text; ordinary bracket text keeps the codec and
token vocabulary unchanged. Legacy160-example manifests are never overwritten.
"""
import re
import numpy as np

TAGS={'breathing':'[breathing]','sigh':'[sighs]','gasp':'[gasps]','pant':'[panting]'}


def compact_quiet(audio,sample_rate,*,speech,protected_events,noise_floor_db,
                  internal_min=.45,internal_keep=.18,edge_min=.15,edge_keep=.08):
    if audio.ndim!=1 or len(audio)==0 or sample_rate<=0 or not np.isfinite(audio).all():
        raise ValueError('Finite mono audio required')
    if not speech:raise ValueError('No verified alignment envelope; do not erase non-speech audio')
    frame=round(sample_rate*.02);n=(len(audio)+frame-1)//frame
    padded=np.pad(audio,(0,n*frame-len(audio)))
    db=20*np.log10(np.sqrt((padded.reshape(n,frame).astype(np.float64)**2).mean(1))+1e-12)
    # This threshold is deliberately below typical quiet ASMR speech. Combined
    # with explicit protected regions, it proposes cuts; it is not a breath VAD.
    threshold=min(-50.,float(noise_floor_db)+3.)
    quiet=db<threshold
    protected=[]
    for start,end in [*speech,*protected_events]:
        if not np.isfinite([start,end]).all() or not 0<=start<end<=len(audio)/sample_rate+.003:
            raise ValueError('Bad protected interval')
        a=max(0,int((start-.08)*sample_rate));b=min(len(audio),int((end+.08)*sample_rate))
        protected.append((a,b));quiet[a//frame:min(n,(b+frame-1)//frame)]=False
    changes=np.diff(np.r_[False,quiet,False].astype(np.int8))
    runs=list(zip(np.flatnonzero(changes==1),np.flatnonzero(changes==-1)))
    cuts=[]
    for first,last in runs:
        a=int(first)*frame;b=min(int(last)*frame,len(audio));edge=a==0 or b==len(audio)
        if (b-a)/sample_rate<(edge_min if edge else internal_min):continue
        keep=round((edge_keep if edge else internal_keep)*sample_rate)
        if a==0:b-=keep
        elif b==len(audio):a+=keep
        else:a+=keep//2;b-=keep-keep//2
        if b>a:
            assert not any(a<right and b>left for left,right in protected)
            cuts.append((a,b))
    pieces=[];start=0;new_start=0
    for a,b in [*cuts,(len(audio),len(audio))]:
        if a>start:
            pieces.append({'source_start_sample':start,'source_end_sample':a,'new_start_sample':new_start})
            new_start+=a-start
        start=b
    if not pieces:raise ValueError('Would erase the whole utterance')
    result=np.concatenate([audio[p['source_start_sample']:p['source_end_sample']] for p in pieces])
    # Keep every retained sample untouched, including breaths. No noise gate,
    # time stretch, gain change or synthesized breath insertion.
    return result,{'cuts_samples':cuts,'pieces':pieces,'sample_rate':sample_rate,
                   'removed_seconds':(len(audio)-len(result))/sample_rate,
                   'threshold_dbfs':threshold,'protected_sample_envelopes':protected,
                   'proposed_edit_not_human_validated':True}


def remap_time(seconds,mapping):
    sample=seconds*mapping['sample_rate']
    for piece in mapping['pieces']:
        if piece['source_start_sample']-1e-5<=sample<=piece['source_end_sample']+1e-5:
            return (piece['new_start_sample']+sample-piece['source_start_sample'])/mapping['sample_rate']
    raise ValueError('Annotation lies inside removed audio; refuse misaligned labels')


def event_training_text(text,words,events,*,duration,standalone=False):
    """Insert only human-confirmed, nonoverlapping real events at word boundaries.

    This is plain text conditioning, not a newly invented special tokenizer ID.
    Recognition alone cannot establish breath presence or precise event timing.
    """
    approved=[e for e in events if e.get('verified') is True]
    for event in approved:
        if event.get('kind') not in TAGS or event.get('audio_present') is not True:
            raise ValueError('Only real, confirmed supported events are trainable')
        if not 0<=event['start']<event['end']<=duration:
            raise ValueError('Event outside audio')
    ordered=sorted(approved,key=lambda e:e['start'])
    if any(a['end']>b['start'] for a,b in zip(ordered,ordered[1:])):
        raise ValueError('Overlapping event labels')
    if standalone:
        if text.strip() or words or len(ordered)!=1:
            raise ValueError('Pure breath sample needs one confirmed event and no fabricated spoken text')
        return TAGS[ordered[0]['kind']]
    if not approved:return text
    normalize=lambda s:re.sub('[^가-힣A-Za-z0-9]','',s)
    if normalize(''.join(w['word'] for w in words))!=normalize(text):
        raise ValueError('ASR words do not align with the preserved transcript')
    indices=[i for i,c in enumerate(text) if re.match('[가-힣A-Za-z0-9]',c)]
    lengths=[len(normalize(w['word'])) for w in words]
    insertions=[]
    for event in ordered:
        boundary=event['after_word_index']
        if not 0<=boundary<len(words)-1:raise ValueError('Need an internal, validated word boundary')
        if event['start']<words[boundary]['end'] or event['end']>words[boundary+1]['start']:
            raise ValueError('Breath overlaps spoken phonemes')
        position=indices[sum(lengths[:boundary+1])]
        insertions.append((position,TAGS[event['kind']]))
    for position,tag in sorted(insertions,reverse=True):text=text[:position]+tag+' '+text[position:]
    return text


def require_fresh_audio_cache(row,cached):
    if cached.get('source_sha256')!=row['sha256']:
        raise ValueError('Audio changed: re-encode codec AND teacher features; never relabel old codes')
