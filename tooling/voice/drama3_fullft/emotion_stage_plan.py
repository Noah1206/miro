"""감정 단계(10/31): 서빙 중인 신음 v2(native-moan-v2)에서 시작해 감정 태그를 배우는 다화자 FullFT 계획.
moan_stage_plan.py 를 복사해 감정 행만 더했다(신음 v2 학습 코드 해시는 그대로).

감정 행: 서빙이 붙이는 것과 같은 괄호 지시(modal_drama3_serve.delivery_text / miro_contract.DELIVERY_TAGS)를 대사 앞에 — [sad] 대사.
평소 말투는 태그 없이. 라벨은 자동(emotion2vec+ · 확신 60%↑)이라 label_source 로 표시한다.
신음 행·남성 대사 행은 신음 v2 와 똑같이 다시 넣어 신음·대사 능력을 잊지 않게 한다.
"""
import collections, json, re
from pathlib import Path
from .single_voice_plan import digest, pair_at, require_frozen_plan, TTS_PARAMETERS
from .breath_conditioned_data import prepare_event_row

MOAN_SCHEMA = 'miro-moan-v1'
EMOTION_SCHEMA = 'miro-emotion-v1'
# 서빙 delivery_text 와 같은 영어 지시어. neutral 은 태그 없음
EMOTION_TAGS = {'neutral': '', 'happy': '[happy]', 'sad': '[sad]', 'curious': '[curious]', 'hurt': '[hurt]', 'jealous': '[jealous]',
                'angry': '[angry]', 'anxious': '[anxious]', 'whisper': '[whispering]', 'playful': '[playful]', 'firm': '[firm]',
                'fast-aroused': '[fast speech]', 'moan-intense': '[moaning loudly]'}
MOAN_TAGS = {'moan_low': '[moaning softly]', 'moan_mid': '[moaning]', 'moan_high': '[moaning loudly]',
             'breath': '[breathing heavily]', 'mixed': '[moaning]'}
SOURCE = '/voices/_drama3/miro-moan-20261029-v2/native-moan-v2'
SOURCE_UPDATES = 30   # native-moan-v2 MIRO_TRAINING steps_completed
WORLD, ACCUMULATION = 8, 2


def read_rows(path):
    rows = [json.loads(s) for s in Path(path).read_text().splitlines() if s.strip()]
    seen = set()
    for r in rows:
        for k in ['clip_id', 'speaker_id', 'audio_path', 'recording_id', 'split', 'source_kind', 'sha256']:
            if not r.get(k): raise ValueError(f'Missing {k}: {r.get("clip_id")}')
        if r['clip_id'] in seen or not re.fullmatch(r'[A-Za-z0-9_\-]+', r['clip_id']): raise ValueError('Duplicate/unsafe clip ID')
        seen.add(r['clip_id'])
        if r['source_kind'] != 'human_recording': raise ValueError('Real recordings only')
        if r['split'] not in ['train', 'validation', 'reference']: raise ValueError('Unknown split')
        if not re.fullmatch('[0-9a-f]{64}', r['sha256']): raise ValueError('Missing waveform identity')
        if r.get('schema_version') == EMOTION_SCHEMA:
            if r.get('emotion') not in EMOTION_TAGS or not r.get('label_source'): raise ValueError('Emotion row needs a kind and label source')
            if not re.search('[가-힣]', r['text']): raise ValueError('Emotion row needs Korean text')
        elif r.get('schema_version') == MOAN_SCHEMA:
            if r.get('moan_kind') not in MOAN_TAGS or r.get('label_verified') is not True:
                raise ValueError('Moan row needs a human-verified kind')
        elif not re.search('[가-힣]', r['text']): raise ValueError('Speech row needs Korean text')
    # 녹음 하나가 학습과 평가에 동시에 들어가면 안 된다(참조 분할은 별도).
    groups = collections.defaultdict(set)
    for r in rows:
        if r['split'] != 'reference': groups[r['speaker_id'], r['recording_id']].add(r['split'])
    if any(len(s) > 1 for s in groups.values()): raise ValueError('Split leakage by recording')
    return rows


def compile_row(row):
    """학습·참조에 실제로 들어가는 글자를 만든다."""
    if row.get('schema_version') == EMOTION_SCHEMA:
        # 학습 대상만 감정 지시를 붙인다. 참조는 목소리 예시라 받아쓴 글 그대로.
        tag = EMOTION_TAGS[row['emotion']] if row['split'] == 'train' else ''
        return {**row, 'text': (tag + ' ' if tag else '') + row['text'].strip(), 'delivery_instruction': ''}
    if row.get('schema_version') == MOAN_SCHEMA:
        # 사람이 확정한 글자에 실제 단어가 있으면 그대로(태그 포함), 없으면 강도 태그 하나.
        words = re.sub(r'\[[^\]]*\]', '', row.get('text', ''))
        text = row['text'].strip() if re.search('[가-힣A-Za-z]', words) else MOAN_TAGS[row['moan_kind']]
        return {**row, 'text': text, 'delivery_instruction': ''}
    if row['split'] == 'train': return prepare_event_row(row)
    return {**row, 'delivery_instruction': row.get('delivery_instruction', '')}


