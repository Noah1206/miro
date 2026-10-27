"""Keep all Drama3 takes and compare them with an unchanged Qwen baseline."""
import argparse,hashlib,html,json,subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
import librosa


def main():
    ap=argparse.ArgumentParser();ap.add_argument('folder');a=ap.parse_args();p=Path(a.folder)
    m=json.loads((p/'manifest.json').read_text());report=json.loads((p/'report.json').read_text());audits=json.loads((p/'audit.json').read_text());byfile={r['file']:r for r in audits}
    assert hashlib.sha256((p/'baseline_qwen_clone.wav').read_bytes()).hexdigest()==m['baseline_sha256']
    listen=p/'listening';listen.mkdir(exist_ok=True);waves={};peak=0
    files=['baseline_qwen_clone.wav']+[r['file'] for r in report['items']]
    for file in files:
        y,sr=sf.read(p/file);assert y.ndim==1
        if file!='baseline_qwen_clone.wav':assert hashlib.sha256((p/file).read_bytes()).hexdigest()==next(x for x in report['items'] if x['file']==file)['sha256']
        if sr!=48000:y=librosa.resample(y,orig_sr=sr,target_sr=48000)
        waves[file]=y;peak=max(peak,float(np.abs(y).max()))
    base=waves['baseline_qwen_clone.wav'];gain=min(10**(-23/20)/max(1e-9,float(np.sqrt(np.mean(base**2)))),10**(-1/20)/max(1e-9,peak))
    def write(name,y):
        sf.write(listen/(name+'.wav'),y*gain,48000,subtype='PCM_16');subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(listen/(name+'.wav')),'-b:a','160k',str(listen/(name+'.mp3'))],check=True)
    for file,y in waves.items():write(Path(file).stem,y)
    montage=[];timeline=[];cursor=0
    for file in m['primary_order']:
        y=waves[file];timeline.append({'file':file,'start_seconds':cursor,'end_seconds':cursor+len(y)/48000});montage += [y,np.zeros(28800)];cursor+=len(y)/48000+.6
    write('quick_qwen_then_drama3',np.concatenate(montage))
    (p/'listening_levels.json').write_text(json.dumps({'common_gain':gain,'gain_db':float(20*np.log10(gain)),'individual_loudness_normalization':False,'timeline':timeline},indent=2))
    esc=html.escape
    def player(file):return '<audio controls preload="none" src="listening/'+esc(Path(file).stem)+'.mp3"></audio>'
    def metrics(file):
        r=byfile[file];extra=' · 잘림 의심' if next((x['truncated'] for x in report['items'] if x['file']==file),False) else ''
        return f"길이 {r['duration_seconds']:.2f}초 · 자동 전사 오류율 {r['cer']:.0%} · 참조 화자 유사도 {r['speaker_similarity_to_reference']:.3f}"+extra
    sections=[];labels={'comfort':'위로','contained_anger':'억눌린 분노','relief':'안도'}
    for c in m['contexts']:
        f=c['id']+'_s1234.wav';other=c['id']+'_s4321.wav'
        sections.append(f'<section><h2>{labels[c["id"]]}</h2><p>{esc(c["previous_dialogue"])}<br>{esc(c["scene"])}</p>{player(f)}<p class="metric">{metrics(f)}</p><details><summary>두 번째 테이크와 연출 지시</summary>{player(other)}<p class="metric">{metrics(other)}</p><p>{esc(c["tagged_text"])}</p><p>1번 전사: {esc(byfile[f]["transcript"])}</p><p>2번 전사: {esc(byfile[other]["transcript"])}</p></details></section>')
    caps=sum(x['truncated'] for x in report['items']);bad=sum(x['cer']>.1 for x in audits if x['file']!='baseline_qwen_clone.wav');avg_sim=float(np.mean([x['speaker_similarity_to_reference'] for x in audits if x['file'] not in ['baseline_qwen_clone.wav','neutral_s1234.wav']]))
    result={'training':False,'generated_count':len(report['items']),'truncated_count':caps,'generated_cer_over_10_percent_count':bad,'mean_context_speaker_similarity':avg_sim,'qwen_speaker_similarity':byfile['baseline_qwen_clone.wav']['speaker_similarity_to_reference'],'naturalness_preference_measured':False,'production_approved':False,'all_takes_published':True,'baseline_sha256_verified':True}
    (p/'evaluation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    rows=[]
    for file in files:
        r=byfile[file]
        rows.append(f"| {file} | {r['duration_seconds']:.2f} | {r['active_rate_syllables_per_second']:.2f} | {r['speech_rms_median_dbfs']:.2f} | {r['cer']:.0%} | {r['speaker_similarity_to_reference']:.3f} | {r['transcript']} |")
    notes=f'''# Drama3 007 zero-shot comparison — 2026-10-23

Generated {len(report['items'])} Drama3 clips without training. Existing Qwen1.7B Base ICL WAV was reused byte-for-byte. Production remains unchanged.

Same spoken line: **{m['text']}**. Same original actor007 reference recording for every Drama3 request and the earlier Qwen clone; the engines use their native input sample rates. This is a rights-cleared female reference, not the eventual male character voice.

## Listening

`listening/quick_qwen_then_drama3.mp3`: existing Qwen → comfort seed1234 → contained anger seed1234 → relief seed1234. All takes, including seed4321 and a no-direction control, appear in `compare.html`. No selection by listening or quality score. All raw WAVs are preserved. Listening copies use one common gain ({20*np.log10(gain):.2f} dB), sample-rate conversion and MP3 encoding; no pitch, timing or energy-envelope edits. Montage inserts0.6seconds between clips.

## What the context test means

The three Korean scene descriptions were converted into the explicit inline acting directions saved in `manifest.json`. The model receives those tagged lines and one fixed reference; it does not receive the raw previous dialogue or scene description. This tests conditional delivery, not autonomous scene understanding. Same seeds1234/4321 across contexts. A single short line and two seeds do not establish robust production control or user preference.

## Automatic checks

{caps} of7 generations reached the frame cap; {bad} exceeded10% ASR character error. Automated transcription, short-clip speaker embeddings, and acoustic measurements do not establish humanlike acting, accurate emotion, or listening preference. No subjective listening result is claimed.

| Clip | Seconds | Active syllables/s | Median active RMS dBFS | ASR CER | Ref speaker cosine | ASR transcript |
|---|---:|---:|---:|---:|---:|---|
'''+ '\n'.join(rows)+f'''

Active frames:20ms RMS above each clip's95th-percentile level minus30dB. This heuristic includes some breaths and does not replace forced alignment. Active rate uses the target's syllable count, so interpret only alongside CER. Speaker similarity is a short-clip cross-language embedding proxy, not identity verification.

## Reproducibility and runtime

- Official source: `{report['source_commit']}`.
- Model: `fishaudio/drama-3@{report['model_revision']}`.
- GPU: {report['gpu']}; native eager PyTorch, no serving optimizations.
- Settings: `{json.dumps(m['settings'])}`.
- All inference directions, seeds, hashes and finish reasons: `manifest.json` and `report.json`.
- Baseline SHA256 verified: `{m['baseline_sha256']}`.
- A runtime import failed initially because TensorBoard's generated protobuf code required a newer protobuf version than the installed runtime. Pinned TensorBoard2.19.0 and verified codec import in the image before the successful retry. A subsequent first-generation decode exposed CPU token indices being passed to the GPU codec; copied indices to the codec device as the official CLI does. One import-check shell quoting typo was also corrected during image build. Generation then completed all7 WAVs. The ASR file reader failed because PyAV19 rejects metadata_errors; a separate L4 job audited existing WAVs as16kHz arrays without generating again. No model weights modified. Build and error logs retained.

## License

Built with Fish Audio. User confirmed Miro and affiliates trailing12month aggregate revenue belowUSD500000. [Actual Drama3 license](https://huggingface.co/fishaudio/drama-3/blob/{report['model_revision']}/LICENSE) reviewed for this character-speech test. No public generic TTS hosting, production deployment, or training on generated outputs performed.
'''
    (p/'RESULTS.md').write_text(notes)
    page=f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Drama3 ·007 클로닝 비교</title><style>body{{max-width:1000px;margin:40px auto;padding:0 20px;background:#10131c;color:#eee;font:17px/1.65 system-ui}}h1,h2{{line-height:1.35}}section{{background:#1c2232;border-radius:18px;padding:24px;margin:20px 0}}audio{{width:min(100%,500px)}}.metric{{font-size:14px;color:#bbc4da}}a{{color:#b8a5ff}}.note{{padding:16px;border-left:4px solid #f0bb69}}summary{{cursor:pointer}}</style><h1>Drama 3, 007번 목소리로 직접 비교</h1><p>“{esc(m['text'])}” · 추가 학습 없음 · 같은 참조 음성 · 기존 Qwen 파일 보존</p><p class="metric">장면에 맞춰 작성한 연출 지시를 모델에 입력했습니다. 앞선 대화의 맥락을 모델이 스스로 해석했는지는 이번 실험에서 검증하지 않았습니다.</p><p class="note">Drama3 7개 테이크 중 자동 전사 오류율10% 초과 {bad}개, 잘림 {caps}개. 자동 수치로 감정 연기나 사람 같은 자연스러움을 판정하지 않았습니다. 세 장면이 다르게 들리는지, 007번 목소리로 들리는지 확인할 수 있도록 모든 테이크를 남겼습니다.</p><section><h2>한 번에 듣기</h2><p>기존 Qwen 클로닝 → Drama3 위로 → 억눌린 분노 → 안도</p><audio controls preload="metadata" src="listening/quick_qwen_then_drama3.mp3"></audio><p class="metric">속도·피치·강약 후처리 없음. 모든 클립에 동일한 재생 게인을 적용했고 클립 사이에만0.6초 간격을 뒀습니다.</p></section><section><h2>기존 Qwen1.7B 클로닝</h2>{player('baseline_qwen_clone.wav')}<p class="metric">{metrics('baseline_qwen_clone.wav')}</p><p>이미 만들어 둔 파일을 바이트 그대로 재사용했습니다.</p></section><section><h2>Drama3 기본 클로닝 · 연기 지시 없음</h2>{player('neutral_s1234.wav')}<p class="metric">{metrics('neutral_s1234.wav')}</p></section>{''.join(sections)}<section><h2>같은 007번 원본 참조</h2><audio controls preload="none" src="007_reference.wav"></audio><p>{esc(m['reference_text'])}</p><p class="metric">007번은 현재 비교용 여성 목소리입니다. 각 모델은 같은 녹음 내용을 자기 입력 샘플레이트로 처리합니다. 화자 유사도는 짧은 음성의 참고 지표이며 연기의 자연스러움 점수가 아닙니다.</p></section><p>Built with Fish Audio · <a href="https://huggingface.co/fishaudio/drama-3">공식 Drama3 모델</a> · <a href="RESULTS.md">실험 설명</a> · <a href="evaluation.json">검사 요약</a> · <a href="report.json">생성 기록</a> · <a href="audit.json">전사와 측정</a> · <a href="http://127.0.0.1:8800/compare.html">이전 Qwen 학습 실험</a></p></html>'''
    (p/'compare.html').write_text(page);print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
