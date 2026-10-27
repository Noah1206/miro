"""Freeze a new single-voice stage without pretending it is the old007 resume."""
import hashlib,json,re
from pathlib import Path

SOURCE23='/voices/_drama3/fullsize-ko-007-20261024-continuous-v4/arms/korean_teacher/training_checkpoints/step-000023'
TTS_PARAMETERS=35899643008
STYLE_TAGS={'whispering','slow speech','fast speech','soft voice','strong voice'}
EMOTION_TAGS={'sad','happy','angry','anxious','hurt','curious','jealous'}

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def build_plan(rows,schedule,*,source23_manifest_sha256,seed=20261026):
    lookup={r['clip_id']:r for r in rows}
    if len(lookup)!=len(rows):raise ValueError('Duplicate clip identity')
    speakers={r['speaker_id'] for r in rows}
    if len(speakers)!=1:raise ValueError('This stage is exactly one user-confirmed voice')
    if not re.fullmatch('[0-9a-f]{64}',source23_manifest_sha256):raise ValueError('Missing verified source checkpoint manifest identity')
    if len(schedule)!=160:raise ValueError('Ten updates require160 target presentations')
    ordered=sorted(schedule,key=lambda s:(s['new_stage_update'],s['micro'],s['rank']))
    expected=[(u,m,r) for u in range(1,11) for m in range(2) for r in range(8)]
    if [(s['new_stage_update'],s['micro'],s['rank']) for s in ordered]!=expected:raise ValueError('Missing/duplicate distributed data position')
    targets=[]
    for item in ordered:
        target,ref=lookup[item['target']],lookup[item['reference']]
        if target['split']!='train' or ref['split'] not in ['train','reference']:raise ValueError('Held-out target or reference leakage')
        if target['speaker_id']!=ref['speaker_id'] or item['speaker_id']!=target['speaker_id']:raise ValueError('Wrong reference voice')
        if target['recording_id']==ref['recording_id'] or re.sub('[^가-힣]','',target['text'])==re.sub('[^가-힣]','',ref['text']):raise ValueError('Reference leaks recording/text')
        if not 0<=item['speaker_slot']<16:raise ValueError('Invalid speaker role slot')
        tags=set(filter(None,(s.strip() for s in target.get('delivery_instruction','').split(','))))
        allowed=STYLE_TAGS | (EMOTION_TAGS if target.get('emotion_verified') else set())
        if not tags<=allowed:raise ValueError('Unverified acted-emotion or unsupported condition in training')
        targets.append(target['clip_id'])
    if len(set(targets))!=160:raise ValueError('Do not call repeated examples160 unique targets')
    validation=sorted(r['clip_id'] for r in rows if r['split']=='validation')
    if len(validation)!=40:raise ValueError('Keep all40 held-out examples')
    # Validation calls must remain synchronized across ZeRO ranks.
    if len(validation)%8:raise ValueError('Unequal distributed validation forward counts')
    identity_fields=['clip_id','speaker_id','sha256','text','recording_id','split','emotion','emotion_verified','delivery_instruction']
    identities=[{k:r.get(k) for k in identity_fields} for r in sorted(rows,key=lambda r:r['clip_id'])]
    plan={'schema':'miro-single-voice-new-stage-v1','speaker_id':next(iter(speakers)),
        'source_checkpoint':SOURCE23,'source_checkpoint_updates':23,'source_checkpoint_manifest_sha256':source23_manifest_sha256,
        'steps':10,'world':8,'accumulation':2,'seed':seed,'global_batch':16,'unique_target_presentations':160,
        'schedule':ordered,'validation':validation,'manifest_identity_sha256':digest(identities),
        'tts_learning_rate':1e-6,'head_learning_rate':5e-4,'teacher_weight':.1,
        'optimizer_reset_at_new_stage_only':True,'teacher_projection_reinitialized_for_new_train_only_stats':True,
        'tts_parameters':TTS_PARAMETERS,'lora':False,'codec_frozen':True,
        'checkpoint_policy':'One complete final save or earlier budget-boundary save; source23 always preserved',
        'emotion_policy':'Do not learn nonneutral tags from unverified classifier predictions',
        'quality_improvement_guaranteed':False}
    plan['sha256']=digest(plan)
    return plan

def pair_at(plan,micro,rank):
    if not 0<=micro<plan['steps']*plan['accumulation'] or not 0<=rank<plan['world']:raise ValueError('Data cursor outside stage')
    item=plan['schedule'][micro*plan['world']+rank]
    if item['new_stage_update']!=micro//plan['accumulation']+1 or item['micro']!=micro%plan['accumulation'] or item['rank']!=rank:raise ValueError('Schedule cursor mismatch')
    return item

def require_frozen_plan(actual,expected):
    if actual!=expected:raise ValueError('Changed data/labels/schedule; refuse resume as the same training stage')

def prepare(manifest,schedule,source_complete,output):
    from .data import read_rows,audit
    source=Path(source_complete);complete=json.loads(source.read_text())
    if complete['client']['step']!=23 or complete['client']['world_size']!=8:raise ValueError('Wrong source checkpoint')
    plan=build_plan(read_rows(manifest),[json.loads(x) for x in Path(schedule).read_text().splitlines()],
        source23_manifest_sha256=hashlib.sha256(source.read_bytes()).hexdigest())
    out=Path(output);out.mkdir(exist_ok=True,parents=True)
    if (out/'plan.json').exists():require_frozen_plan(json.loads((out/'plan.json').read_text()),plan)
    else:(out/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2))
    settings=json.loads(Path(__file__).with_name('zero3.json').read_text());settings['gradient_accumulation_steps']=2
    (out/'zero3.json').write_text(json.dumps(settings,indent=2))
    report={'data':audit(manifest),'plan_sha256':plan['sha256'],'source23_manifest_sha256':plan['source_checkpoint_manifest_sha256'],
        'all160_positions_validated':all(pair_at(plan,m,r) for m in range(20) for r in range(8)),
        'paid_compute_started':False,'gpu_model_execution_verified':False,'new_stage_optimizer_steps':0}
    (out/'PREFLIGHT.json').write_text(json.dumps(report,indent=2));return report

if __name__=='__main__':
    import argparse
    ap=argparse.ArgumentParser()
    for k in ['manifest','schedule','source-complete','output']:ap.add_argument('--'+k,required=True)
    a=ap.parse_args();print(json.dumps(prepare(a.manifest,a.schedule,a.source_complete,a.output),indent=2))
