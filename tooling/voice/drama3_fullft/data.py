"""Human-recording manifests; speaker-balanced targets and disjoint references."""
import argparse,collections,hashlib,json,random,re
from pathlib import Path
import torch


def read_rows(path):
    p=Path(path);rows=[json.loads(line) for line in p.read_text().splitlines() if line.strip()]
    seen=set()
    for row in rows:
        for key in ['clip_id','speaker_id','text','audio_path','recording_id','split','source_kind']:
            if not row.get(key):raise ValueError(f'Missing {key}: {row}')
        if row['clip_id'] in seen:raise ValueError('Duplicate clip ID '+row['clip_id'])
        if not re.fullmatch(r'[A-Za-z0-9_\-]+',row['clip_id']):raise ValueError('Unsafe clip ID')
        seen.add(row['clip_id'])
        if row['source_kind']!='human_recording':raise ValueError('This pilot uses real recordings only')
        if row['split'] not in ['train','validation','test','reference']:raise ValueError('Unknown split')
        if not re.search('[가-힣]',row['text']):raise ValueError('Korean adaptation requires Korean text')
        if not Path(row['audio_path']).is_file():raise FileNotFoundError(row['audio_path'])
        if not re.fullmatch('[0-9a-f]{64}',row.get('sha256','')):raise ValueError('Missing source SHA256')
    # Prevent same recording/text leaking into validation via other slices/takes.
    for field in ['recording_id','text']:
        groups=collections.defaultdict(set)
        for row in rows:
            if row['split']=='reference':continue
            key=row[field] if field!='text' else re.sub('[^가-힣]','',row[field])
            groups[row['speaker_id'],key].add(row['split'])
        if any(len(x)>1 for x in groups.values()):raise ValueError('Split leakage by '+field)
    return rows


def choose_pair(rows,step,rank=0,world_size=1,seed=1234,split='train'):
    speakers=sorted({r['speaker_id'] for r in rows if r['split']==split})
    if not speakers:raise ValueError('No '+split+' targets')
    # A balanced schedule per world microbatch; utterance counts cannot dominate.
    offset=step*world_size+rank;epoch,index=divmod(offset,len(speakers))
    rng=random.Random(seed+epoch);rng.shuffle(speakers);speaker=speakers[index]
    rng=random.Random(seed+offset*104729)
    target=rng.choice([r for r in rows if r['speaker_id']==speaker and r['split']==split])
    references=[r for r in rows if r['speaker_id']==speaker and r['split'] in ['train','reference'] and
                r['clip_id']!=target['clip_id'] and r['recording_id']!=target['recording_id'] and
                re.sub('[^가-힣]','',r['text'])!=re.sub('[^가-힣]','',target['text'])]
    if not references:raise ValueError('No disjoint reference for '+speaker)
    ref=rng.choice(references);slot=rng.randrange(16)
    return target,ref,slot


def make_batch(target,reference,slot,model,tokenizer,code_root,codec_contract,teacher_root=None):
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt
    from .core import training_rows
    from .codec_contract import validate_cache
    def codes(row):
        data=torch.load(Path(code_root)/(row['clip_id']+'.pt'),map_location='cpu',weights_only=True)
        return validate_cache(data,row['sha256'],codec_contract)
    direction=target.get('delivery_instruction','').strip()
    text=(f'[{direction}] ' if direction else '')+target['text']
    tag=f'<|speaker:{slot}|>'
    prompt=build_drama3_prompt(tag+text,tokenizer,model.config,[tag+reference['text']],[codes(reference)])
    target_codes=codes(target);batch=training_rows(prompt,target_codes,model.config)
    if teacher_root is not None:
        from .korean_teacher import load_teacher_targets
        batch['teacher_targets']=load_teacher_targets(teacher_root,target,target_codes.shape[-1],codec_contract)
    return batch


def audit(path):
    rows=read_rows(path);counts=collections.Counter((r['speaker_id'],r['split']) for r in rows)
    for speaker in sorted({r['speaker_id'] for r in rows}):
        if counts[speaker,'train']<2 or counts[speaker,'validation']<1:
            raise ValueError('Need2train targets and1validation target for '+speaker)
    for i in range(max(64,len(counts)*4)):choose_pair(rows,i)
    return {'clips':len(rows),'speakers':len({r['speaker_id'] for r in rows}),
            'counts':{f'{s}/{part}':n for (s,part),n in counts.items()},
            'multi_speaker_data_ready':len({r['speaker_id'] for r in rows})>=2,
            'same_recording_or_text_split_leakage':False,'manifest_sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest()}


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('manifest');a=ap.parse_args();print(json.dumps(audit(a.manifest),ensure_ascii=False,indent=2))
