"""Opt-in batch adapter for new breath-aware stages; legacy trainer unchanged.

The old160-example trainer/plan intentionally cannot resume a different dataset
by ignoring its saved hash. A newly authorized stage must select this adapter,
prepare SHA-bound codec/teacher features and publish a new plan identity.
"""
from pathlib import Path
import hashlib,json,re
from .breath_data import event_training_text


def prepare_event_row(row):
    if row.get('schema_version')!='miro-breath-aware-draft-v2':
        raise ValueError('Explicit new dataset version required')
    if row.get('source_kind')!='human_recording':
        raise ValueError('Generated comparison audio must never become training data')
    if row.get('split')!='train':raise ValueError('Only training targets may be adapted')
    if not re.fullmatch('[0-9a-f]{64}',row.get('sha256','')):
        raise ValueError('Missing waveform identity')
    events=row.get('vocal_events',[])
    text=event_training_text(row['text'],row.get('aligned_words',[]),events,
        duration=row['duration_seconds'],standalone=row.get('audio_kind')=='vocal_event_only')
    return {**row,'text':text,'delivery_instruction':row.get('verified_delivery_instruction','')}


def make_breath_batch(target,reference,slot,model,tokenizer,code_root,codec_contract,teacher_root=None):
    from .data import make_batch
    # make_batch/validate_cache bind both reference and target to their waveform
    # hashes. Relabeling an old token cache cannot bypass the audio contract.
    return make_batch(prepare_event_row(target),reference,slot,model,tokenizer,
                      code_root,codec_contract,teacher_root)


def validate_breath_manifest(path,heldout_recording='asmr01_source02'):
    rows=[json.loads(s) for s in Path(path).read_text().splitlines() if s]
    ids=set();proof=[]
    for row in rows:
        if row['clip_id'] in ids or not re.fullmatch('[A-Za-z0-9_-]+',row['clip_id']):
            raise ValueError('Duplicate/unsafe target ID')
        ids.add(row['clip_id'])
        if row['recording_id']==heldout_recording:raise ValueError('Held-out recording leakage')
        waveform=Path(row['audio_path'])
        if hashlib.sha256(waveform.read_bytes()).hexdigest()!=row['sha256']:
            raise ValueError('Derived audio changed')
        compiled=prepare_event_row(row)
        proof.append({'clip_id':row['clip_id'],'sha256':row['sha256'],
            'point_event_tags':sum(e.get('verified') is True for e in row.get('vocal_events',[])),
            'conditioning_text':compiled['text']})
    return {'clips':len(rows),'heldout_recording_excluded':True,'targets':proof,
            'paid_training_started':False,'new_trainer_execution_verified':False}
