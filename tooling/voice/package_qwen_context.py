"""Preserve cross-context loudness and expose all predeclared comparison takes."""
import argparse,html,json,math,subprocess
from pathlib import Path
import numpy as np
import soundfile as sf


def main():
    ap=argparse.ArgumentParser();ap.add_argument('folder');a=ap.parse_args();p=Path(a.folder)
    report=json.loads((p/'report.json').read_text());audits=json.loads((p/'acoustic_audit.json').read_text());plans=json.loads((p/'context_plans.json').read_text());lookup={x['file']:x for x in audits}
    primary=['baseline_clone.wav','comfort_s1234.wav','contained_anger_s1234.wav','relief_s1234.wav']
    audio={};peak=0
    for item in report['items']:
        y,sr=sf.read(p/item['file']);assert sr==24000
        audio[item['file']]=y;peak=max(peak,float(np.abs(y).max()))
    # One common gain for EVERY generated clip. Per-clip loudness normalization
    # would erase the exact property this experiment asks listeners to compare.
    baseline=audio['baseline_clone.wav'];rms=float(np.sqrt(np.mean(baseline**2)))
    gain=min(10**(-23/20)/max(rms,1e-10),10**(-1/20)/max(peak,1e-10))
    listen=p/'listening';listen.mkdir(exist_ok=True)
    def mp3(name,y):
        source=listen/(name+'.wav');source_y=y*gain;assert np.max(np.abs(source_y))<1
        sf.write(source,source_y,24000,subtype='PCM_16')
        subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-ar','48000','-b:a','160k',str(listen/(name+'.mp3'))],check=True)
    for file,y in audio.items():mp3(Path(file).stem,y)
    timeline=[];parts=[];cursor=0
    for file in primary:
        y=audio[file];timeline.append({'file':file,'start_seconds':cursor,'end_seconds':cursor+len(y)/24000});parts += [y,np.zeros(14400)];cursor+=len(y)/24000+.6
    mp3('quick_clone_then_contexts',np.concatenate(parts));(p/'listening_gain.json').write_text(json.dumps({'common_gain':gain,'gain_db':20*math.log10(gain),'per_clip_normalization':False,'timeline':timeline},indent=2))
    byaxis={}
    for axis in ['speed','energy']:
        items=sorted([x for x in report['items'] if x.get('axis')==axis],key=lambda x:x['value'])
        observations=[lookup[x['file']]['rate_active_syllables_per_second' if axis=='speed' else 'speech_rms_median_dbfs'] for x in items]
        quality=all(lookup[x['file']]['cer']<=.1 and not x['token_cap_suspected'] for x in items)
        margins=[observations[i+1]-observations[i] for i in range(len(observations)-1)]
        ordered=all(x>0 for x in margins)
        meaningful=all(observations[i+1]>=observations[i]*1.1 for i in range(2)) if axis=='speed' else all(x>=1 for x in margins)
        byaxis[axis]={'items':[x['file'] for x in items],'values':observations,'quality_pass':quality,'strictly_ordered':ordered,'meaningful_order':meaningful,'passed':quality and ordered and meaningful}
    result={'status':report['status'],'axis_tests':byaxis,'all_context_cer_at_most_10_percent':all(lookup[f'{x}_s{s}.wav']['cer']<=.1 for x in ['comfort','contained_anger','relief'] for s in [1234,4321]),'token_caps':sum(x['token_cap_suspected'] for x in report['items']),'human_acting_preference_measured':False,'production_approved':False}
    (p/'evaluation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    esc=html.escape
    def player(file):return '<audio controls preload="none" src="listening/'+esc(Path(file).stem)+'.mp3"></audio>'
    def metrics(file):
        r=lookup[file]
        return f"길이 {r['duration_seconds']:.2f}초 · 발화 속도 {r['rate_active_syllables_per_second']:.2f}음절/초 · 강약 {r['speech_rms_median_dbfs']:.1f}dBFS · CER {r['cer']:.0%}"
    labels={'comfort':'위로','contained_anger':'억눌린 분노','relief':'안도'}
    sections=[]
    for x in plans['items']:
        c=x['case'];plan=x['plan'];file=c['id']+'_s1234.wav'
        controls=' / '.join(f"{z['text']} → 속도 {z['rate_relative_to_character']:.2f}배, 강약 {z['energy_start_db']:+g}→{z['energy_mid_db']:+g}→{z['energy_end_db']:+g}dB, 뒤쉼 {z['pause_after_ms']}ms" for z in plan['phrases'])
        sections.append(f'<section><h2>{labels[c["id"]]}</h2><p>{esc(c["previous_dialogue"])}<br>{esc(c["scene"])}</p><p>{esc(plan["evidence"])}</p>{player(file)}<p class="metric">{metrics(file)}</p><details><summary>다른 시드와 감독의 목표</summary>{player(c["id"]+"_s4321.wav")}<p>{esc(controls)}</p><p>목표값이며 실제로 그대로 수행되었다는 의미는 아닙니다.</p></details></section>')
    axes=[]
    for axis,title in [('speed','속도만 변경'),('energy','강약만 변경')]:
        r=byaxis[axis];rows=''.join(f'<tr><td>{x["value"]:+g}</td><td>{player(x["file"])}</td><td>{metrics(x["file"])}</td></tr>' for x in sorted([x for x in report['items'] if x.get('axis')==axis],key=lambda x:x['value']))
        axes.append(f'<section><h2>{title}: {"통과" if r["passed"] else "미통과"}</h2><p>속도는 단계마다10% 이상, 강약은1dB 이상 증가하고 CER10% 이하·잘림 없음이어야 통과합니다.</p><table>{rows}</table></section>')
    headline='속도·강약 분리 검사 모두 통과' if all(x['passed'] for x in byaxis.values()) else '속도·강약 제어는 아직 일부 또는 전부 미통과'
    page=f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>007 맥락 연기 비교</title><style>body{{max-width:1060px;margin:40px auto;padding:0 20px;background:#10121a;color:#eee;font:17px/1.65 system-ui}}h1,h2{{line-height:1.3}}section{{padding:24px;background:#1c2030;border-radius:18px;margin:20px 0}}audio{{width:min(100%,440px)}}.metric{{color:#b8bdd0;font-size:14px}}table{{width:100%}}td{{padding:10px}}a{{color:#b6a5ff}}.note{{border-left:4px solid #edb65e;padding:14px}}@media(max-width:720px){{table,tbody,tr,td{{display:block}}}}</style><h1>같은 대사, 세 가지 맥락</h1><p>“{esc(plans['items'][0]['case']['text'])}” · 007번 · 같은 참조·기본 시드</p><p class="note">{headline}. 자동 측정은 사람 같은 연기의 증명이 아닙니다. 편하게 들리는지, 세 장면을 구분할 수 있는지 함께 확인해 주세요.</p><section><h2>한 번에 듣기</h2><p>기존 클로닝 → 위로 → 억눌린 분노 → 안도</p><audio controls preload="metadata" src="listening/quick_clone_then_contexts.mp3"></audio><p class="metric">각 클립 사이에만 0.6초 간격. 모든 음성에 같은 재생 게인을 적용하여 강약 차이를 보존했습니다.</p></section><section><h2>기존 Qwen1.7B 클로닝</h2>{player('baseline_clone.wav')}<p class="metric">{metrics('baseline_clone.wav')}</p><p>새 대사이므로 기존 Base 클로닝 방식으로 이번에 생성했습니다. 기존 비교 파일은 보존했습니다.</p></section>{''.join(sections)}<section><h2>제어를 끈 새 체크포인트</h2>{player('frame_controls_off.wav')}<p class="metric">{metrics('frame_controls_off.wav')}</p></section>{''.join(axes)}<p>발화 속도는 음절 수/에너지 기준 유효 발화 시간의 근사치입니다. 강약은 발화 프레임 RMS 중앙값이며 성대 긴장·속삭임의 검증이 아닙니다. 새 짧은 대사는 학습에 없으며, 현재 007 데이터에는 같은 문장의 여러 연기 및 장면 의도 정답이 없습니다. 맥락 감독의 계획은 언어 모델의 추론입니다. 운영 모델은 교체하지 않았습니다.</p><p><a href="evaluation.json">측정 결과</a> · <a href="context_plans.json">맥락별 연기 목표</a> · <a href="training_history.json">학습 기록</a> · <a href="RESULTS.md">실험 설명</a></p></html>'''
    (p/'compare.html').write_text(page)
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
