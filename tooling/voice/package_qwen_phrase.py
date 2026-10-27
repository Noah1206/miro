"""Same-text listening and measured control checks for phrase-ICL SFT."""
import hashlib,html,json,math,re,shutil,subprocess,sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from analyze_qwen_bottleneck import feature,pitchpair
from package_voxcpm2_compare import encode_mp3

def main(folder):
 p=Path(folder).resolve();m=json.loads((p/'manifest.json').read_text());r=json.loads((p/'report.json').read_text());assert r['status']=='complete';best=r['best_epoch'];modes=['clone','prior_conditioned']+[f'phrase_e{e}' for e in range(1,m['settings']['epochs']+1)];audit={x['file']:x for x in json.loads((p/'asr_audit.json').read_text())};aligned={x['file']:x for x in json.loads((p/'generated_alignment.json').read_text())};history=json.loads((p/'training_history.json').read_text());names=sorted({x['file'] for x in r['items']}|{x['file'] for x in m['baselines']})
 previous=Path('output/voice-compare/qwen-conditioned-007-20261023/final/ranking');pa={x['file']:x for x in json.loads((previous/'asr_speaker_audit.json').read_text())}
 for row in m['test_items']:
  name=row['id']+'_prior_conditioned.wav';src=previous/(row['id']+'_conditioned_e1.wav');shutil.copy2(src,p/name);audit[name]=pa[src.name];names.append(name)
 with ProcessPoolExecutor(max_workers=4) as pool:values=list(pool.map(feature,[str(p/name) for name in names]))
 feats={name:x[0] for name,x in zip(names,values)};arrays={name:x[1] for name,x in zip(names,values)};comparisons=[]
 for row in m['test_items']:
  sid=row['id'];original=sid+'_orig.wav'
  for mode in modes:
   name=sid+'_'+mode+'.wav';comparisons.append({'id':sid,'mode':mode,'file':name,'cer':audit[name]['cer'],'speaker_similarity':audit[name]['speaker_similarity'],'duration_seconds':feats[name]['duration_seconds'],**pitchpair(arrays[original],arrays[name],dtw=True)})
 summary=[]
 for mode in modes:
  rows=[x for x in comparisons if x['mode']==mode];summary.append({'mode':mode,'n':len(rows),**{key:float(np.mean([x[key] for x in rows if x[key] is not None])) for key in ['cer','speaker_similarity','f0_correlation','f0_median_absolute_error_semitones','duration_seconds']}})
 controls=[]
 for row in m['matrix_items']:
  for axis,levels in [('speed',['slow','normal','fast']),('pause',['none','short','long'])]:
   observed=[]
   for level in levels:
    name=f"{row['id']}_{axis}_{level}.wav";a=aligned[name];entry={'requested':level,'file':name,'duration_seconds':feats[name]['duration_seconds'],'cer':audit[name]['cer'],'valid_alignment':a['valid']}
    if a['valid']:
     entry.update(syllables_per_second=a['alignment']['syllables_per_second'],internal_pause_seconds=float(np.mean([x['pause_seconds'] for x in a['alignment']['phrases'][:-1]])) if len(a['alignment']['phrases'])>1 else None)
    observed.append(entry)
   usable=all(x['valid_alignment'] and x['cer']<=.1 for x in observed)
   key='syllables_per_second' if axis=='speed' else 'internal_pause_seconds';ordered=[x.get(key) for x in observed];strict=usable and None not in ordered and ordered[0]<ordered[1]<ordered[2]
   controls.append({'id':row['id'],'axis':axis,'items':observed,'usable':usable,'strict_requested_order':bool(strict)})
 result={'best_epoch':best,'comparison_summary':summary,'comparisons':comparisons,'controls':controls,'control_order_pass':{axis:{'pass':sum(x['strict_requested_order'] for x in controls if x['axis']==axis),'total':3} for axis in ['speed','pause']},'suspected_generation_caps':[x['file'] for x in r['items'] if x['token_limit_suspected']],'generated_alignment_valid':sum(x['valid'] for x in aligned.values()),'training_validation':{'initial':history['initial_validation']['macro_loss'],'epochs':[{'epoch':x['epoch'],'loss':x['validation']['macro_loss']} for x in history['epochs']]},'limits':['No subjective human preference measurement.','CTC timing is approximate; generated text errors disqualify timing-control checks.','Same six historically exposed test utterances, not a new independent benchmark.','New test requests use text-only default plans, never original test timings.','A new model must not be called production-ready based on likelihood/F0/CER alone.']}
 (p/'analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False),flush=True)
 listen=p/'listening';listen.mkdir(exist_ok=True);sounds={};raw_sounds={};levels=[]
 for name in names:
  path=p/name;y,sr=sf.read(path,always_2d=True);y=y.mean(axis=1);probe=subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-i',str(path),'-af','loudnorm=I=-23:TP=-1:LRA=50:print_format=json','-f','null','-'],capture_output=True,text=True,check=True);lufs=float(json.loads(re.findall(r'\{[^{}]+"input_i"[^{}]+\}',probe.stderr)[-1])['input_i']);gain=min(-23-lufs,-1-20*np.log10(np.max(np.abs(y))))
  if sr!=48000:
   gcd=math.gcd(sr,48000);y=resample_poly(y,48000//gcd,sr//gcd)
  raw_sounds[name]=y.copy();y=y*10**(gain/20);assert np.isfinite(y).all() and np.max(np.abs(y))<=1
  sf.write(listen/name,y,48000,subtype='PCM_16');encode_mp3(listen/name,(listen/name).with_suffix('.mp3'));sounds[name]=y;levels.append({'file':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'constant_gain_db':float(gain),'input_lufs':lufs})
 (p/'listening_levels.json').write_text(json.dumps(levels,ensure_ascii=False,indent=2));timelines={}
 quicks={'quick_clone_then_phrase':[name for row in m['matrix_items'] for name in [row['id']+'_clone.wav',f"{row['id']}_phrase_e{best}.wav"]],'quick_speed_controls':[f"{m['matrix_items'][-1]['id']}_speed_{s}.wav" for s in ['slow','normal','fast']],'quick_pause_controls':[f"{m['matrix_items'][-1]['id']}_pause_{s}.wav" for s in ['none','short','long']]}
 for name,files in quicks.items():
  parts=[];t=0;tracks=[]
  for file in files:tracks.append({'file':file,'start_seconds':round(t,2)});parts.extend([sounds[file],np.zeros(48000)]);t+=len(sounds[file])/48000+1
  wav=p/(name+'.wav');sf.write(wav,np.concatenate(parts),48000,subtype='PCM_16');encode_mp3(wav,wav.with_suffix('.mp3'));timelines[name]={'duration_seconds':round(t,2),'tracks':tracks}
 files=[f"{m['new_test']['id']}_miro_{mode}.wav" for mode in m['references']];gain=min(1,10**(-1/20)/max(float(np.max(np.abs(raw_sounds[f]))) for f in files));wav=p/'quick_miro_emotions.wav';sf.write(wav,np.concatenate([x for f in files for x in [raw_sounds[f]*gain,np.zeros(48000)]]),48000,subtype='PCM_16');encode_mp3(wav,wav.with_suffix('.mp3'));timelines['quick_miro_emotions']={'files':files,'common_gain_db':20*math.log10(gain),'same_normal_reference_for_all':True};(p/'quick_timelines.json').write_text(json.dumps(timelines,ensure_ascii=False,indent=2))
 emotion={'normal':'보통','happy':'기쁨','sad':'슬픔','angry':'분노'};model_labels={'clone':'기존 Qwen 클로닝','prior_conditioned':'지난 조건부 학습','phrase_e1':'새 구조 · 1회','phrase_e2':'새 구조 · 2회'}
 def take(name,label):
  a=audit[name];warning=('발음 확인: '+a['transcript']) if a['cer']>.1 else '';it=next((x for x in r['items'] if x['file']==name),{})
  if it.get('token_limit_suspected'):warning+=' · 생성 상한 의심'
  return '<div class="take"><b>'+html.escape(label)+'</b><audio controls preload="none" src="listening/'+name.removesuffix('.wav')+'.mp3"></audio><small>'+html.escape(warning)+'</small></div>'
 table='<table><tr><th>방식 · 6대사</th><th>음절 오류율</th><th>목소리 유사도</th><th>원본 억양 상관</th></tr>'
 for x in summary:table+='<tr><td>'+model_labels[x['mode']]+'</td><td>'+f"{100*x['cer']:.1f}%"+'</td><td>'+f"{x['speaker_similarity']:.3f}"+'</td><td>'+f"{x['f0_correlation']:.3f}"+'</td></tr>'
 table+='</table>';cards=[]
 for row in m['test_items']:
  sid=row['id'];cards.append('<section><small>'+emotion[row['mode']]+'</small><h2>'+html.escape(row['text'])+'</h2><button class="sequence">기존 클로닝 → 새 학습 결과</button><div class="pair">'+take(sid+'_clone.wav','기존 클로닝')+take(f'{sid}_phrase_e{best}.wav',f'새 구조 · 선택된 {best}회')+'</div><details><summary>실제 녹음·지난 학습·다른 회차</summary>'+take(sid+'_orig.wav','성우 실제 녹음')+take(sid+'_prior_conditioned.wav','지난 조건부 학습')+(take(f'{sid}_phrase_e{3-best}.wav','다른 회차') if m['settings']['epochs']==2 else '')+'</details></section>')
 control_cards=[]
 for row in m['matrix_items']:
  parts=[]
  for axis,choices in [('speed',[('slow','느리게'),('normal','보통'),('fast','빠르게')]),('pause',[('none','쉬지 않기'),('short','짧게'),('long','길게')])]:
   check=next(x for x in controls if x['id']==row['id'] and x['axis']==axis);parts.append('<h3>'+('속도만 변경' if axis=='speed' else '구절 사이 쉼만 변경')+'</h3><p>자동 측정의 요청 순서 확인: '+('통과' if check['strict_requested_order'] else '미통과 또는 측정 불확실')+'</p><button class="sequence">세 조건 차례로 듣기</button><div class="pair">'+''.join(take(f"{row['id']}_{axis}_{v}.wav",label) for v,label in choices)+'</div>')
  control_cards.append('<section><h2>'+html.escape(row['text'])+'</h2>'+''.join(parts)+'</section>')
 fresh='<section><h2>새 미로 대사 · 감정만 바꾸기</h2><p>'+html.escape(m['new_test']['text'])+'</p><p>참조 녹음은 네 조건 모두 같은 보통 녹음입니다. 감정 조건만 바꾸었습니다.</p>'+''.join(take(f"{m['new_test']['id']}_miro_{v}.wav",emotion[v]) for v in emotion)+'</section>'
 page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>미로 · 구절 계획과 참조 말투 학습</title><style>body{margin:0;background:#f6f5ef;color:#252923;font:16px/1.65 system-ui}main{max-width:940px;margin:40px auto;padding:0 22px}h1{font-size:30px}h2{font-size:20px}h3{font-size:17px}section{background:white;border:1px solid #dedfd6;border-radius:14px;padding:24px;margin:20px 0}.take{display:grid;grid-template-columns:230px 1fr;gap:10px;align-items:center;margin:14px 0}.take small{grid-column:1/-1;color:#986020}audio{width:100%;height:40px}small,.note{color:#60685b}button{background:#35492d;color:white;border:0;border-radius:7px;padding:12px;cursor:pointer}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}.callout{background:#fff0d4;border-radius:10px;padding:18px}summary{cursor:pointer}@media(max-width:650px){.take{grid-template-columns:1fr}main{padding:0 14px}section{padding:16px}}</style><main><small>MIRO · 007번 여성 성우 · 2026.10.23</small><h1>구절별 계획과 참조 말투를 함께 배운 결과</h1><p>원본 감정 라벨·녹음에서 측정한 구절별 속도와 쉼을 조건으로 학습했습니다. 참조 음성과 대본을 입력하는 경로를 유지합니다.</p><p class="callout">사람 같은 연기·프로덕션 품질을 달성했다는 판정은 아닙니다. 자동 정렬 주석에는 오차가 있고, 특히 쉬지 않는 구절 예시는 적습니다. 아래의 조건 제어는 측정과 직접 청취로 따로 확인해야 합니다.</p><section><h2>기존 클로닝 → 새 학습 결과</h2><p>세 대사마다 기존 → 새 순서로 반복합니다.</p><audio controls preload="metadata" src="quick_clone_then_phrase.mp3"></audio><h2>새 대사: 보통 → 기쁨 → 슬픔 → 분노</h2><p>같은 참조 녹음·같은 시드·같은 대사에서 감정 조건만 변경했습니다. 네 파일에 같은 음량 배율을 적용했습니다.</p><audio controls preload="metadata" src="quick_miro_emotions.mp3"></audio><p><a href="RESULTS.md">결과와 학습 구조</a> · <a href="analysis.json">측정 근거</a></p></section>'''+table+f'<p class="note">정렬 통과: 학습 {r["train_count"]}문장·검증 {r["validation_count"]}문장. 비교6대사는 학습에서 제외했습니다. 두 회차 중 검증 손실로 선택된 {best}회 모델을 앞에 표시하며 두 회차 결과 모두 공개합니다. 억양 상관은 원본 한 take와의 일치이며 자연스러움 점수가 아닙니다. A/B 재생용 음량만 맞췄고 속도·피치·쉼은 후처리하지 않았습니다.</p>'+''.join(cards)+'<h1>같은 문장, 속도·쉼만 바꾸기</h1><p>조건별 음성은 모델이 직접 생성했습니다. 강제 시간 정렬로 측정했으며, 발음 오류 또는 정렬 불확실 시 제어 성공으로 인정하지 않습니다.</p>'+''.join(control_cards)+fresh+'''</main><script>const all=[...document.querySelectorAll('audio')];let q=[],i=0,timer;all.forEach(a=>a.addEventListener('play',()=>all.forEach(b=>{if(a!==b)b.pause()})));document.querySelectorAll('.sequence').forEach(b=>b.onclick=()=>{clearTimeout(timer);all.forEach(a=>{a.onended=null;a.pause();a.currentTime=0});q=[...b.nextElementSibling.querySelectorAll('audio')];i=0;next()});function next(){const a=q[i++];if(!a)return;a.onended=()=>timer=setTimeout(next,700);a.play().catch(()=>{})}</script></html>''';
 if m['settings']['epochs']==1:page=page.replace('두 회차 중 검증 손실로 선택된 1회 모델을 앞에 표시하며 두 회차 결과 모두 공개합니다.','조건 구분 보강을 1회 수행한 모델입니다.').replace('새 구조 · 1회','조건 구분 보강 · 1회')
 (p/'compare.html').write_text(page)

def overview(folder):
 p=Path(folder).resolve();a=json.loads((p/'analysis.json').read_text());b=json.loads((p/'conditioning/analysis.json').read_text());m=json.loads((p/'manifest.json').read_text());protocol=json.loads((p/'selection_protocol.json').read_text());old=next(x for x in a['comparison_summary'] if x['mode']=='clone');base=next(x for x in a['comparison_summary'] if x['mode']==f"phrase_e{a['best_epoch']}");focus=next(x for x in b['comparison_summary'] if x['mode']==f"phrase_e{b['best_epoch']}")
 strict=sum(x['pass'] for x in b['control_order_pass'].values());gate=not b['suspected_generation_caps'] and focus['cer']<=.05 and focus['speaker_similarity']>=.8188 and strict>0
 # Report the predeclared gate AND a resolution caution. A 20ms difference is
 # mathematically ordered but not convincing independent timing control.
 meaningful=0;direction=0;pause_margins=[]
 for c in b['controls']:
  if c['axis']!='pause' or not c['usable']:continue
  xs=[r['internal_pause_seconds'] for r in c['items']];margin=min(xs[1]-xs[0],xs[2]-xs[1]);pause_margins.append({'id':c['id'],'minimum_step_seconds':margin});meaningful+=margin>=.06;direction+=xs[2]-xs[0]>=.06
 choice={'predeclared_comparison_gate_passed':gate,'listening_candidate':'conditioning' if gate else 'base','production_approved':False,'pause_meaningful_order_count_60ms':meaningful,'pause_long_vs_none_increase_at_least_60ms':direction,'pause_step_margins':pause_margins,'caution':'One strict pause pass has only about20ms between short and long; do not call it robust control.','naturalness_preference_measured':False};(p/'selection.json').write_text(json.dumps(choice,ensure_ascii=False,indent=2))
 if not (p/'base_compare.html').exists():shutil.copy2(p/'compare.html',p/'base_compare.html')
 chosen='conditioning/' if gate else '';shutil.copy2(p/(chosen+'quick_clone_then_phrase.mp3'),p/'quick_clone_then_selected.mp3');shutil.copy2(p/(chosen+'quick_miro_emotions.mp3'),p/'quick_selected_miro_emotions.mp3')
 rows=''
 for label,item in [('기존 클로닝',old),('새 구조 · 2회 학습',base),('조건 구분 보강 · 추가1회',focus)]:rows+=f"<tr><td>{label}</td><td>{item['speaker_similarity']:.3f}</td><td>{item['f0_correlation']:.3f}</td><td>{100*item['cer']:.1f}%</td></tr>"
 line=m['test_items'][-1]['text'];controls=b['control_order_pass'];examples=[]
 for row in m['test_items']:
  sid=row['id'];examples.append('<section><h2>'+html.escape(row['text'])+'</h2><div class="take"><b>기존 클로닝</b><audio controls preload="none" src="listening/'+sid+'_clone.mp3"></audio></div><div class="take"><b>新 구조 · 2회 학습</b><audio controls preload="none" src="listening/'+sid+'_phrase_e2.mp3"></audio></div><div class="take"><b>추가 조건 구분 보강</b><audio controls preload="none" src="conditioning/listening/'+sid+'_phrase_e1.mp3"></audio></div></section>'.replace('新 구조','새 구조'))
 page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>미로 · 007 구절 학습 최종 비교</title><style>body{margin:0;background:#f6f5ef;color:#252923;font:16px/1.65 system-ui}main{max-width:900px;margin:38px auto;padding:0 22px}h1{font-size:30px}h2{font-size:20px}section{background:white;border:1px solid #dedfd6;border-radius:14px;padding:24px;margin:20px 0}audio{width:100%;height:42px}.take{display:grid;grid-template-columns:220px 1fr;gap:12px;align-items:center;margin:15px 0}small,.note{color:#60685b}.callout{padding:18px;background:#fff0d4;border-radius:10px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;border-bottom:1px solid #ddd;padding:10px}a{color:#304f29}@media(max-width:650px){.take{grid-template-columns:1fr}main{padding:0 14px}section{padding:16px}}</style><main><small>MIRO · 007번 여성 성우 · 학습446문장 / 검증24문장</small><h1>구절 계획과 참조 말투를 함께 학습한 결과</h1><p>실제 감정 라벨·녹음에서 측정한 구절별 속도와 쉼을 사용했고, 참조 음성과 대본을 받는 경로를 유지했습니다. 기본2회 학습 후 조건 구분 보강을1회 추가했습니다.</p><p class="callout"><b>학습과 비교는 완료했지만, 사람 같은 연기 제어는 아직 미완성입니다.</b> 목소리 유사도는 높아졌으나 원본 억양 모양 일치는 개선되지 않았습니다. 보강 후 세 단계 제어 검사는 속도0/3·쉼1/3이며, 쉼 통과도 짧음/긺 차이가20ms 정도인 사례여서 안정적 제어로 보지 않습니다.</p><section><h2>38초 비교: 기존 → 새 보강 모델</h2><p>세 대사마다 기존 클로닝 → 새 결과가 반복됩니다. 검증용 첫 시드 결과를 사용했습니다.</p><audio controls preload="metadata" src="quick_clone_then_selected.mp3"></audio><h2>새 미로 대사, 감정만 바꾸기</h2><p>“괜찮아. 서두르지 말고, 천천히 말해 줘.”<br>보통 → 기쁨 → 슬픔 → 분노. 참조·대사·시드는 고정했고 네 파일에 같은 음량 배율만 적용했습니다.</p><audio controls preload="metadata" src="quick_selected_miro_emotions.mp3"></audio><p><a href="base_compare.html">기본 학습 전체 비교</a> · <a href="conditioning/compare.html">보강·속도·쉼 전체 비교</a> · <a href="RESULTS.md">학습 구조와 결과</a></p></section><table><tr><th>같은6대사 평균</th><th>목소리 유사도</th><th>원본 억양 상관</th><th>자동 음절 오류율</th></tr>'''+rows+'''</table><p class="note">목소리 유사도·원본 한 take와의 억양 일치·자동 받아쓰기는 자연스러움이나 사람의 선호 점수가 아닙니다. 기존 클로닝 파일은 그대로 보존했습니다. 재생용 A/B는 음량만 맞췄고 속도·피치·쉼은 수정하지 않았습니다.</p>'''+''.join(examples)+'''<section><h2>같은 대사, 속도·쉼 지시 확인</h2><p>“'''+html.escape(line)+'''”</p><p>느림 → 보통 → 빠름</p><audio controls preload="metadata" src="conditioning/quick_speed_controls.mp3"></audio><p>쉬지 않기 → 짧게 → 길게</p><audio controls preload="metadata" src="conditioning/quick_pause_controls.mp3"></audio><p class="note">측정에서 안정적인 독립 제어를 확인하지 못했습니다. 세부 파형과 측정은 보강 전체 비교에서 볼 수 있습니다. 속삭임·숨·웃음·남자 캐릭터 연기는 이번 학습 범위가 아닙니다.</p></section></main><script>const all=[...document.querySelectorAll('audio')];all.forEach(a=>a.addEventListener('play',()=>all.forEach(b=>{if(a!==b)b.pause()})))</script></html>''';(p/'compare.html').write_text(page)

if __name__=='__main__':
 if '--overview-only' in sys.argv:overview(sys.argv[1])
 else:main(sys.argv[1])
