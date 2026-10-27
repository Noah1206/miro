"""Package all declared outputs; objective diagnostics are not preference scores."""
import hashlib,html,json,math,shutil,subprocess,sys,re
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from analyze_qwen_bottleneck import feature,pitchpair
from package_voxcpm2_compare import encode_mp3

def main(folder):
 p=Path(folder).resolve();m=json.loads((p/'manifest.json').read_text());r=json.loads((p/'report.json').read_text());assert r['status']=='complete' and len(r['items'])==36
 audits={x['file']:x for x in json.loads((p/'asr_audit_same_text.json').read_text())};old=Path('output/voice-compare/qwen-conditioned-007-20261023/final').resolve()
 audit_old={x['file']:x for x in json.loads((old/'asr_speaker_audit.json').read_text())};audit_ft={x['file']:x for x in json.loads((old/'ranking/asr_speaker_audit.json').read_text())}
 items=list(r['items']);paths={x['file']:p/x['file'] for x in items}
 for row in m['tests']:
  sid=row['id']
  for mode,src,checked in [('existing_clone',old/(sid+'_clone.wav'),audit_old[sid+'_clone.wav']),('conditioned',old/'ranking'/(sid+'_conditioned_e1.wav'),audit_ft[sid+'_conditioned_e1.wav']),('original',old/(sid+'_orig.wav'),audit_old[sid+'_orig.wav'])]:
   name=f'{sid}_{mode}.wav';shutil.copy2(src,p/name);paths[name]=p/name;items.append({'id':sid,'text':row['text'],'mode':row['mode'],'variant':mode,'file':name,'copied_sha256':hashlib.sha256(src.read_bytes()).hexdigest()});audits[name]=checked
 for mode in m['references']:paths['reference_'+mode+'.wav']=p/('reference_'+mode+'.wav')
 names=sorted(paths)
 with ProcessPoolExecutor(max_workers=4) as pool:values=list(pool.map(feature,[str(paths[x]) for x in names]))
 features={name:f[0] for name,f in zip(names,values)};arrays={name:f[1] for name,f in zip(names,values)}
 metrics=[]
 for row in m['tests']:
  for variant in ['existing_clone','conditioned','base_icl','base_speaker_only','trained_icl_diagnostic']:
   item=next(x for x in items if x['id']==row['id'] and x['variant']==variant and x['mode']==row['mode'] and '_repeat' not in x['file']);name=item['file'];original=row['id']+'_original.wav'
   assert audits[name].get('speaker_target','same_text_original')=='same_text_original'
   metrics.append({'id':row['id'],'variant':variant,'file':name,'cer':audits[name]['cer'],'speaker_similarity':audits[name]['speaker_similarity'],'duration_seconds':features[name]['duration_seconds'],**pitchpair(arrays[original],arrays[name],dtw=True)})
 summary=[]
 for variant in ['existing_clone','conditioned','base_icl','base_speaker_only','trained_icl_diagnostic']:
  selected=[x for x in metrics if x['variant']==variant];summary.append({'variant':variant,'n':len(selected),**{key:float(np.mean([x[key] for x in selected if x[key] is not None])) for key in ['cer','speaker_similarity','f0_correlation','f0_median_absolute_error_semitones','duration_seconds']}})
 style=[]
 for row in m['tests']:
  for variant in ['base_icl','base_speaker_only']:
   f=[features[x['file']] for x in items if x['id']==row['id'] and x['variant']==variant and '_repeat' not in x['file']]
   style.append({'id':row['id'],'variant':variant,'four_ref_duration_range_seconds':max(x['duration_seconds'] for x in f)-min(x['duration_seconds'] for x in f),'four_ref_median_pitch_range_semitones':12*np.log2(max(x['f0_median_hz'] for x in f)/min(x['f0_median_hz'] for x in f))})
 first=m['tests'][0];base=next(x for x in r['items'] if x['id']==first['id'] and x['variant']=='base_icl' and x['mode']==first['mode'] and '_repeat' not in x['file']);repeat=next(x for x in r['items'] if '_repeat' in x['file']);y,sr=sf.read(p/base['file']);z,zsr=sf.read(p/repeat['file']);same=sr==zsr and y.shape==z.shape and np.array_equal(y,z)
 for item in r['items']:
  if item['variant'] in ['base_icl','base_speaker_only']:
   actual=item['actual_model_input'][0];assert actual['icl_mode']==[item['variant']=='base_icl'];assert (actual['ref_code_frames'][0] is None)==(item['variant']=='base_speaker_only')
 result={'summary_matching_emotion_reference':summary,'per_text_matching':metrics,'style_reference_spread':style,'repeat_bit_identical':same,'token_limit_suspected':[x['file'] for x in r['items'] if x['token_limit_suspected']],'asr_max_cer':max(x['cer'] for x in audits.values()),'features':list(features.values()),'controls':'Base ICL versus speaker-only uses identical speaker embeddings. Same seed, model, text and reference.','limits':['Three previously exposed fixed test utterances; no listener preference score.','Reference identity, reference transcript and emotion are confounded; no claim of universal emotional control.','Trained ICL is an inference-distribution diagnostic; it was not ICL-trained.']}
 (p/'analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in result.items() if k not in ['features','per_text_matching']},ensure_ascii=False),flush=True)
 listen=p/'listening';listen.mkdir(exist_ok=True);sounds={};levels=[]
 for name,path in paths.items():
  y,sr=sf.read(path,always_2d=True);y=y.mean(axis=1)
  probe=subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-i',str(path),'-af','loudnorm=I=-23:TP=-1:LRA=50:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
  lufs=float(json.loads(re.findall(r'\{[^{}]+"input_i"[^{}]+\}',probe.stderr)[-1])['input_i']);gain=min(-23-lufs,-1-20*np.log10(np.max(np.abs(y))));y*=10**(gain/20)
  if sr!=48000:
   gcd=math.gcd(sr,48000);y=resample_poly(y,48000//gcd,sr//gcd)
  assert np.isfinite(y).all() and np.max(np.abs(y))<=1
  sf.write(listen/name,y,48000,subtype='PCM_16');encode_mp3(listen/name,(listen/name).with_suffix('.mp3'));sounds[name]=y;levels.append({'file':name,'source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'gain_db':float(gain),'duration_seconds':len(y)/48000})
 (p/'listening_levels.json').write_text(json.dumps(levels,ensure_ascii=False,indent=2))
 # Per-file loudness matching is fair for A/B timbre, but hides loudness as an
 # emotion cue. Also publish the new four-style set with ONE common gain.
 style_names=[f"{m['new_test']['id']}_base_icl_{mode}.wav" for mode in m['references']]
 level_by_name={x['file']:x for x in levels}
 original_levels=[sounds[name]/10**(level_by_name[name]['gain_db']/20) for name in style_names]
 common_gain=min(1.,10**(-1/20)/max(float(np.max(np.abs(y))) for y in original_levels))
 common_wav=p/'quick_miro_reference_styles_original_levels.wav'
 sf.write(common_wav,np.concatenate([part for y in original_levels for part in [y*common_gain,np.zeros(48000)]]),48000,subtype='PCM_16');encode_mp3(common_wav,common_wav.with_suffix('.mp3'))
 (p/'common_gain_style_levels.json').write_text(json.dumps({'files':style_names,'common_gain_db':20*math.log10(common_gain),'between_style_loudness_preserved':True},ensure_ascii=False,indent=2))
 timelines={}
 sequences={'quick_speaker_only_then_icl':[next(x['file'] for x in items if x['id']==row['id'] and x['variant']==v and x['mode']==row['mode'] and '_repeat' not in x['file']) for row in m['tests'] for v in ['base_speaker_only','base_icl']],'quick_existing_conditioned_context':[next(x['file'] for x in items if x['id']==row['id'] and x['variant']==v and x['mode']==row['mode'] and '_repeat' not in x['file']) for row in m['tests'] for v in ['existing_clone','conditioned','trained_icl_diagnostic']],'quick_miro_reference_styles':[f"{m['new_test']['id']}_base_icl_{mode}.wav" for mode in m['references']]}
 for name,files in sequences.items():
  parts=[];timeline=[];t=0
  for file in files:
   timeline.append({'file':file,'start_seconds':round(t,2)});parts.extend([sounds[file],np.zeros(48000)]);t+=len(sounds[file])/48000+1
  wav=p/(name+'.wav');sf.write(wav,np.concatenate(parts),48000,subtype='PCM_16');encode_mp3(wav,wav.with_suffix('.mp3'));timelines[name]={'duration_seconds':round(t,2),'tracks':timeline}
 (p/'quick_timelines.json').write_text(json.dumps(timelines,ensure_ascii=False,indent=2))
 labels={'normal':'보통','happy':'기쁨','sad':'슬픔','angry':'분노'};variants={'existing_clone':'기존 클로닝','conditioned':'지난 조건부 학습 최종','base_icl':'참조 말투까지 입력','base_speaker_only':'동일한 목소리 정보만 입력','trained_icl_diagnostic':'학습 모델에 참조 말투 경로 복원 · 진단','original':'성우 실제 녹음','trained_fixed':'지난 학습 모델의 감정 지시'}
 def audio(name,label):
  warning=''
  item=next((x for x in r['items'] if x['file']==name),{})
  if item.get('token_limit_suspected'):warning='생성 상한 의심 — 정상 결과로 채택 불가'
  check=audits.get(name)
  if check and check['cer']>.1:warning+=' · 발음 확인: '+check['transcript']
  return '<div class="take"><b>'+html.escape(label)+'</b><audio controls preload="none" src="listening/'+name.removesuffix('.wav')+'.mp3"></audio><small>'+html.escape(warning)+'</small></div>'
 cards=[]
 for row in m['tests']:
  content=''
  for mode in labels:
   content+='<h3>'+labels[mode]+' 참조 녹음 사용</h3><button class="sequence">목소리 정보만 → 말투 포함</button><div class="pair">'+''.join(audio(f"{row['id']}_{v}_{mode}.wav",variants[v]) for v in ['base_speaker_only','base_icl'])+'</div>'
  content+='<details><summary>기존 결과·조건부 학습·참조 경로 복원 진단·실제 녹음</summary>'
  for v in ['existing_clone','conditioned','trained_icl_diagnostic','original']:
   it=next(x for x in items if x['id']==row['id'] and x['variant']==v and x['mode']==row['mode']);content+=audio(it['file'],variants[v])
  cards.append('<section><h2>'+html.escape(row['text'])+'</h2>'+content+'</details></section>')
 new=m['new_test'];fresh='<section><h2>처음 시험한 미로 대사</h2><p>'+html.escape(new['text'])+'</p>'
 for v in ['base_icl','trained_fixed']:
  fresh+='<h3>'+variants[v]+'</h3>'+''.join(audio(f"{new['id']}_{v}_{mode}.wav",labels[mode]) for mode in labels)
 fresh+='</section>'
 table='<table><tr><th>방식 · 같은 3대사</th><th>음절 오류율</th><th>화자 유사도</th><th>원본 억양 상관</th></tr>'
 for d in summary:table+='<tr><td>'+variants[d['variant']]+'</td><td>'+f"{100*d['cer']:.1f}%"+'</td><td>'+f"{d['speaker_similarity']:.3f}"+'</td><td>'+f"{d['f0_correlation']:.3f}"+'</td></tr>'
 table+='</table>'
 page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>미로 · 남은 연기 병목 조사</title><style>body{margin:0;background:#f5f4ef;color:#252923;font:16px/1.65 system-ui}main{max-width:920px;margin:40px auto;padding:0 22px}h1{font-size:30px}h2{font-size:21px}h3{font-size:17px}section{padding:24px;background:white;border:1px solid #dedfd6;border-radius:14px;margin:20px 0}audio{width:100%;height:40px}.take{display:grid;grid-template-columns:250px 1fr;gap:10px;align-items:center;margin:14px 0}.take small{grid-column:1/-1;color:#9a5420}small,.note{color:#606859}button{background:#35492d;color:white;border:0;border-radius:7px;padding:12px;cursor:pointer}table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd}.callout{background:#fff0d4;padding:18px;border-radius:10px}summary{cursor:pointer}@media(max-width:650px){.take{grid-template-columns:1fr}section{padding:16px}main{padding:0 14px}table{font-size:12px}}</style><main><small>MIRO · 007번 · 추가 학습 없는 원인 분리</small><h1>목소리 정보와 연기 맥락을 나눠 비교하기</h1><p class="callout">007번에는 이미 감정 대화체가 있습니다. 남은 문제는 네 감정 라벨만으로 구절별 연기를 배우기 어렵고, 학습 모델에는 기존 클로닝의 참조 말투 맥락이 없다는 점입니다. 모든 병목이 해결됐거나 아래 새 결과가 더 자연스럽다고 판정한 것은 아닙니다.</p><section><h2>같은 목소리 정보만 → 참조 말투까지</h2><p>세 대사에서 순서대로 비교합니다. 한 쌍에서 화자 embedding은 완전히 동일하며, 참조 음성 코덱과 대본만 추가합니다.</p><audio controls preload="metadata" src="quick_speaker_only_then_icl.mp3"></audio><h2>새 미로 대사: 네 참조 말투</h2><p>보통 → 기쁨 → 슬픔 → 분노 참조 순서입니다. 감정마다 참조가 하나이므로 참조 대사·take와 감정 효과를 분리했다고 주장하지 않습니다.</p><audio controls preload="metadata" src="quick_miro_reference_styles.mp3"></audio><p><a href="PROBLEM_SEARCH.md">병목 조사·다음 학습 설계</a> · <a href="analysis.json">측정 결과</a> · <a href="http://127.0.0.1:8797/compare.html">지난 학습 결과</a></p></section>'''+table+'<p class="note">자동 받아쓰기·화자 유사도·원본 take와의 억양 상관은 자연스러움 점수가 아닙니다. 아래는 동일 시드의 첫 결과를 모두 공개합니다. 재생 음량만 맞췄고 피치·속도·쉼을 수정하지 않았습니다. 새 대사는 학습에 없는 미로형 문장입니다.</p>'+fresh+''.join(cards)+'''</main><script>const all=[...document.querySelectorAll('audio')];let q=[],i=0,timer;all.forEach(a=>a.addEventListener('play',()=>all.forEach(b=>{if(a!==b)b.pause()})));document.querySelectorAll('.sequence').forEach(b=>b.onclick=()=>{clearTimeout(timer);all.forEach(a=>{a.onended=null;a.pause();a.currentTime=0});q=[...b.nextElementSibling.querySelectorAll('audio')];i=0;next()});function next(){const a=q[i++];if(!a)return;a.onended=()=>timer=setTimeout(next,700);a.play().catch(()=>{})}</script></html>'''
 page=page.replace('<p><a href="PROBLEM_SEARCH.md">','<h3>감정별 상대 음량도 보존해서 듣기</h3><p>네 파일에 같은 배율만 적용했습니다. 감정별로 작은 목소리·큰 목소리 차이도 유지합니다.</p><audio controls preload="metadata" src="quick_miro_reference_styles_original_levels.mp3"></audio><p><a href="PROBLEM_SEARCH.md">')
 (p/'compare.html').write_text(page)

if __name__=='__main__':main(sys.argv[1])
