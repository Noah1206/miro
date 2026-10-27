"""Publish corrected Coqui reference-transfer evaluation with existing comparisons."""
import argparse,hashlib,html,json,shutil,subprocess
from pathlib import Path
import librosa,numpy as np,soundfile as sf


def main():
    ap=argparse.ArgumentParser();ap.add_argument('folder');a=ap.parse_args();p=Path(a.folder)
    m=json.loads((p/'manifest.json').read_text());r=json.loads((p/'report.json').read_text());assert r['status']=='complete'
    audit=json.loads((p/'audit/audit.json').read_text());byfile={x['file']:x for x in audit['items']}
    extra_items=[];extra_audits=[];repair=p/'repair-nosplit'
    if (repair/'report.json').exists() and (repair/'audit/audit.json').exists():
        rr=json.loads((repair/'report.json').read_text());assert rr['status']=='complete'
        for item in rr['items']:
            file='nosplit_'+item['file'];shutil.copy2(repair/item['file'],p/file);extra_items.append({**item,'file':file})
        for item in json.loads((repair/'audit/audit.json').read_text())['items']:
            extra_audits.append({**item,'file':'nosplit_'+item['file']})
        byfile.update({x['file']:x for x in extra_audits})
    parent=p.parent;long=parent/'drama3-long-whisper-007-20261023';short=parent/'drama3-007-20261023';assets={
      'qwen_long.wav':long/'qwen/qwen_clone_s1234.wav','drama_long_comfort.wav':long/'drama/comfort_s1234.wav',
      'qwen_short.wav':short/'baseline_qwen_clone.wav','drama_short_neutral.wav':short/'neutral_s1234.wav'}
    hashes={}
    for name,source in assets.items():
        shutil.copy2(source,p/name);hashes[name]=hashlib.sha256(source.read_bytes()).hexdigest();assert hashlib.sha256((p/name).read_bytes()).hexdigest()==hashes[name]
    files=list(assets)+[x['file'] for x in r['items']+extra_items];waves={};peak=0
    for file in files:
        if file not in assets:assert hashlib.sha256((p/file).read_bytes()).hexdigest()==next(x['sha256'] for x in r['items']+extra_items if x['file']==file)
        y,sr=sf.read(p/file);assert y.ndim==1 and np.isfinite(y).all();waves[file]=librosa.resample(y,orig_sr=sr,target_sr=48000);peak=max(peak,float(np.abs(waves[file]).max()))
    base=waves['qwen_long.wav'];gain=min(10**(-23/20)/float(np.sqrt(np.mean(base**2))),10**(-1/20)/max(peak,1e-9))
    listen=p/'listening';listen.mkdir(exist_ok=True)
    def encode(stem,y):
        sf.write(listen/(stem+'.wav'),y*gain,48000,subtype='PCM_16');subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(listen/(stem+'.wav')),'-b:a','160k',str(listen/(stem+'.mp3'))],check=True)
    for file,y in waves.items():encode(Path(file).stem,y)
    order={'quick_long_qwen_drama_xtts':['qwen_long.wav','drama_long_comfort.wav','long_fixed_reference.wav'],
           'quick_short_qwen_drama_xtts':['qwen_short.wav','drama_short_neutral.wav','short_normal_reference.wav'],
           'reference_emotion_comparison':['short_normal_reference.wav','short_happy_reference.wav','short_sad_reference.wav','short_angry_reference.wav']}
    if extra_items:
        order['quick_short_nosplit_qwen_drama_xtts']=['qwen_short.wav','drama_short_neutral.wav','nosplit_short_normal_reference.wav']
        order['reference_emotion_nosplit']=['nosplit_short_'+label+'_reference.wav' for label in ['normal','happy','sad','angry']]
    for stem,keys in order.items():encode(stem,np.concatenate([z for key in keys for z in [waves[key],np.zeros(38400)]]))
    (p/'listening_levels.json').write_text(json.dumps({'common_gain_db':float(20*np.log10(gain)),'individual_normalization':False,'montage_order':order,'preserved_baseline_hashes':hashes,'processing':'Preview common gain/resampling/MP3 only. No pitch, speed or emotion DSP;0.8second montage gaps.'},ensure_ascii=False,indent=2))
    esc=html.escape
    def player(file):return f'<audio controls preload="none" src="listening/{Path(file).stem}.mp3"></audio>'
    def metrics(file):
        x=byfile[file];return f"{x['duration_seconds']:.2f}초 · 전사 오류율 {x['cer']:.1%} · 평상시007 참조 유사도 {x['speaker_cosine_to_normal_007']:.3f}"
    labels={'normal':'평상시','happy':'기쁨','sad':'슬픔','angry':'분노'};sections=[]
    for label,title in labels.items():
        file='short_'+label+'_reference.wav';ref=label+'_reference.wav'
        fixed='nosplit_'+file;extra=f'<h3>문장분할 끈 추가 비교</h3>{player(fixed)}<p class="metric">{metrics(fixed)}</p><p>전사: {esc(byfile[fixed]["transcript"])}</p>' if extra_items else ''
        sections.append(f'<section><h2>{title} 참조로 생성</h2><p>대사: 괜찮아. 나 여기 있어.</p><p class="metric">초기 문장분할 설정</p>{player(file)}<p class="metric">{metrics(file)}</p>{extra}<details><summary>원본 참조와 전사</summary><audio controls preload="none" src="{ref}"></audio><p>{esc(m["references"][ref]["text"])}</p><p>초기 생성 전사: {esc(byfile[file]["transcript"])}</p><p class="metric">표시된 감정은 참조 데이터의 라벨입니다. 생성 음성의 감정 정확성을 검증한 결과가 아닙니다. 참조 텍스트도 서로 달라 감정만을 분리한 실험은 아닙니다.</p></details></section>')
    bad=[x for x in audit['items'] if x['cer']>.05]
    extra_bad=[x for x in extra_audits if x['cer']>.05]
    repair_overview=f'<section><h2>문장분할 끈 추가 실험</h2><p>Qwen → Drama3 → XTTS문장분할끔</p><audio controls preload="none" src="listening/quick_short_nosplit_qwen_drama_xtts.mp3"></audio><p>같은 설정으로4개 감정 참조를 모두 재생성했습니다. 전사 오류율5% 초과 {len(extra_bad)}/4개. 실제 오디오 샘플은4개 모두 초기 결과와 같았습니다. 이 설정 변경으로 개선되지 않았습니다. 전사 차이는 같은 음성에 대한 인식 변동입니다. 아래에 두 실행을 모두 남겼습니다.</p><p>평상시 → 기쁨 → 슬픔 → 분노 참조</p><audio controls preload="none" src="listening/reference_emotion_nosplit.mp3"></audio></section>' if extra_items else ''
    page=f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>블로그 방법 검증 · Coqui007</title><style>body{{max-width:1000px;margin:40px auto;padding:0 20px;background:#10131c;color:#eef;font:17px/1.65 system-ui}}section{{background:#1b2232;border-radius:18px;padding:24px;margin:20px 0}}audio{{width:min(100%,600px)}}h1,h2{{line-height:1.3}}.metric{{font-size:14px;color:#bbc4da}}.note{{border-left:4px solid #ffc478;padding:15px}}a{{color:#beaaff}}summary{{cursor:pointer}}</style><h1>블로그 방법을 고쳐서 직접 만든 Coqui 비교</h1><p>한국어 지원 XTTS-v2 · 권리 확보된007번 · 추가 학습 없음 · 내부 평가용</p><p class="note">블로그의 한국어 VITS 모델 경로가 공식 목록에 없어 실제 한국어 클로닝 모델 XTTS-v2로 수정했습니다. 긴 대사1개와 감정별 원본 참조를 바꾼 짧은 대사4개를 생성했습니다. 초기 짧은 대사4개 중3개가 전사 검사에서 대사를 벗어났고 문장분할 설정 변경으로도 개선되지 않았습니다. 감정 조건 학습이나 맥락 자동 해석이 완성된 것은 아닙니다.</p><section><h2>짧게 세 모델 비교</h2><p>같은 대사: 괜찮아. 나 여기 있어.</p><p>기존 Qwen 클로닝 → Drama3 기본 클로닝 → XTTS-v2 기본 클로닝</p><audio controls preload="metadata" src="listening/quick_short_qwen_drama_xtts.mp3"></audio></section><section><h2>긴 대사 세 모델 비교</h2><p>기존 Qwen 모델 → Drama3 위로 연기 → XTTS-v2 평상시 참조</p><audio controls preload="none" src="listening/quick_long_qwen_drama_xtts.mp3"></audio><p class="metric">Qwen과Drama3는 앞서 만든 파일을 복사해 사용했습니다. Drama3만 연출 지시를 받으며, XTTS는 참조 음성 방식입니다.</p><details><summary>공통 대사와 XTTS 단독 듣기</summary><p>{esc(m['requests'][0]['text'])}</p>{player('long_fixed_reference.wav')}<p class="metric">{metrics('long_fixed_reference.wav')}</p><p>전사: {esc(byfile['long_fixed_reference.wav']['transcript'])}</p></details></section><section><h2>블로그의 감정 참조 방식</h2><p>평상시 → 기쁨 → 슬픔 → 분노 참조로 같은 대사 생성</p><audio controls preload="none" src="listening/reference_emotion_comparison.mp3"></audio><p class="metric">실제 속삭임 원본이 없어 속삭임 참조를 임의로 만들지 않았습니다. 기존 Drama3 속삭임 실험은 아래 링크에서 들을 수 있습니다.</p></section>{''.join(sections)}<section><h2>분석 결과</h2><p>공식 목록에 없는 모델명과 불완전한 감정 학습 설명을 수정했습니다.007번600클립에 감정 라벨은 있으나 같은 문장의 다중 감정 녹음 짝은 없었습니다. 추가 학습을 무작정 반복하는 근거로 이 글을 사용하기는 어렵습니다.</p><p>자동 전사 오류율5% 초과: {len(bad)}/5개. 이 검사는 자연스러움이나 연기 점수가 아닙니다. 원본과 모든 생성 결과를 공개했습니다.</p><p><a href="BLOG_REVIEW.md">블로그 상세 검증과 공식 근거</a> · <a href="audit/audit.json">전사 검사</a> · <a href="report.json">생성 기록</a> · <a href="data_audit.json">007번 자료 점검</a></p></section><p><a href="http://127.0.0.1:8802/compare.html">Drama3 긴 대사·세 맥락·속삭임 전체 비교</a> · <a href="https://myinfo1551.tistory.com/120">참고한 블로그</a> · <a href="MODEL_LICENSE.txt">XTTS 모델 이용 조건</a></p><p class="metric">XTTS 결과는 CPML의 내부 테스트·평가 범위로 생성했습니다. 코드 패키지의 라이선스와 체크포인트의 이용 조건은 별개입니다. Drama3 비교 음성: Built with Fish Audio.</p></html>'''
    page=page.replace('<section><h2>긴 대사 세 모델 비교</h2>',repair_overview+'<section><h2>긴 대사 세 모델 비교</h2>')
    (p/'compare.html').write_text(page)
    result={'generated':len(r['items'])+len(extra_items),'training':False,'all_takes_published':True,'evaluation_only':True,'production_changed':False,'asr_cer_over_5_percent':[x['file'] for x in bad+extra_bad],'initial_bad_count':len(bad),'nosplit_bad_count':len(extra_bad),'subjective_naturalness_judged':False,'raw_hashes_verified':True}
    (p/'evaluation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
