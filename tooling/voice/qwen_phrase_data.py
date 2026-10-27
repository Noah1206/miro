"""Observed phrase timing and factual, reproducible Qwen conditioning."""
import re

EMOTIONS={'normal':'무감정','happy':'기쁨','sad':'슬픔','angry':'분노'}
SPEEDS={'slow':'느리게','normal':'보통','fast':'빠르게'}
PAUSES={'none':'없음','short':'짧게','long':'길게','end':'마침'}

def norm(text):return re.sub('[^가-힣a-zA-Z0-9]','',text)

def phrases(text,ptr=None):
    parts=[x.strip(' ,.!?…') for x in (ptr or '').split('/') if norm(x)]
    if len(parts)<2 or ''.join(norm(x) for x in parts)!=norm(text):
        parts=[x.strip() for x in re.split('[,.!?…]+',text) if norm(x)]
    if ''.join(norm(x) for x in parts)!=norm(text):parts=[text]
    # Adjacent fragments stay in their original order, with at most six slots.
    while len(parts)>6:
        idx=min(range(len(parts)-1),key=lambda i:len(parts[i])+len(parts[i+1]))
        parts[idx:idx+2]=[parts[idx]+' '+parts[idx+1]]
    return parts

def requested_plan(text,speed='normal',pause='short'):
    parts=phrases(text)
    return {'tempo':speed,'phrases':[{'text':x,'tempo':speed,'pause':pause if i+1<len(parts) else 'end'} for i,x in enumerate(parts)]}

def instruction(mode,plan,variant=0):
    if variant%3==0:
        header=f"감정: {EMOTIONS[mode]}. 전체 속도: {SPEEDS[plan['tempo']]}. "
        chunks=[f"구절{i+1} '{r['text']}': 속도 {SPEEDS[r['tempo']]}, 뒤쉼 {PAUSES[r['pause']]}" for i,r in enumerate(plan['phrases'])]
    elif variant%3==1:
        header=f"{EMOTIONS[mode]} 감정으로 말하세요. 전체 말하기 속도는 {SPEEDS[plan['tempo']]}입니다. "
        chunks=[f"{i+1}번째 '{r['text']}'는 {SPEEDS[r['tempo']]}, 이후 쉼은 {PAUSES[r['pause']]}" for i,r in enumerate(plan['phrases'])]
    else:
        header=f"감정은 {EMOTIONS[mode]}, 발화 속도는 {SPEEDS[plan['tempo']]}. "
        chunks=[f"'{r['text']}' 구간은 {SPEEDS[r['tempo']]} 말하고 다음 쉼은 {PAUSES[r['pause']]}" for r in plan['phrases']]
    return header+'; '.join(chunks)+'.'

def ctc_word_spans(emission,targets,blank):
    # TorchAudio's bundle Aligner merges with blank=0 internally. This Korean
    # vocabulary uses blank=1204, so both forced_align AND merge_tokens must get it.
    import torch
    import torchaudio.functional as af
    flat=[x for group in targets for x in group]
    aligned,scores=af.forced_align(emission.unsqueeze(0),torch.tensor([flat],device=emission.device,dtype=torch.int32),blank=blank)
    spans=af.merge_tokens(aligned[0],scores[0].exp(),blank=blank)
    if len(spans)!=len(flat):raise ValueError('CTC merged-token length mismatch')
    groups=[];offset=0
    for group in targets:groups.append(spans[offset:offset+len(group)]);offset+=len(group)
    return groups

