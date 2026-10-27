"""Offline two-male adaptation schedule. No cloud or training dispatch imports."""
import argparse
import collections
import hashlib
import json
import math
import random
import re
from pathlib import Path


def text_key(text):
    return re.sub('[^가-힣0-9a-zA-Z]', '', text).lower()


def build_schedule(rows, seed=1234, passes=1):
    if passes < 1:
        raise ValueError('At least one coverage pass required')
    if not rows or any(r.get('gender_from_source_metadata') != 'MALE' for r in rows):
        raise ValueError('This stage accepts verified male metadata only')
    speakers = sorted({r['speaker_id'] for r in rows})
    if len(speakers) != 2:
        raise ValueError('Exactly two male training speakers required')
    if len({r['clip_id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate candidate ID')
    groups = {s: sorted([r for r in rows if r['speaker_id'] == s and
                         r['planned_split'] == 'train'], key=lambda r: r['clip_id'])
              for s in speakers}
    if any(len(g) < 2 for g in groups.values()):
        raise ValueError('Each male needs multiple training recordings')
    train_texts = {text_key(r['text']) for r in rows if r['planned_split'] == 'train'}
    validation_texts = {text_key(r['text']) for r in rows if r['planned_split'] == 'validation'}
    if train_texts & validation_texts:
        raise ValueError('Global text leakage across training and validation')
    updates = math.ceil(max(map(len, groups.values())) / 8) * passes
    decks = {s: [] for s in speakers}
    rng = random.Random(seed)
    result = []
    # Each global16 update has eight examples per male, across8ranks x2micros.
    for update in range(updates):
        for micro in range(2):
            for rank in range(8):
                speaker = speakers[rank % 2]
                if not decks[speaker]:
                    decks[speaker] = list(groups[speaker])
                    rng.shuffle(decks[speaker])
                target = decks[speaker].pop()
                refs = [r for r in groups[speaker]
                        if r['clip_id'] != target['clip_id'] and
                        text_key(r['text']) != text_key(target['text'])]
                if not refs:
                    raise ValueError('No same-male disjoint reference')
                reference = rng.choice(refs)
                result.append({'new_stage_update': update + 1, 'micro': micro,
                               'rank': rank, 'speaker_id': speaker,
                               'target': target['clip_id'], 'reference': reference['clip_id'],
                               'speaker_slot': rng.randrange(16)})
    return result


def build_sequential_schedule(rows, updates_per_male=10, first_speaker='aihub001', seed=1234):
    """One shared model: first male, checkpoint/listen gate, then second male.

    This does not insert replay or silently create two independently trained models.
    Both identities must be evaluated after phase2 before accepting the shared model.
    """
    if updates_per_male < 1:
        raise ValueError('Positive update count required')
    balanced = build_schedule(rows, seed=seed)
    passes = math.ceil(updates_per_male * 2 / (len(balanced) // 16))
    if passes > 1:
        balanced = build_schedule(rows, seed=seed, passes=passes)
    speakers = sorted({r['speaker_id'] for r in balanced})
    if first_speaker not in speakers:
        raise ValueError('First speaker must be one of the two candidates')
    speakers.remove(first_speaker)
    ordered = [first_speaker, *speakers]
    result = []
    for phase, speaker in enumerate(ordered, 1):
        selected = [r for r in balanced if r['speaker_id'] == speaker][:updates_per_male * 16]
        assert len(selected) == updates_per_male * 16
        for index, item in enumerate(selected):
            result.append({**item, 'phase': phase, 'phase_update': index // 16 + 1,
                           'new_stage_update': (phase - 1) * updates_per_male + index // 16 + 1,
                           'micro': index % 16 // 8, 'rank': index % 8})
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--candidates', required=True)
    ap.add_argument('--output', required=True)
    args = ap.parse_args()
    source = Path(args.candidates)
    rows = [json.loads(line) for line in source.read_text().splitlines() if line.strip()]
    schedule = build_schedule(rows)
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    missing = [r['clip_id'] for r in rows if not r.get('audio_path') or
               not Path(r['audio_path']).is_file()]
    report = {'status': 'BLOCKED_MISSING_AUDIO' if missing else 'CANDIDATES_NEED_AUDIO_HASH_AUDIT',
              'paid_execution_enabled': False, 'training_started': False,
              'source_checkpoint_step': 23, 'new_stage_update_starts_at': 0,
              'exact_old007_optimizer_resume': False,
              'new_task_optimizer_and_teacher_stats': 'Reinitialize explicitly; preserve original23 full state.',
              'candidate_manifest_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'male_training_speakers': sorted({r['speaker_id'] for r in rows}),
              'female_training_speakers': 0,
              'candidate_counts': dict(collections.Counter(r['planned_split'] for r in rows)),
              'missing_audio_count': len(missing),
              'updates_one_coverage_pass': len(schedule) // 16,
              'schedule_items': len(schedule),
              'schedule_properties': ['same-male disjoint references', '8examples per male per global16',
                                      'no target reuse until own deck exhaustion', 'random local role slot'],
              'not_production_quality_certification': True,
              'trainer_connected_to_this_schedule': False,
              'launch_blockers': ['Missing source WAVs or full source hash audit',
                                  'Connect new stage schedule and23 initialization to safe resumable runner',
                                  'Recompute train-only Korean teacher normalization',
                                  'Approve paid budget and storage retention before dispatch']}
    (out / 'schedule.jsonl').write_text(''.join(json.dumps(r) + '\n' for r in schedule))
    (out / 'STAGE_READINESS.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
