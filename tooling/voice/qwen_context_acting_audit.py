"""Prepare observed energy targets and a context-controlled acting benchmark.

This does not infer acting intent from the source labels or synthesize speech.
Relative energy targets are measurements, not semantic intensity annotations.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf


DIRECTOR_PROMPT = """당신은 한국어 캐릭터 대화의 연기 감독이다.
입력은 캐릭터 성격, 관계, 직전 대화, 장면, 읽을 대사다. 대사 자체만 보고 감정을 결정하지 마라.
인물이 겉으로 표현하는 감정과 속으로 느끼는 감정, 상대에게 하려는 행동을 구분하라.
분노=큰 소리, 슬픔=느린 말 같은 고정 공식을 사용하지 마라.
단어를 추가하거나 바꾸지 말고 원문 순서 그대로 구절을 나눠라.
각 구절에 intent, delivery, rate_relative_to_character, energy_relative_db,
emphasis_words, pause_after_ms를 제안하라. 속도와 강약은 구절 안에서도 변할 수 있다.
energy_relative_db는 같은 캐릭터의 평소 발화에 대한 발성 에너지 목표이며 재생 볼륨이 아니다.
위 목표는 제안이지 현재 합성기가 정확히 수행한다는 보장이 아니다.
장면에서 근거를 찾을 수 없는 속삭임, 웃음, 울음, 숨소리는 추가하지 마라.
근거가 부족하면 과장 없이 말하고 uncertainty에 이유를 적어라.
JSON으로 evidence, inner_emotion, outward_delivery, intent, phrases, uncertainty를 반환하라.
"""


def relative_energy(waveform, sr, alignment):
    """20 ms RMS; exclude low energy frames with the existing alignment gate."""
    y = np.asarray(waveform)
    if y.ndim == 2:
        y = y.mean(axis=1)
    frame = round(sr * .02)
    n = len(y) // frame
    db = 20 * np.log10(np.sqrt(np.mean(y[:n*frame].reshape(n, frame)**2, axis=1)) + 1e-10)
    # Recompute on this source's gain/sample rate rather than importing dbFS
    # from the 24 kHz training copy used for alignment.
    active = db > float(np.percentile(db, 95) - 30)
    centers = (np.arange(n) + .5) * frame / sr
    speech = np.zeros(n, dtype=bool)
    for word in alignment['words']:
        speech |= (centers >= word['start']) & (centers < word['end'])
    baseline_frames = db[active & speech]
    if len(baseline_frames) < 3:
        raise ValueError('Insufficient speech frames')
    baseline = float(np.median(baseline_frames))
    result = []
    for phrase in alignment['phrases']:
        mask = speech & active & (centers >= phrase['start']) & (centers < phrase['end'])
        values = db[mask]
        if len(values) < 3:
            raise ValueError('Insufficient phrase frames')
        segments = np.array_split(values, min(5, len(values)))
        result.append({'text': phrase['text'], 'median_relative_db': float(np.median(values)-baseline),
                       'p90_p10_db': float(np.percentile(values,90)-np.percentile(values,10)),
                       'speech_progress_energy_db': [float(np.median(x)-baseline) for x in segments]})
    return {'utterance_speech_median_dbfs': baseline, 'phrases': result}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepared', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    prepared = json.loads(Path(args.prepared).read_text())
    rows = []; rejected = []
    for split in ('train', 'validation'):
        for row in prepared[split]:
            try:
                y, sr = sf.read(Path(args.source)/row['file'])
                rows.append({'file':row['file'], 'split':split, 'emotion':row['mode'],
                             'observed':relative_energy(y,sr,row['alignment'])})
            except (ValueError, OSError) as error:
                rejected.append({'file':row['file'],'reason':str(error)})
    cases = [
        {'id':'comfort', 'previous_dialogue':'상대: 또 실패했어. 이제 아무것도 못 하겠어.',
         'scene':'연인이 자책하는 상대를 안심시키려 한다.', 'intent':'안심시키기',
         'listening_question':'부드러운 발성과 여유가 느껴지는가?'},
        {'id':'contained_anger', 'previous_dialogue':'상대: 네가 싫다고 했던 약속, 또 어겼어.',
         'scene':'실망과 분노를 참으며 괜찮은 척하지만, 끝 구절에서 마음을 드러낸다.',
         'intent':'감정을 감추려다 드러내기', 'listening_question':'고함 없이 눌러 말하는 긴장이 느껴지는가?'},
        {'id':'relief', 'previous_dialogue':'상대: 검사 결과 나왔어. 아무 이상 없대.',
         'scene':'걱정하던 인물이 안도하며 상대를 다독인다.', 'intent':'안도하며 다독이기',
         'listening_question':'긴장이 풀리며 말투가 달라지는가?'},
    ]
    for case in cases:
        case.update({'text':'괜찮아. 나 여기 있어.', 'character':'평소 차분하고 말수가 적은 성인 캐릭터',
                     'relationship':'서로 신뢰하는 연인', 'voice':'007', 'seed':1234})
    result = {'status':'measurement_and_benchmark_only', 'rows':rows, 'rejected':rejected,
              'notes':['Energy targets are within-utterance relative estimates; absolute acting loudness is not identifiable after gain normalization.',
                       'Speech-progress bins omit silence and are not aligned phoneme controls.',
                       'No scene or psychological intent ground truth exists for these recordings.',
                       'Do not feed novel continuous controls to the current categorical checkpoint and claim they were learned.']}
    (out/'observed_energy.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    (out/'director_prompt.txt').write_text(DIRECTOR_PROMPT)
    (out/'context_benchmark.json').write_text(json.dumps({'status':'authored_test_cases_not_generated_results',
      'cases':cases,'evaluation':{'same_text_voice_and_seed':True,'reference_fixed_across_contexts':True,
      'no_waveform_time_stretch_or_gain_as_acting_evidence':True,
      'primary':'blind listener context match and humanlike acting preference',
      'secondary':'per-phrase speech rate, pauses, relative energy contour, pitch contour, CER and speaker consistency'}},ensure_ascii=False,indent=2))
    print(json.dumps({'measured':len(rows),'rejected':len(rejected),'benchmark_cases':len(cases)}))


if __name__ == '__main__':
    main()
