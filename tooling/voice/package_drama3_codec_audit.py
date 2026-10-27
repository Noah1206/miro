"""Build Miro-specific codec evidence and a listening comparison from measured outputs."""
import argparse,html,json,statistics
from pathlib import Path


def main():
    ap=argparse.ArgumentParser();ap.add_argument('folder');args=ap.parse_args();root=Path(args.folder)
    r=json.loads((root/'report.json').read_text());a=json.loads((root/'analysis.json').read_text());g=a['aggregate']
    tests=json.loads((root/'contract_tests.json').read_text())
    duration=sum(i['input_samples']/i['sample_rate'] for i in r['items'])
    bf=[p for p in a['pairs'] if p['variant']=='bf16_file']
    facts={'scope':'Miro Korean-only model; actor007 only','actual_clips':len(r['items']),
        'actual_audio_seconds':duration,'whisper_tested':False,'codec_retraining_needed_on_current_evidence':False,
        'data_distribution_bottleneck':'unknown: codec Korean/acting training proportions not disclosed',
        'quantization_bottleneck':'lossy, but no large pitch/energy/pause collapse in full10-codebook actor007 reconstruction',
        'english_only_teacher_bottleneck':False,'teacher':'w2v-BERT2.0 layer16; multilingual, ko in official model metadata',
        'all_engineering_screening_checks_passed':a['all_diagnostic_checks_pass'],
        'lossless':False,'human_naturalness_validated':False,'actual_full_ft_training_started':False,
        'changes':'strict codec/profile/cache/10-codebook checks through training, export and serving; target language ko',
        'codec_weights_changed':False,'production_changed':False}
    (root/'decision.json').write_text(json.dumps(facts,ensure_ascii=False,indent=2))
    report=f'''# Miro 한국어 전용 모델 · 코덱 병목 조사 및 007번 실험

2026-10-23. **현재 007번 자료에서는 코덱이 억양·강약을 크게 지우는 주 병목이라는 근거가 부족하다. 코덱 가중치를 유지하고, Miro 전체 파라미터 학습에 토큰 호환성 검사를 추가했다.** 실제 359억 모델 본학습·운영 교체는 실행하지 않았다. 조사 상태는 DONE_WITH_CONCERNS이며 남성 ASMR·속삭임의 원음 검증은 남아 있다.

## 세 가설의 확인 결과

| 가설 | 확인한 사실 | Miro에서의 판단 |
|---|---|---|
| 한국어 데이터 분포 부족 | 코덱의 한국어·감정·속삭임별 학습 분량은 공개 자료에 명시되지 않았다. TTS 전체 사전학습의 다국어 시간은 코덱 한국어 시간과 같지 않다. | 가능성을 배제할 수 없지만 원인으로 확정할 수 없다. 007번 복원 검사에서는 큰 억양 손실을 보이지 않았다. |
| 이산화에 따른 손실 | 44.1kHz 음성을 약21.5Hz의10개 코드북으로 압축한다. 시멘틱4096개, 잔차9개는 각각1024개 코드. 손실 압축은 맞다. | 파형의 세부 차이는 존재하지만, 전체 코드북 복원에서 억양·강약·쉼은 대부분 유지됐다. |
| 영어 전용 시멘틱 티처 | S2 논문은 w2v-BERT2.0의16번째 층을 티처로 명시한다. Drama3는 S2 코덱을 그대로 쓴다. 티처는143개 이상의 언어로 사전학습한 다국어 모델이고, 모델 언어 메타데이터에 ko가 있다. | 영어 전용이라는 전제는 해당하지 않는다. 이것만으로 한국어 연기 표현이 충분하다는 뜻은 아니다. |

[Drama3 논문 §2.1](https://arxiv.org/html/2610.18010v2#S2.SS1), [S2 논문 §2.1·4.1](https://arxiv.org/html/2603.08823v1#S2.SS1), [티처 공식 모델 카드](https://huggingface.co/facebook/w2v-bert-2.0).

공개 코드의 semantic_predictor_module 기본값은 Identity이고, 시멘틱 증류 호출은 추론 배포본에서 주석 처리됐다. 이는 학습 때 증류를 하지 않았다는 뜻이 아니다. 학습 사실은 논문에서 확인하고, 공개 코드는 추론 시 증류 티처가 실행되지 않는 점을 확인하는 데 사용했다. 별도의 영어 ASR을 현재 음성 생성 경로에서 제거한 작업은 없다.

[고정된 RVQ 코드](https://github.com/fishaudio/fish-speech/blob/{r['source_revision']}/fish_speech/models/dac/rvq.py#L284), [코덱 설정](https://github.com/fishaudio/fish-speech/blob/{r['source_revision']}/fish_speech/configs/modded_dac_vq.yaml).

## 실제 실험

원본007번 {len(r['items'])}클립, 총{duration:.1f}초. 일반·기쁨·슬픔·분노를 포함한다. 검증 분할에서 감정별4개씩16개, 과거 비교용7개를 추가했다. 파일명 감정 라벨이며 실제 감정의 정확도를 새로 평정하지 않았다. 검증된 속삭임 원음은 없다.

입력 파일 해시를 확인하고 원본44.1kHz·강약·쉼을 유지했다. 생성 모델 없이 원음을 코덱으로 압축·복원했다. 첫 코드북만 사용, 처음2개 사용, VQ를 우회하는 비학습 경로, BF16 복원도4클립에서 비교했다. VQ 우회는 디코더가 학습한 입력 분포를 벗어나므로 순수 이산화 손실이나 이론적 최대 품질로 해석하지 않았다.

| FP32 전체10개 코드북 · 23클립 | 측정값 |
|---|---:|
| 피치 곡선 상관 중앙값 | {g['f0_correlation']['median']:.4f} |
| 피치 곡선 상관 평균 / 하위10% 지점 | {g['f0_correlation']['mean']:.4f} / {g['f0_correlation']['p10']:.4f} |
| 피치 오차 중앙값 | {g['f0_median_absolute_error_semitones']['median']:.2f}반음 |
| 강약 곡선 상관 중앙값 | {g['energy_envelope_correlation']['median']:.4f} |
| 쉼 비율 변화 중앙값 | {g['relative_pause_fraction_delta']['median']*100:+.3f}%p |
| ASR 문자 오류율 평균: 원본 → 복원 | {g['asr']['original_file']*100:.3f}% → {g['asr']['codec_file']*100:.3f}% |
| 길이 증가 중앙값 | {g['duration_delta_seconds']['median']*1000:.1f}ms |
| 스펙트럼 차이 지표 중앙값 | {g['spectral_convergence']['median']:.4f} |

상관0.998은 정보99.8% 보존율이 아니다. pYIN 피치 추정의 해상도는0.1반음이며, 무성음에는 피치를 정의할 수 없다. 쉼은 원음 에너지 기준의 상대 마스크여서 숨도 포함할 수 있다. 길이 증가는 주로 프레임 패딩과 관련되며 파일을 잘라 보정하지 않았다. 스펙트럼 차이 지표는 청취 점수나 손실률이 아니다. 원본 대비 ASR 오류가 낮아진 한 클립도 발음 개선 증거로 해석하지 않았다.

최저 피치 상관 클립은0.9212였다. 중앙값만으로 모든 국소 차이가 없다고 판단하지 않는다. 피치 폭 변화의90백분위는+1.874반음이므로, 추적 오류를 포함한 국소 차이는 남아 있다. 전체23개와 원시 지표를 함께 제공한다.

BF164클립은 피치 상관 평균{statistics.mean(x['f0_correlation'] for x in bf):.4f}, 강약 상관 평균{statistics.mean(x['energy_envelope_correlation'] for x in bf):.4f}였다. 정밀도에 따른 전체 토큰 번호 일치율은 약49~56%였지만, 복원된 피치·강약의 큰 저하는 보이지 않았다. 토큰 불일치율을 음질 손실률로 해석하면 안 된다.

첫 시멘틱 코드북만 쓴4클립의 피치 상관 평균은0.4978, 처음2개는0.9852였다. 시멘틱 코드북 단독에 원음의 모든 연기 정보를 요구하는 것은 실제10코드북 구조와 맞지 않는다. Miro 학습은10개를 모두 감독하도록 유지한다.

## Miro 학습 구조에 적용한 변경

- 한국어 전용 목표를 실행 메타데이터에 기록했다. 다른 언어 성능 유지를 요구하지 않는다.
- 인코더·코드북·파형 디코더 가중치는 유지한다. TTS 본체와 codebook-MTP 전체 Full FT는 기존 설계대로 학습 가능하다.
- 코덱 파일 해시·정밀도·Torch 버전·코드북 구성을 codec_profile_id로 묶는다.
- 캐시와 원음 해시,10개 코드북 존재 여부, 정수형과 각 코드북 범위를 검사한다. 계약 없는 과거 파일이나 FP32/BF16 캐시 혼용을 거절한다.
- 학습 시작 전 원본 체크포인트 코덱과 캐시를 대조한다. 내보낼 때 같은 계약을 포함하고, 서빙 시작 때 다시 검사한다.
- 현재 네이티브 서빙과 맞추는 기본 토큰화는BF16이다. FP32 학습 토큰을 쓰려면 서빙 정밀도부터 맞추도록 진입 검사에서 거절한다.

이 검사는 서로 다른 버전·정밀도의 토큰을 섞는 실수를 막는다. GPU·커널이 다른 모든 환경의 비트 단위 동일성을 보장하는 것은 아니다. 이번 음질 실험의 결과로 코덱 학습을 새로 실행하거나 가중치를 수정하지 않았다.

정밀도가 다르다고 코드북 번호의 의미가 다시 매핑되거나 서로 다른 정밀도의 유효 토큰을 함께 학습하는 것이 원천적으로 불가능한 것은 아니다. 위 제한은 첫 실험에서 전처리 조건을 고정하는 보수적인 정책이다. 이산화로 정보가 얼마나 사라졌는지를 토큰 번호 불일치율만으로 판정하지 않는다.

## 코덱 변경을 다시 검토할 조건

권리 확보된 한국어 남성의 실제 속삭임·호흡·감정 전환 녹음을 같은 방식으로 복원했을 때, 반복 가능한 손실이 확인되어야 한다. 특히007번 여성 성우 낭독·감정 녹음 결과를 남성 ASMR에 그대로 일반화할 수 없다.

그 경우 첫 호환 경로는 인코더와 모든 코드북·토큰 번호를 동결하고 파형 디코더 측 가중치만 한국어 원음으로 추가 학습하는 것이다. 같은 토큰 입력을 유지하면서 복원부를 조정하는 방식이며, 사라진 정보 자체를 되살릴 수 있다는 보장은 없다. 그래도 부족해 코드북을 바꾸면 기존 토큰 파일 재생성과 TTS 가중치의 추가 정렬 학습이 필요하다. 현재 데이터에서는 이 비용을 발생시키지 않았다.

## 재현 기록

- model revision: {r['model_revision']}
- source revision: {r['source_revision']}
- codec SHA256: {r['codec_sha256']}
- GPU: {r['gpu']}; 최대 할당 메모리{r['peak_gpu_gib']:.2f}GiB.
- report.json / analysis.json / diagnostic_limits.json / decision.json / 원본·복원 WAV.
- 진단 기준은 측정 결과를 보기 전에 선언했다. 사람이 평가한 품질 합격선은 아니다.
- 새 프로필 검사의 회귀 테스트{tests['tests']}개 통과. 실제 학습 환경과 같은 Torch{tests['torch']}에서도 재검증했다. 실제359억 모델 학습이나 서빙을 실행한 검사는 아니다.
- 동일 신호·50ms 지연 신호로 측정 도구의 정렬과 피치 상관을 확인했다.
- [피치·강약 비교 그림](prosody_comparison.png).
- [학습 구성 안내](/Users/johyeon-ung/Desktop/Miro/tooling/voice/drama3_fullft/README.md)

Built with Fish Audio.
'''
    (root/'RESULTS.md').write_text(report)
    def audio(file):return f'<audio controls preload="none" src="{html.escape(file,quote=True)}"></audio>'
    main_cards=[];others=[]
    selected={'D-NX-A-007-0501','D-H3-A-007-0787','D-S3-A-007-0796','D-A3-A-007-0840'}
    for item in r['items']:
        if item['clip_id'] not in selected:
            others.append(f'<tr><td>{html.escape(item["text"])}</td><td>{audio(item["original_file"])}</td><td>{audio(item["codec_file"])}</td></tr>');continue
        metrics=next(x for x in a['pairs'] if x['clip_id']==item['clip_id'] and x['variant']=='codec_file')
        main_cards.append(f'''<article><small>{item['clip_id']} · {item['emotion']}</small><h2>{html.escape(item['text'])}</h2>
        <div class="listen"><label>원본 녹음{audio(item['original_file'])}</label><label>코덱 복원 · BF16{audio(item['bf16_file'])}</label><label>코덱 복원 · FP32{audio(item['codec_file'])}</label></div>
        <p>FP32 피치 상관 {metrics['f0_correlation']:.4f} · 강약 상관 {metrics['energy_envelope_correlation']:.4f}</p>
        <details><summary>코드북 수를 줄인 진단 비교</summary><p>실제 Miro 경로는 10개를 모두 사용합니다. 아래는 일부 정보를 의도적으로 제외한 비교입니다.</p>
        <div class="listen"><label>시멘틱 코드북 1개{audio(item['q0_file'])}</label><label>시멘틱 + 잔차 1개{audio(item['q01_file'])}</label></div></details></article>''')
    page=f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Miro · 한국어 코덱 정보 보존 검사</title>
    <style>*{{box-sizing:border-box}}body{{margin:0;background:#11131a;color:#e9eaf0;font:16px/1.65 system-ui,sans-serif}}main{{max-width:1200px;margin:auto;padding:40px 24px}}h1{{font-size:30px;line-height:1.3}}h2{{font-size:19px}}article,.panel{{background:#1d202b;border:1px solid #34394c;padding:24px;border-radius:16px;margin:22px 0}}small,p{{color:#bdc3d6}}.listen{{display:flex;gap:22px;flex-wrap:wrap}}label{{display:flex;flex-direction:column;gap:10px;flex:1;min-width:240px}}audio{{width:100%;min-width:220px;max-width:350px}}a{{color:#acbdff}}summary{{cursor:pointer}}td,th{{padding:15px;border-bottom:1px solid #34394c;text-align:left}}table{{width:100%;border-collapse:collapse}}.overflow{{overflow:auto}}.stat{{display:flex;flex-wrap:wrap;gap:26px}}.stat strong{{font-size:26px;display:block}}</style>
    <main><small>MIRO · 한국어 전용 모델 · 2026-10-23</small><h1>코덱에서 연기 정보가 얼마나 남는가</h1><p>007번 실제 녹음을 압축했다가 복원한 비교입니다. 학습한 새 대사의 생성 결과는 아닙니다.</p>
    <div class="panel"><div class="stat"><span><strong>23개</strong>원본 녹음</span><span><strong>{g['f0_correlation']['median']:.4f}</strong>피치 상관 중앙값</span><span><strong>{g['energy_envelope_correlation']['median']:.4f}</strong>강약 상관 중앙값</span><span><strong>+{g['relative_pause_fraction_delta']['median']*100:.2f}%p</strong>쉼 비율 변화 중앙값</span></div>
    <p>상관은 정보 보존율이나 사람다움 점수가 아닙니다. 현재23개에서는 큰 억양·강약 손실이 확인되지 않았습니다. 속삭임·남성 ASMR은 추가 원본이 필요합니다.</p>
    <p>코덱 가중치는 유지했습니다. Miro 학습·서빙에는 코덱 버전과 정밀도 혼용을 막는 검사를 추가했습니다.</p><a href="RESULTS.md">전체 조사·실험 기록</a> · <a href="analysis.json">원시 측정값</a></div>
    {''.join(main_cards)}<details class="panel"><summary>피치·강약 곡선 비교</summary><img src="prosody_comparison.png" alt="007번 4개 녹음의 원본과 코덱 복원 피치 및 강약 곡선" style="width:100%;height:auto;background:white"></details><details class="panel"><summary>추가 19개 원본과 FP32 복원음</summary><div class="overflow"><table><thead><tr><th>대사</th><th>원본</th><th>복원</th></tr></thead><tbody>{''.join(others)}</tbody></table></div></details>
    <p><a href="https://arxiv.org/html/2610.18010v2#S2.SS1">Drama 3 논문</a> · <a href="https://arxiv.org/html/2603.08823v1#S2.SS1">S2 코덱 논문</a> · <a href="https://huggingface.co/facebook/w2v-bert-2.0">다국어 시멘틱 티처</a></p><small>Built with Fish Audio · 35B 본학습과 운영 교체는 실행 전입니다.</small></main>
    <script>document.addEventListener('play',e=>{{if(e.target.tagName==='AUDIO')document.querySelectorAll('audio').forEach(a=>{{if(a!==e.target)a.pause()}})}},true)</script></html>'''
    (root/'compare.html').write_text(page)
    print(json.dumps(facts,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