def align_utterance(waveform,sr,text,ptr,model,tokenizer,aligner):
    """Korean CTC word spans; low-energy pauses at source boundaries."""
    import numpy as np
    import torch,torchaudio
    words=re.findall('[가-힣A-Za-z0-9]+',text)
    if not words:raise ValueError('Unusable normalized word')
    targets=tokenizer(words)  # Unsupported syllables must fail, never invent times.
    y=torch.as_tensor(waveform,dtype=torch.float32).reshape(1,-1)
    if sr!=16000:y=torchaudio.functional.resample(y,sr,16000)
    # Match Wav2Vec2FeatureExtractor(do_normalize=True); keep raw y for pause RMS.
    values=(y-y.mean(dim=-1,keepdim=True))/torch.sqrt(y.var(dim=-1,keepdim=True,unbiased=False)+1e-7)
    with torch.inference_mode():
        emission=model(values.to(next(model.parameters()).device)).logits.log_softmax(-1)
        spans=aligner(emission[0],targets)
    ratio=y.shape[1]/16000/emission.shape[1]
    observed=[]
    for wi,(word,group) in enumerate(zip(words,spans)):
        if wi+1<len(words):group=group[:-1]  # Do not count the | separator as speech.
        if not group:raise ValueError('Empty aligned word')
        duration=sum(x.end-x.start for x in group)
        observed.append({'text':word,'start':group[0].start*ratio,'end':group[-1].end*ratio,'confidence':sum(x.score*(x.end-x.start) for x in group)/duration})
    score=float(np.mean([x['confidence'] for x in observed]))
    if score<.10:raise ValueError(f'Low mean alignment confidence {score:.3f}')
    parts=phrases(text,ptr);offset=0;word_index=0;regions=[]
    cumulative=np.cumsum([len(norm(w)) for w in words]).tolist()
    audio=y[0].cpu().numpy();frame=320;n=len(audio)//frame
    rms=np.sqrt(np.mean(audio[:n*frame].reshape(n,frame)**2,axis=1));db=20*np.log10(rms+1e-10);threshold=float(np.percentile(db,95)-30)
    for i,part in enumerate(parts):
        endpoint=offset+len(norm(part))
        if endpoint not in cumulative:raise ValueError('Phrase boundary falls within a word')
        last=cumulative.index(endpoint);start=observed[word_index]['start'];end=observed[last]['end']
        confidence=float(np.mean([x['confidence'] for x in observed[word_index:last+1]]));syllables=len(re.sub('[^가-힣]','',part));rate=syllables/max(.08,end-start)
        if confidence<.05 or not .12<=end-start or not 1<=rate<=18:raise ValueError('Implausible phrase alignment/rate')
        next_start=observed[last+1]['start'] if last+1<len(observed) else end
        lo=max(0,int(np.ceil(end/.02)));hi=min(n,int(np.floor(next_start/.02)))
        best=run=0;best_end=lo
        for j in range(lo,hi):
            run=run+1 if db[j]<threshold else 0
            if run>best:best=run;best_end=j+1
        pause=best*.02 if best>=3 else 0.
        regions.append({'text':part,'start':start,'end':end,'syllables_per_second':rate,'alignment_confidence':confidence,'gap_seconds':max(0,next_start-end),'pause_seconds':pause,'pause_start':(best_end-best)*.02 if pause else end,'pause_end':best_end*.02 if pause else end})
        offset=endpoint;word_index=last+1
    return {'alignment_confidence':score,'words':observed,'phrases':regions,'syllables_per_second':sum(len(re.sub('[^가-힣]','',x['text'])) for x in regions)/sum(x['end']-x['start'] for x in regions),'method':'Apache-2.0 Korean wav2vec2 CTC + torchaudio2.7 forced_align; low-energy >=60ms at aligned source phrase boundaries','energy_threshold_dbfs':threshold}

def observed_plan(alignment,thresholds):
    def tempo(x):return 'slow' if x<thresholds[0] else 'fast' if x>thresholds[1] else 'normal'
    rows=[]
    for i,row in enumerate(alignment['phrases']):
        pause='none' if row['pause_seconds']<.08 else 'short' if row['pause_seconds']<.30 else 'long'
        rows.append({'text':row['text'],'tempo':tempo(row['syllables_per_second']),'pause':pause if i+1<len(alignment['phrases']) else 'end'})
    return {'tempo':tempo(alignment['syllables_per_second']),'phrases':rows}

def continuation_alignment(alignment):
    """An alternative plan adds one observed <80ms within-phrase word boundary.

    It is an annotation view of the SAME recording, not fabricated silence or a
    claim that the added boundary is a human-labeled linguistic phrase.
    """
    import copy
    words=alignment['words'];candidates=[]
    for pi,phrase in enumerate(alignment['phrases']):
        inside=[w for w in words if w['start']>=phrase['start']-1e-5 and w['end']<=phrase['end']+1e-5]
        for i in range(1,len(inside)-2):
            left,right=inside[:i+1],inside[i+1:];gap=right[0]['start']-left[-1]['end']
            if gap>=.08 or min(w['confidence'] for w in [left[-1],right[0]])<.15:continue
            if min(left[-1]['end']-left[0]['start'],right[-1]['end']-right[0]['start'])<.3:continue
            candidates.append((abs(len(left)-len(right)),pi,left,right,gap))
    if not candidates or len(alignment['phrases'])>=6:return None
    _,pi,left,right,gap=min(candidates,key=lambda x:(x[0],x[1]));original=alignment['phrases'][pi];parts=[]
    for group,last in [(left,False),(right,True)]:
        text=' '.join(w['text'] for w in group);start=group[0]['start'];end=group[-1]['end'];rate=len(re.sub('[^가-힣]','',text))/(end-start)
        if not 1<=rate<=18:return None
        parts.append({**original,'text':text,'start':start,'end':end,'syllables_per_second':rate,'alignment_confidence':min(w['confidence'] for w in group),'gap_seconds':original['gap_seconds'] if last else gap,'pause_seconds':original['pause_seconds'] if last else 0.,'pause_start':original['pause_start'] if last else end,'pause_end':original['pause_end'] if last else end,'boundary_source':'original ptr' if last else 'observed word continuation <80ms'})
    result=copy.deepcopy(alignment);result['phrases'][pi:pi+1]=parts;result['annotation_view']='one measured continuation boundary added';return result