def build_plan(rows, schedule, *, source_manifest_sha256, steps, mid_save_step, seed=20261031):
    lookup = {r['clip_id']: r for r in rows}
    if len(lookup) != len(rows): raise ValueError('Duplicate clip identity')
    if not re.fullmatch('[0-9a-f]{64}', source_manifest_sha256): raise ValueError('Source weights identity required')
    if mid_save_step is not None and not 0 < mid_save_step < steps: raise ValueError('Mid-run save must be inside the stage')
    ordered = sorted(schedule, key=lambda s: (s['new_stage_update'], s['micro'], s['rank']))
    expected = [(u, m, r) for u in range(1, steps + 1) for m in range(ACCUMULATION) for r in range(WORLD)]
    if [(s['new_stage_update'], s['micro'], s['rank']) for s in ordered] != expected: raise ValueError('Incomplete schedule')
    for item in ordered:
        t, ref = lookup[item['target']], lookup[item['reference']]
        if t['split'] != 'train' or ref['split'] != 'reference': raise ValueError('Target must be train, reference must be reference')
        if t['speaker_id'] != ref['speaker_id'] or item['speaker_id'] != t['speaker_id']: raise ValueError('Wrong reference voice')
        if t['recording_id'] == ref['recording_id']: raise ValueError('Reference must come from another recording')
        if not 0 <= item['speaker_slot'] < 16: raise ValueError('Invalid speaker slot')
        compile_row(t)
    targets = [s['target'] for s in ordered]
    if len(set(targets)) != len(targets): raise ValueError('No repeated targets in this stage')
    validation = sorted(r['clip_id'] for r in rows if r['split'] == 'validation')
    for r in rows:
        if r['split'] == 'validation' and not any(x['split'] == 'reference' and x['speaker_id'] == r['speaker_id']
                                                  and x['recording_id'] != r['recording_id'] for x in rows):
            raise ValueError('Validation clip has no same-voice reference')
    padded = validation + validation[:(-len(validation)) % WORLD]
    fields = ['clip_id', 'speaker_id', 'sha256', 'text', 'recording_id', 'split', 'schema_version', 'moan_kind', 'emotion', 'label_source', 'aligned_words', 'vocal_events']
    identities = [{k: r.get(k) for k in fields} for r in sorted(rows, key=lambda r: r['clip_id'])]
    mix = collections.Counter(lookup[t]['speaker_id'] for t in targets)
    plan = {'schema': 'miro-emotion-fullft-v1', 'emotion_tags': EMOTION_TAGS, 'source_checkpoint': SOURCE, 'source_checkpoint_updates': SOURCE_UPDATES,
            'source_checkpoint_manifest_sha256': source_manifest_sha256, 'steps': steps, 'mid_save_step': mid_save_step,
            'world': WORLD, 'accumulation': ACCUMULATION, 'global_batch': WORLD * ACCUMULATION, 'seed': seed,
            'unique_target_presentations': len(targets), 'target_mix': dict(sorted(mix.items())),
            'schedule': ordered, 'validation': validation, 'validation_padded': padded,
            'manifest_identity_sha256': digest(identities), 'moan_tags': MOAN_TAGS,
            'tts_learning_rate': 1e-6, 'head_learning_rate': 5e-4, 'teacher_weight': .1, 'tts_parameters': TTS_PARAMETERS,
            'optimizer_reset_at_new_stage_only': True, 'lora': False, 'codec_frozen': True,
            'checkpoint_policy': ('One mid-run complete save at mid_save_step, one final save' if mid_save_step else 'Final save only')
                                 + '; source weights preserved',
            'reference_policy': 'Same voice, other recording, reference split only; emotion references are untagged transcripts',
            'quality_improvement_guaranteed': False}
    plan['sha256'] = digest(plan)
    return plan


def make_schedule(rows, steps, seed=20261031):
    """감정·신음 학습 클립을 전부 먼저 배치하고 남는 자리를 남성 대사로 채운다. 순서는 섞는다."""
    import random
    rng = random.Random(seed)
    train = [r for r in rows if r['split'] == 'train']
    moan = [r for r in train if r.get('schema_version') in (MOAN_SCHEMA, EMOTION_SCHEMA)]
    speech = [r for r in train if r.get('schema_version') not in (MOAN_SCHEMA, EMOTION_SCHEMA)]
    total = steps * WORLD * ACCUMULATION
    if len(moan) > total: raise ValueError(f'{len(moan)} moan targets exceed {total} positions')
    rng.shuffle(speech)
    chosen = moan + speech[:total - len(moan)]
    if len(chosen) != total: raise ValueError(f'Need {total} unique targets, have {len(chosen)}')
    rng.shuffle(chosen)
    refs = collections.defaultdict(list)
    for r in rows:
        if r['split'] == 'reference': refs[r['speaker_id']].append(r)
    schedule = []
    for i, t in enumerate(chosen):
        options = [r for r in refs[t['speaker_id']] if r['recording_id'] != t['recording_id']]
        if not options: raise ValueError('No reference for ' + t['clip_id'])
        update, rest = divmod(i, WORLD * ACCUMULATION)
        micro, rank = divmod(rest, WORLD)
        schedule.append({'new_stage_update': update + 1, 'micro': micro, 'rank': rank, 'target': t['clip_id'],
                         'reference': rng.choice(options)['clip_id'], 'speaker_id': t['speaker_id'],
                         'speaker_slot': rng.randrange(16), 'explicit_replay': False})
    return schedule


__all__ = ['read_rows', 'compile_row', 'build_plan', 'make_schedule', 'pair_at', 'require_frozen_plan', 'MOAN_TAGS', 'EMOTION_TAGS', 'EMOTION_SCHEMA', 'SOURCE']
