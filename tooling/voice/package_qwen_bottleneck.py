"""Listening board with preserved group loudness, optional equal-loudness listening."""
import base64,hashlib,html,json,math,re,subprocess,sys
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from package_voxcpm2_compare import encode_mp3

def main(folder):
 p=Path(folder).resolve();m=json.loads((p/'manifest.json').read_text());r=json.loads((p/'report.json').read_text());analysis=json.loads((p/'acoustic_analysis.json').read_text());asr={x['file']:x for x in json.loads((p/'asr_audit.json').read_text())}
 old=p.parent/'three-models-20261022';ft=p.parent/'qwen-finetune-007-20261023';listen=p/'listening';listen.mkdir(exist_ok=True)
 levels=[];sounds={};assets={}
 def load(src):
  y,sr=sf.read(src,always_2d=True);y=y.mean(axis=1)
  probe=subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-i',str(src),'-af','loudnorm=I=-23:TP=-1:LRA=50:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
  lufs=float(json.loads(re.findall(r'\{[^{}]+"input_i"[^{}]+\}',probe.stderr)[-1])['input_i'])
  if sr!=48000:
   gcd=math.gcd(sr,48000);y=resample_poly(y,48000//gcd,sr//gcd)
  return y,lufs
 def group(entries,anchor):
  data={key:load(src) for key,label,src in entries}
  peak=max(np.max(np.abs(y)) for y,lufs in data.values());gain=min(-23-data[anchor][1],-1-20*np.log10(peak))
  for key,label,src in entries:
   y,lufs=data[key];common=y*10**(gain/20);equal=y*10**(min(-23-lufs,-1-20*np.log10(np.max(np.abs(y))))/20)
   urls=[]
   for suffix,snd in [('group',common),('equal',equal)]:
    if not np.isfinite(snd).all() or np.max(np.abs(snd))>1:raise ValueError(key)
    wav=listen/f'{key}_{suffix}.wav';sf.write(wav,snd,48000,subtype='PCM_16');encode_mp3(wav,wav.with_suffix('.mp3'))
    urls.append('data:audio/mpeg;base64,'+base64.b64encode(wav.with_suffix('.mp3').read_bytes()).decode())
   sounds[key]=common
   levels.append({'key':key,'source':str(src),'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'input_lufs':lufs,'common_gain_db':float(gain)})
   diagnostic=asr.get(src.name)
   warning=''
   if diagnostic and diagnostic['cer']>.15:warning='<p class="warn">대사 누락·발음 확인 필요: '+html.escape(diagnostic['transcript'])+'</p>'
   assets[key]=f'<div class="take"><span>{html.escape(label)}</span><audio controls preload="none" data-label="{html.escape(label)}" data-group="{urls[0]}" data-equal="{urls[1]}" src="{urls[0]}"></audio>{warning}</div>'
 codec_sections=[];instructioncards=[]
 def tableheaders(heads,rows):return '<table><thead><tr>'+''.join('<th>'+html.escape(x)+'</th>' for x in heads)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(str(x))+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>'
 for row in m['codec_items']:
  sid=row['id'];group([(sid+'_input','실제 녹음 · 24kHz 입력',p/f'{sid}_input24.wav'),(sid+'_codec','같은 녹음 · 코덱 복원',p/f'{sid}_codec.wav')],sid+'_input')
  d=next(d for d in analysis['codec_pairs'] if d['id']==sid)
  hint=f"피치 곡선 상관 {d['f0_correlation']:.3f} · 피치 오차 {d['f0_median_absolute_error_semitones']:.2f}반음 · 길이 차이 {1000*d['duration_delta_seconds']:.0f}ms" if d['f0_correlation'] is not None else '피치 측정 불가'
  codec_sections.append('<section><small>'+html.escape(row['emotion'])+'</small><h2>'+html.escape(row['text'])+'</h2><button class="sequence">원본 → 코덱 복원</button><p class="playing"></p><div class="sequence-takes">'+assets[sid+'_input']+assets[sid+'_codec']+'</div><p class="note">'+hint+'</p></section>')
 labels={'none':'지시 없음','happy':'기쁨 지시','sad':'슬픔 지시','angry':'분노 지시','whisper':'속삭임 지시'}
 for row in m['instruction_items']:
  sid=row['id'];blocks=[]
  for seed in m['seeds']:
   entries=[(f'{sid}_{mode}_s{seed}',label,p/f'{sid}_{mode}_s{seed}.wav') for mode,label in labels.items()]
   group(entries,f'{sid}_none_s{seed}')
   content='<button class="sequence">지시 없음 → 기쁨 → 슬픔 → 분노 → 속삭임</button><p class="playing"></p><div class="sequence-takes">'+''.join(assets[key] for key,label,src in entries)+'</div>'
   blocks.append(content if seed==1234 else '<details><summary>다른 시드 4321에서도 듣기</summary>'+content+'</details>')
  entries=[(sid+'_oldclone','기존 Base · 007 클로닝',old/f'{sid}_qwen_clone.wav'),(sid+'_oldft','기존 1회 학습 결과',ft/f'{sid}_qwen_ft_epoch0.wav')]
  group(entries,sid+'_oldclone')
  instructioncards.append('<section><h2>'+html.escape(row['text'])+'</h2>'+''.join(blocks)+'<details><summary>이전에 들었던 결과도 듣기</summary>'+''.join(assets[key] for key,label,src in entries)+'</details></section>')
 timelines={}
 sequences={'quick_codec_original_then_roundtrip':[(row['id']+suffix) for row in m['instruction_items'] for suffix in ['_input','_codec']], 'quick_instructions_same_text':[(m['instruction_items'][-1]['id']+f'_{mode}_s1234') for mode in labels]}
 for name,keys in sequences.items():
  chunks=[];timeline=[];t=0
  for key in keys:
   y=sounds[key];timeline.append({'seconds':round(t,2),'key':key});chunks.extend([y,np.zeros(48000)]);t+=len(y)/48000+1
  wav=p/(name+'.wav');sf.write(wav,np.concatenate(chunks),48000,subtype='PCM_16');encode_mp3(wav,wav.with_suffix('.mp3'));timelines[name]={'seconds':round(t,2),'tracks':timeline}
 overview=tableheaders(['조건','문장 수×시드','길이 배율','원래 음량 차이','유성 비율 차이'],[[labels[d['mode']],str(d['n']),f"{d['duration_ratio_mean']:.2f}×",f"{d['rms_delta_db_mean']:+.1f} dB",f"{100*d['voiced_fraction_delta_mean']:+.1f}%p"] for d in analysis['instruction_summary']])
 page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>미로 · 007 음성 병목 분리</title><style>body{margin:0;background:#f6f5ef;color:#252923;font:16px/1.65 system-ui}main{max-width:980px;margin:40px auto;padding:0 24px}h1{font-size:32px}h2{font-size:20px}section{background:white;border:1px solid #dedfd6;padding:24px;border-radius:16px;margin:20px 0}.take{display:grid;grid-template-columns:230px 1fr;align-items:center;gap:12px;margin:15px 0}.note,small{color:#606a5b}audio{width:100%;height:40px}button{background:#35492d;color:white;border:0;border-radius:8px;padding:12px;cursor:pointer}.playing{font-size:14px;min-height:24px;color:#526843}.callout{background:#fff3d9;padding:18px;border-radius:12px}.toolbar{position:sticky;top:0;background:#eeeee4;padding:12px;z-index:10}details{margin:20px 0}summary{cursor:pointer}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}.warn{grid-column:1/-1;color:#986020;font-size:13px}@media(max-width:650px){.take{grid-template-columns:1fr;gap:2px}section{padding:16px}main{padding:0 14px}table{font-size:12px}th,td{padding:5px}}</style><main><small>MIRO · 2026.10.23 · 007번 여성 성우 · 추가 학습 없음</small><h1>연기는 어디에서 사라질까?</h1><p>먼저 원본과 코덱 복원본을 비교하고, 그다음 같은 대사를 지시만 바꿔 들어보세요.</p><div class="toolbar"><label><input id="equal" type="checkbox"> 음량 차이를 맞춰 듣기</label><div class="note">기본은 비교 묶음 전체에 같은 배율만 적용합니다. 속삭임의 작은 음량 차이를 보존합니다. 체크하면 각 파일 음량을 맞춰 발성·억양을 비교합니다.</div></div><h1>1. 실제 녹음 → 코덱 복원</h1><p class="note">새로 대사를 생성하지 않고 같은 녹음을 압축·복원했습니다. 24kHz로 변환한 입력을 기준으로 비교합니다. 피치 상관은 음질·감정 점수가 아닙니다.</p>'''+''.join(codec_sections)+'''<h1>2. 같은 대사, 다섯 가지 지시</h1><p class="callout">현재 007 파인튜닝 모델, 같은 대사·설정·시드에서 지시만 바꿨습니다. 실제 모델에 지시 토큰이 전달되는지도 기록했습니다. 출력이 달라지는 것만으로 올바른 감정·속삭임을 이해했다고 판정할 수 없습니다.</p>'''+overview+''.join(instructioncards)+'''<p class="callout">확인된 속삭임·독립된 웃음/숨 원본이 없으므로 해당 표현의 코덱 보존 여부는 미판정입니다. 유성 비율 감소는 속삭임을 의심할 단서이며 확정 판별기가 아닙니다. 기존 Base 클로닝은 자연어 지시를 지원하는 경로가 아니므로 미지원 인자를 억지로 전달하지 않았습니다.</p><p><a href="pipeline.html">장면 → 연출 → 합성 → 재생 시연 보기</a></p></main><script>let queue=[],idx=0,nextTimer=null;const audios=[...document.querySelectorAll('audio')];function stop(){clearTimeout(nextTimer);queue=[];audios.forEach(a=>{a.onended=null;a.pause();a.currentTime=0});document.querySelectorAll('.playing').forEach(x=>x.textContent='')}audios.forEach(a=>a.addEventListener('play',()=>audios.forEach(b=>{if(a!==b)b.pause()})));document.querySelector('#equal').onchange=e=>{stop();audios.forEach(a=>a.src=e.target.checked?a.dataset.equal:a.dataset.group)};document.querySelectorAll('.sequence').forEach(b=>b.onclick=()=>{stop();queue=[...b.parentElement.querySelector('.sequence-takes').querySelectorAll('audio')];idx=0;next()});function next(){const a=queue[idx++];if(!a)return;const p=a.closest('section').querySelector('.playing');p.textContent='재생 중: '+a.dataset.label;a.onended=()=>{p.textContent='';nextTimer=setTimeout(next,700)};a.play().catch(()=>p.textContent='재생 버튼을 눌러 주세요.')}</script></html>'''
 (p/'compare.html').write_text(page);(p/'listening_levels.json').write_text(json.dumps(levels,ensure_ascii=False,indent=2));(p/'quick_timelines.json').write_text(json.dumps(timelines,ensure_ascii=False,indent=2));print(json.dumps({'tracks':len(assets),'quick':timelines},ensure_ascii=False))
if __name__=='__main__':main(sys.argv[1])
