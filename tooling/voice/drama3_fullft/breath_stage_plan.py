"""New, immutable204-target stage; legacy160-target stage remains unchanged."""
import re
from .single_voice_plan import digest,pair_at,require_frozen_plan,TTS_PARAMETERS,SOURCE23
from .breath_conditioned_data import prepare_event_row

def build_plan(rows,schedule,*,source23_manifest_sha256,seed=20261027):
    lookup={r['clip_id']:r for r in rows}
    if len(lookup)!=len(rows) or len({r['speaker_id'] for r in rows})!=1:raise ValueError('Unique IDs and exactly one voice required')
    if not re.fullmatch('[0-9a-f]{64}',source23_manifest_sha256):raise ValueError('Source checkpoint identity required')
    targets={r['clip_id'] for r in rows if r['split']=='train'}
    validation=sorted(r['clip_id'] for r in rows if r['split']=='validation')
    if len(targets)!=204 or len(validation)!=57:raise ValueError('Expected204train and57whole-recording heldout clips')
    ordered=sorted(schedule,key=lambda s:(s['new_stage_update'],s['micro'],s['rank']))
    expected=[(u,m,r) for u in range(1,14) for m in range(2) for r in range(8)]
    if [(s['new_stage_update'],s['micro'],s['rank']) for s in ordered]!=expected:raise ValueError('Incomplete208-position schedule')
    observed=[]
    for i,item in enumerate(ordered):
        t,r=lookup[item['target']],lookup[item['reference']]
        if t['split']!='train' or r['split']!='reference' or t['recording_id']==r['recording_id']:raise ValueError('Disjoint fixed reference required')
        if t['speaker_id']!=r['speaker_id'] or item['speaker_id']!=t['speaker_id'] or not 0<=item['speaker_slot']<16:raise ValueError('Wrong voice role')
        prepare_event_row(t)
        if item.get('explicit_replay')!=(i>=204):raise ValueError('Replay must be disclosed')
        observed.append(t['clip_id'])
    if set(observed)!=targets or len(set(observed[:204]))!=204:raise ValueError('Every train clip exactly once before4replays')
    if {lookup[x]['recording_id'] for x in validation}!={'asmr01_source02'}:raise ValueError('Whole-recording holdout changed')
    fields=['clip_id','speaker_id','sha256','text','recording_id','split','schema_version','aligned_words','vocal_events','verified_delivery_instruction']
    identities=[{k:r.get(k) for k in fields} for r in sorted(rows,key=lambda r:r['clip_id'])]
    plan={'schema':'miro-breath-aware-fullft-v2','speaker_id':rows[0]['speaker_id'],'source_checkpoint':SOURCE23,
        'source_checkpoint_updates':23,'source_checkpoint_manifest_sha256':source23_manifest_sha256,
        'steps':13,'world':8,'accumulation':2,'global_batch':16,'seed':seed,'unique_target_presentations':204,
        'explicit_replay_presentations':4,'schedule':ordered,'validation':validation,
        'validation_padded':validation+validation[:7],'manifest_identity_sha256':digest(identities),
        'tts_learning_rate':1e-6,'head_learning_rate':5e-4,'teacher_weight':.1,'tts_parameters':TTS_PARAMETERS,
        'optimizer_reset_at_new_stage_only':True,'teacher_projection_reinitialized_for_new_train_only_stats':True,
        'lora':False,'codec_frozen':True,'quality_improvement_guaranteed':False,
        'checkpoint_policy':'Complete final or budget-boundary optimizer/RNG/cursor save with parent Volume commit; independent fresh-engine reload',
        'emotion_policy':'No unverified emotion, delivery or breath labels'}
    plan['sha256']=digest(plan);return plan
