"""신음 단계 학습 묶음을 만든다. 비용 없음, GPU 안 켬.

사용: python3 build_moan_stage.py  → output/voice-upload/moan-stage-v1/{recordings.jsonl,schedule.jsonl,plan.json,bundle.zip}
"""
import collections, hashlib, json, shutil, sys, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from drama3_fullft.moan_stage_plan import MOAN_SCHEMA, read_rows, build_plan, make_schedule, pair_at

ROOT = HERE.parents[1] / 'output'
MOAN = ROOT / 'moan-dataset-v1'
MALE = ROOT / 'voice-upload/male-asmr-01-20261026/breath-aware-v2/recordings.jsonl'
OUT = ROOT / 'voice-upload/moan-stage-v2'
SOURCE_MANIFEST_SHA = 'fb74644dceb5ac34a2d1ad79034b30fdb79d301b3a9f50825cf09cacd93458d9'  # native-male-breath13/SHA256SUMS.json
STEPS, MID_SAVE = 30, None   # v2: 중간 저장 없음(v1 은 15회째 저장 때문에 25회에서 멈춤)
VALIDATION_RECORDINGS = {'src02', 'src03'}   # 짧은 두 파일은 통째로 평가용
REFERENCES_PER_RECORDING = 2


def moan_rows():
    clips = {c['clip_id']: c for c in json.loads((MOAN / 'clips.json').read_text())}
    labels = json.loads((MOAN / 'labels.normalized.json').read_text())
    # v2: 대사+신음 클립은 사용자가 다시 받아쓴 mixed_labels.json 으로 덮어쓴다.
    fixed = {l['clip_id']: l for l in json.loads((MOAN / 'mixed_labels.json').read_text())}
    labels = [{**l, 'kind': fixed[l['clip_id']]['kind'], 'text': fixed[l['clip_id']]['text']} if l['clip_id'] in fixed
              else {**l, 'text': ''} for l in labels]
    (OUT / 'wavs').mkdir(parents=True, exist_ok=True)
    rows = []
    for l in labels:
        if l['kind'] == 'discard': continue
        c = clips[l['clip_id']]
        cid = 'moan_' + c['clip_id']
        wav = OUT / 'wavs' / (cid + '.wav')
        shutil.copy2(MOAN / c['audio'], wav)
        sha = hashlib.sha256(wav.read_bytes()).hexdigest()
        if sha != c['sha256']: raise ValueError('Clip changed since labeling: ' + cid)
        rows.append({'clip_id': cid, 'speaker_id': 'miro_moan_' + l['speaker'], 'recording_id': 'moan_' + c['recording_id'],
                     'source_file': c['source'], 'source_start_seconds': c['start'], 'source_end_seconds': c['end'],
                     'duration_seconds': c['duration'], 'audio_path': str(wav), 'sha256': sha, 'sample_rate': 44100,
                     'text': l['text'], 'moan_kind': l['kind'], 'label_verified': True, 'label_text_source': l['text_source'],
                     'schema_version': MOAN_SCHEMA, 'source_kind': 'human_recording', 'split': 'train'})
    # 분할: 짧은 두 파일은 평가, 나머지 녹음마다 2~5초짜리 moan_mid 를 참조로 뺀다.
    for r in rows:
        if r['recording_id'].removeprefix('moan_') in VALIDATION_RECORDINGS: r['split'] = 'validation'
    groups = collections.defaultdict(list)
    for r in rows:
        if r['split'] == 'train': groups[r['speaker_id'], r['recording_id']].append(r)
    for members in groups.values():
        # A 화자는 짧은 클립뿐이라 길이 조건을 두지 않고 3초에 가까운 것부터 고른다.
        pool = sorted((r for r in members if r['moan_kind'] == 'moan_mid' and r['duration_seconds'] >= 1),
                      key=lambda r: abs(r['duration_seconds'] - 3))
        for r in pool[:REFERENCES_PER_RECORDING]: r['split'] = 'reference'
    return rows


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = moan_rows() + [json.loads(s) for s in MALE.read_text().splitlines() if s.strip()]
    (OUT / 'recordings.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
    rows = read_rows(OUT / 'recordings.jsonl')
    schedule = make_schedule(rows, STEPS)
    (OUT / 'schedule.jsonl').write_text(''.join(json.dumps(s, ensure_ascii=False) + '\n' for s in schedule))
    plan = build_plan(rows, schedule, source_manifest_sha256=SOURCE_MANIFEST_SHA, steps=STEPS, mid_save_step=MID_SAVE)
    assert all(pair_at(plan, m, r) for m in range(STEPS * 2) for r in range(8))
    (OUT / 'plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=1))
    with zipfile.ZipFile(OUT / 'bundle.zip', 'w', zipfile.ZIP_STORED) as z:
        bundle_rows = []
        for r in rows:
            name = 'wavs/' + r['clip_id'] + '.wav'
            z.write(r['audio_path'], name)
            bundle_rows.append({**r, 'audio_path': name})
        z.writestr('recordings.jsonl', ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in bundle_rows))
    count = collections.Counter((r['speaker_id'], r['split']) for r in rows)
    secs = collections.Counter()
    for r in rows: secs[r['speaker_id'], r['split']] += r['duration_seconds']
    for k in sorted(count): print(k, count[k], f"{secs[k] / 60:.1f}min")
    print('steps', STEPS, 'mid_save', MID_SAVE, 'presentations', len(schedule), 'mix', plan['target_mix'])
    print('validation', len(plan['validation']), 'padded', len(plan['validation_padded']), 'plan', plan['sha256'])


if __name__ == '__main__':
    main()
