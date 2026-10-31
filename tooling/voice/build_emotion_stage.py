"""감정 단계 학습 묶음을 만든다(10/31). 비용 없음, GPU 안 켬.

감정 행 = output/emotion-dataset-v1 의 자동 라벨(labels.auto.json, emotion2vec+ 확신 60%↑ + whisper 받아쓰기, 사람 미확인).
신음·남성 대사 행 = 신음 v2 학습에 쓴 recordings.jsonl 그대로(Modal /_drama3/miro-moan-20261029-v2/data) — 신음을 잊지 않게.
녹음이 32분짜리 하나라 4분 덩어리를 녹음 단위로 본다(참조는 다른 덩어리에서, 평가는 덩어리 하나 통째).
참조 = 학습에 안 들어간 같은 화자의 3~8초 말소리 조각(받아쓴 글 그대로).

사용: python3 build_emotion_stage.py <v2 recordings.jsonl> <native-moan-v2 SHA256SUMS.json>
  → output/voice-upload/emotion-stage-v1/{recordings.jsonl,schedule.jsonl,plan.json,bundle.zip(감정 wav 만)}
"""
import collections, hashlib, json, shutil, sys, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from drama3_fullft.emotion_stage_plan import EMOTION_SCHEMA, read_rows, build_plan, make_schedule, pair_at

ROOT = HERE.parents[1] / 'output'
EMO = ROOT / 'emotion-dataset-v1'
OUT = ROOT / 'voice-upload/emotion-stage-v1'
STEPS, MID_SAVE = 30, None
BLOCK_SECONDS = 240
REFERENCES_PER_BLOCK = 2


def emotion_rows():
    clips = {c['clip_id']: c for c in json.loads((EMO / 'clips.json').read_text())}
    labels = json.loads((EMO / 'labels.auto.json').read_text())
    used = {l['clip_id'] for l in labels}
    block = lambda c: f"emo_src00_b{int(c['start'] // BLOCK_SECONDS):02d}"
    (OUT / 'wavs').mkdir(parents=True, exist_ok=True)

    def row(c, split, text, emotion):
        cid = 'emo_' + c['clip_id']
        wav = OUT / 'wavs' / (cid + '.wav')
        shutil.copy2(EMO / c['audio'], wav)
        sha = hashlib.sha256(wav.read_bytes()).hexdigest()
        if sha != c['sha256']: raise ValueError('Clip changed since labeling: ' + cid)
        return {'clip_id': cid, 'speaker_id': 'miro_emotion_' + c.get('speaker_draft', 'A'), 'recording_id': block(c),
                'source_file': c['source'], 'source_start_seconds': c['start'], 'source_end_seconds': c['end'],
                'duration_seconds': c['duration'], 'audio_path': str(wav), 'sha256': sha, 'sample_rate': 44100,
                'text': text, 'emotion': emotion, 'label_source': 'auto:emotion2vec_plus_large+whisper-small(unverified)',
                'auto_score': c.get('auto_score'), 'schema_version': EMOTION_SCHEMA, 'source_kind': 'human_recording', 'split': split}

    rows = [row(clips[l['clip_id']], 'train', l['text'], l['kind']) for l in labels]
    # 참조: 학습에 안 쓴 같은 화자·말소리·3~8초, 덩어리마다 2개
    pool = collections.defaultdict(list)
    for c in clips.values():
        if c['clip_id'] in used or not c.get('speech_draft') or not 3 <= c['duration'] <= 8 or len(c.get('asr_text', '')) < 8: continue
        if c.get('asr_logprob', -9) < -0.8: continue
        pool[c.get('speaker_draft', 'A'), block(c)].append(c)
    for members in pool.values():
        for c in sorted(members, key=lambda c: abs(c['duration'] - 5))[:REFERENCES_PER_BLOCK]:
            rows.append(row(c, 'reference', c['asr_text'].strip(), 'neutral'))
    # 평가: 학습 클립이 가장 많은 덩어리 하나를 통째로
    counts = collections.Counter(r['recording_id'] for r in rows if r['split'] == 'train')
    heldout = counts.most_common(1)[0][0]
    for r in rows:
        if r['split'] == 'train' and r['recording_id'] == heldout: r['split'] = 'validation'
    # 같은 화자의 다른 덩어리에 참조가 없는 학습·평가 클립은 뺀다(학습이 참조를 못 고른다)
    refs = collections.defaultdict(set)
    for r in rows:
        if r['split'] == 'reference': refs[r['speaker_id']].add(r['recording_id'])
    keep = [r for r in rows if r['split'] == 'reference' or (refs[r['speaker_id']] - {r['recording_id']})]
    print('emotion rows', len(keep), 'dropped(no other-block reference)', len(rows) - len(keep), 'heldout', heldout)
    return keep


def main():
    v2_rows = [json.loads(s) for s in Path(sys.argv[1]).read_text().splitlines() if s.strip()]
    manifest_sha = hashlib.sha256(Path(sys.argv[2]).read_bytes()).hexdigest()
    OUT.mkdir(parents=True, exist_ok=True)
    emo = emotion_rows()
    # v2 행의 오디오는 Modal 에 이미 있다(features 단계가 v2 data/wavs 를 복사). 로컬 검증용으로만 경로를 잠시 바꾼다.
    rows = emo + v2_rows
    (OUT / 'recordings.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
    rows = read_rows(OUT / 'recordings.jsonl')
    schedule = make_schedule(rows, STEPS)
    (OUT / 'schedule.jsonl').write_text(''.join(json.dumps(s, ensure_ascii=False) + '\n' for s in schedule))
    plan = build_plan(rows, schedule, source_manifest_sha256=manifest_sha, steps=STEPS, mid_save_step=MID_SAVE)
    assert all(pair_at(plan, m, r) for m in range(STEPS * 2) for r in range(8))
    (OUT / 'plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=1))
    with zipfile.ZipFile(OUT / 'bundle.zip', 'w', zipfile.ZIP_STORED) as z:
        bundle_rows = []
        for r in rows:
            name = 'wavs/' + r['clip_id'] + '.wav'
            if r.get('schema_version') == EMOTION_SCHEMA: z.write(r['audio_path'], name)
            bundle_rows.append({**r, 'audio_path': name})
        z.writestr('recordings.jsonl', ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in bundle_rows))
    count = collections.Counter((r['speaker_id'], r['split']) for r in rows)
    secs = collections.Counter()
    for r in rows: secs[r['speaker_id'], r['split']] += r['duration_seconds']
    for k in sorted(count): print(k, count[k], f"{secs[k] / 60:.1f}min")
    emo_kinds = collections.Counter(r['emotion'] for r in rows if r.get('schema_version') == EMOTION_SCHEMA and r['split'] == 'train')
    print('emotion train kinds', dict(emo_kinds))
    print('steps', STEPS, 'presentations', len(schedule), 'mix', plan['target_mix'])
    print('validation', len(plan['validation']), 'padded', len(plan['validation_padded']), 'plan', plan['sha256'])


if __name__ == '__main__':
    main()
