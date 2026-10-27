"""Same-text comparison of preserved cloning and emotion-conditioned candidates."""
import base64,hashlib,html,json,math,re,subprocess,sys
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from package_voxcpm2_compare import encode_mp3

def main(folder):
 p=Path(folder).resolve();m=json.loads((p/'manifest.json').read_text());r=json.loads((p/'report.json').read_text());a=json.loads((p/'comparison_analysis.json').read_text());audit={x['file']:x for x in json.loads((p/'asr_speaker_audit.json').read_text())};best=r['best_epoch'];listen=p/'listening';listen.mkdir(exist_ok=True)
 rankp=p/'ranking';rr=json.loads((rankp/'report.json').read_text()) if (rankp/'comparison_analysis.json').exists() else None
 ranked_analysis=json.loads((rankp/'comparison_analysis.json').read_text()) if rr else None
 gate=False
 if rr:
  vd=ranked_analysis['validation_diagnostics'];before=vd[0];after=vd[-1];gate=after['validation_macro_loss']<=before['validation_macro_loss']+.1 and after['mean_wrong_minus_correct_nll']>=.01
  audit.update({'ranking__'+x['file']:x for x in json.loads((rankp/'asr_speaker_audit.json').read_text())})
 labels={'normal':'보통 대화','happy':'기쁨','sad':'슬픔','angry':'분노'};assets={};sounds={};levels=[]
 sources={name:p/name for name in ({x['file'] for x in r['items']}|{x['file'] for x in m['baselines']})}
 if rr:sources.update({'ranking__'+x['file']:rankp/x['file'] for x in rr['items']})
 for name,src in sorted(sources.items()):
  y,sr=sf.read(src,always_2d=True);y=y.mean(axis=1)
  if not len(y) or not np.isfinite(y).all() or np.max(np.abs(y))<1e-6:raise ValueError(name)
  probe=subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-i',str(src),'-af','loudnorm=I=-23:TP=-1:LRA=50:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
  lufs=float(json.loads(re.findall(r'\{[^{}]+"input_i"[^{}]+\}',probe.stderr)[-1])['input_i']);gain=min(-23-lufs,-1-20*np.log10(np.max(np.abs(y))));y*=10**(gain/20)
  if sr!=48000:
   gcd=math.gcd(sr,48000);y=resample_poly(y,48000//gcd,sr//gcd)
  if np.max(np.abs(y))>1:raise ValueError('Resample clipping '+name)
  wav=listen/name;sf.write(wav,y,48000,subtype='PCM_16');encode_mp3(wav,wav.with_suffix('.mp3'))
  sounds[name]=y;assets[name]='data:audio/mpeg;base64,'+base64.b64encode(wav.with_suffix('.mp3').read_bytes()).decode();levels.append({'file':name,'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'input_lufs':lufs,'constant_gain_db':float(gain),'duration_seconds':len(y)/48000})
 def take(name,label):
  checked=audit[name];generation=next((x for x in (rr['items'] if name.startswith('ranking__') and rr else r['items']) if x['file']==name.removeprefix('ranking__')),{});warning=('<p class="warn">발음 확인: '+html.escape(checked['transcript'])+'</p>') if checked['cer']>.15 else ''
  if generation.get('token_limit_suspected'):warning+='<p class="warn">생성 길이 상한에 닿았을 가능성이 있어 정상 완료 결과로 채택할 수 없습니다.</p>'
  return '<div class="take"><b>'+html.escape(label)+'</b><audio controls preload="none" data-label="'+html.escape(label)+'" src="'+assets[name]+'"></audio>'+warning+'</div>'
 cards=[];matrices=[]
 for row in m['test_items']:
  sid=row['id'];title='<small>'+labels[row['mode']]+'</small><h2>'+html.escape(row['text'])+'</h2>'
  main=take(sid+'_clone.wav','기존 Qwen 클로닝')+take(f'{sid}_conditioned_e{best}.wav',f'감정 조건부 학습 · {best}회')
  if rr:main+=take(f'ranking__{sid}_conditioned_e1.wav','조건 집중 보강 후'+(' · 검증 기준 통과' if gate else ' · 검증 기준 미통과'))
  previous=take(sid+'_previous_ft.wav','이전 단일 화자 파인튜닝')+take(sid+'_orig.wav','성우 실제 녹음')
  other=3-best
  previous+=take(f'{sid}_conditioned_e{other}.wav',f'감정 조건부 학습 · 다른 체크포인트 {other}회')
  cards.append('<section>'+title+'<button class="sequence">기존 클로닝 → 조건부 학습'+(' → 조건 집중 보강' if rr else '')+'</button><p class="playing"></p><div class="main-takes">'+main+'</div><details><summary>이전 파인튜닝·실제 녹음·다른 체크포인트</summary>'+previous+'</details></section>')
 for row in m['matrix_items']:
  sid=row['id'];parts=[]
  for seed in [1234,4321]:
   content='<button class="sequence">보통 → 기쁨 → 슬픔 → 분노</button><p class="playing"></p><div class="main-takes">'+''.join(take(f'{sid}_{mode}_s{seed}.wav',labels[mode]) for mode in labels)+'</div>'
   parts.append(content if seed==1234 else '<details><summary>다른 시드 4321에서도 듣기</summary>'+content+'</details>')
  if rr:
   for seed in [1234,4321]:
    content='<button class="sequence">보통 → 기쁨 → 슬픔 → 분노</button><p class="playing"></p><div class="main-takes">'+''.join(take(f'ranking__{sid}_{mode}_s{seed}.wav',labels[mode]) for mode in labels)+'</div>'
    parts.append('<details><summary>조건 집중 보강 결과 · 시드 '+str(seed)+'</summary>'+content+'</details>')
  matrices.append('<section><h2>'+html.escape(row['text'])+'</h2>'+''.join(parts)+'</section>')
 timelines={}
 chosen=[row['id'] for row in m['matrix_items']]
 sequences={'quick_clone_then_conditioned':[name for sid in chosen for name in [sid+'_clone.wav',f'ranking__{sid}_conditioned_e1.wav' if gate else f'{sid}_conditioned_e{best}.wav']],'quick_conditioned_four_emotions':[(f'ranking__{chosen[-1]}_{mode}_s1234.wav' if gate else f'{chosen[-1]}_{mode}_s1234.wav') for mode in labels]}
 for name,files in sequences.items():
  chunks=[];timeline=[];t=0
  for file in files:
   y=sounds[file];timeline.append({'start_seconds':round(t,2),'file':file});chunks.extend([y,np.zeros(48000)]);t+=len(y)/48000+1
  wav=p/(name+'.wav');sf.write(wav,np.concatenate(chunks),48000,subtype='PCM_16');encode_mp3(wav,wav.with_suffix('.mp3'));timelines[name]={'duration_seconds':round(t,2),'tracks':timeline}
 summary='<table><tr><th>방식</th><th>음절 오류율</th><th>목소리 유사도</th><th>억양 상관</th></tr>'
 mode_labels={'clone':'기존 클로닝','previous_ft':'이전 파인튜닝','conditioned_e1':'조건부 1회','conditioned_e2':'조건부 2회'}
 table_rows=list(a['comparison_summary'])
 if rr:table_rows.append({**next(x for x in ranked_analysis['comparison_summary'] if x['mode']=='conditioned_e1'),'mode':'ranked'})
 mode_labels['ranked']='조건 집중 보강 1회'
 for d in table_rows:summary+='<tr><td>'+mode_labels[d['mode']]+'</td><td>'+f"{100*d['cer']:.1f}%"+'</td><td>'+f"{d['speaker_similarity']:.3f}"+'</td><td>'+f"{d['f0_correlation']:.3f}"+'</td></tr>'
 summary+='</table>'
 page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>미로 · 감정 조건부 학습 비교</title><style>body{margin:0;background:#f6f5ef;color:#252923;font:16px/1.65 system-ui}main{max-width:940px;margin:40px auto;padding:0 22px}h1{font-size:32px}h2{font-size:20px}section{border:1px solid #dedfd6;background:white;border-radius:16px;padding:24px;margin:20px 0}.take{display:grid;grid-template-columns:240px 1fr;gap:12px;align-items:center;margin:16px 0}audio{width:100%;height:40px}button{border:0;border-radius:8px;background:#35492d;color:white;padding:12px;cursor:pointer}.note,small{color:#626a5b}.callout{background:#fff1d7;padding:18px;border-radius:12px}.playing{min-height:24px;font-size:14px}details{margin-top:22px}summary{cursor:pointer}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;border-bottom:1px solid #ddd;padding:10px}.warn{grid-column:1/-1;color:#986020;font-size:13px}@media(max-width:650px){.take{grid-template-columns:1fr;gap:3px}main{padding:0 14px}section{padding:16px}}</style><main><small>MIRO · 2026.10.23 · 007번 여성 성우</small><h1>기존 클로닝과 감정 조건부 학습</h1><p>기존 Qwen 클로닝 파일을 재사용하고, 같은 6개 대사로 새 결과를 생성했습니다. 각 문장에서 <b>기존 → 새 조건부 학습</b>을 비교해 주세요.</p><p class="note">훈련 558문장·약45분, 검증32문장, 비교 대사6개는 학습에서 제외했습니다. 감정 지시·한국어 정보·텍스트 투영을 실제 SDK 입력과 맞췄고, 같은 입력이 되는지 수치 검증을 통과했습니다. 최대2회 학습 중 검증 손실로 선택된 BEST회 결과를 앞에 표시합니다.</p><p class="callout">보통·기쁨·슬픔·분노의 녹음 라벨을 조건으로 학습했습니다. 속삭임·숨·웃음·어절별 타이밍과 자유로운 연기 지시 일반화는 이번 학습 범위가 아닙니다. 자동 수치는 사람 같은 연기나 선호를 판정하지 않습니다.</p>'''.replace('BEST',str(best))+summary+'''<p class="note">음절 오류율은 자동 받아쓰기(낮을수록 정확), 목소리 유사도는 Resemblyzer(높을수록 유사), 억양 상관은 실제 녹음과 MFCC DTW 정렬한 피치 곡선입니다. 다른 자연스러운 연기까지 원본과 다르다는 이유로 나쁘다고 볼 수 없습니다. 재생 음량 배율만 맞췄으며 속도·피치·쉼은 수정하지 않았습니다.</p>'''+''.join(cards)+'''<h1>같은 문장, 네 가지 연기 조건</h1><p class="note">선택된 체크포인트에서 대사·시드를 고정하고 감정 지시만 바꿨습니다. 다른 시드에서도 들어볼 수 있습니다.</p>'''+''.join(matrices)+'''<p class="note">두 체크포인트의 비교 대사 음성 모두 공개했습니다. 학습·추론 정합성과 감정 조건을 함께 수정했으므로 개선 원인을 감정 조건 하나로 분리해 주장하지 않습니다.</p></main><script>let queue=[],idx=0,timer=null;const all=[...document.querySelectorAll('audio')];function stop(){clearTimeout(timer);queue=[];all.forEach(a=>{a.onended=null;a.pause();a.currentTime=0});document.querySelectorAll('.playing').forEach(p=>p.textContent='')}all.forEach(a=>a.addEventListener('play',()=>all.forEach(b=>{if(a!==b)b.pause()})));document.querySelectorAll('.sequence').forEach(b=>b.onclick=()=>{stop();queue=[...b.parentElement.querySelector('.main-takes').querySelectorAll('audio')];idx=0;next()});function next(){const a=queue[idx++];if(!a)return;const p=a.closest('section').querySelector('.playing');p.textContent='재생 중: '+a.dataset.label;a.onended=()=>{p.textContent='';timer=setTimeout(next,700)};a.play().catch(()=>p.textContent='재생 버튼을 눌러 주세요.')}</script></html>'''
 if rr:
  disclosure='<p class="callout">조건부 학습에는 라벨 비교 보조항을 포함했고, 그 강도와 학습률을 높인 조건 집중 보강을 1회 추가했습니다. 검증 손실 악화 0.1 이내·정답 지시 우위 0.01 이상이라는 사전 기준 '+('통과' if gate else '미통과')+'입니다. 이는 자연스러움 판정이 아닙니다. 요약 음성의 새 후보는 '+('조건 집중 보강 모델' if gate else '조건부 '+str(best)+'회 모델')+'입니다.</p>'
  page=page.replace('<h1>기존 클로닝과 감정 조건부 학습</h1>','<h1>기존 클로닝과 감정 조건부 학습</h1>'+disclosure)
 quick_intro='<section><h2>40초 비교부터 듣기</h2><p>세 문장에서 기존 클로닝 → 새 최종 후보 순서로 반복합니다.</p><audio controls preload="metadata" src="quick_clone_then_conditioned.mp3"></audio><h2>같은 대사, 감정만 바꾸기</h2><p>보통 → 기쁨 → 슬픔 → 분노 순서입니다.</p><audio controls preload="metadata" src="quick_conditioned_four_emotions.mp3"></audio><p><a href="RESULTS.md">결과와 한계 전체 보기</a></p></section>'
 page=page.replace('<h1>기존 클로닝과 감정 조건부 학습</h1>','<h1>기존 클로닝과 감정 조건부 학습</h1>'+quick_intro)
 page=page.replace('발음 확인','발음 확인').replace('방식','방식').replace('음절 오류율','음절 오류율').replace('목소리 유사도','목소리 유사도').replace('억양 상관','억양 상관')
 (p/'selection.json').write_text(json.dumps({'conditional_epoch':best,'ranking_gate_passed':gate,'quick_candidate':'condition_focus' if gate else 'conditional_sft','not_a_naturalness_judgment':True},ensure_ascii=False,indent=2));(p/'compare.html').write_text(page);(p/'listening_levels.json').write_text(json.dumps(levels,ensure_ascii=False,indent=2));(p/'quick_timelines.json').write_text(json.dumps(timelines,ensure_ascii=False,indent=2));print(json.dumps({'tracks':len(assets),'best_epoch':best,'quick':timelines},ensure_ascii=False))
if __name__=='__main__':main(sys.argv[1])
