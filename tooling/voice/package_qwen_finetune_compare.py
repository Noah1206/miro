"""Package immutable zero-shot vs single-epoch SFT audio for listening."""
import base64,hashlib,html,json,math,re,subprocess,sys
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from package_voxcpm2_compare import encode_mp3
p=Path(sys.argv[1]).resolve(); old=p.parent/'three-models-20261022'
m=json.loads((old/'manifest.json').read_text()); cards=[]; sounds={}; records=[]
listen=p/'listening';listen.mkdir(exist_ok=True)
for row in m['items']:
    sid=row['id']; takes=[]
    for mode,label,src in [('clone','기존 Qwen 클로닝',old/f'{sid}_qwen_clone.wav'),('finetuned','Qwen 1.7B · 1회 학습 후',p/f'{sid}_qwen_ft_epoch0.wav')]:
        y,sr=sf.read(src,always_2d=True);y=y.mean(axis=1)
        if not len(y) or not np.isfinite(y).all() or np.max(np.abs(y))<1e-5:raise ValueError(src)
        probe=subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-i',str(src),'-af','loudnorm=I=-23:TP=-1:LRA=50:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
        loud=float(json.loads(re.findall(r'\{[^{}]+"input_i"[^{}]+\}',probe.stderr)[-1])['input_i'])
        gain=min(-23-loud,-1-20*np.log10(np.max(np.abs(y))));y*=10**(gain/20)
        if sr!=48000:
            gcd=math.gcd(sr,48000);y=resample_poly(y,48000//gcd,sr//gcd)
        wav=listen/f'{sid}_{mode}.wav';sf.write(wav,y,48000,subtype='PCM_16');encode_mp3(wav,wav.with_suffix('.mp3'))
        sounds[(sid,mode)]=y
        uri='data:audio/mpeg;base64,'+base64.b64encode(wav.with_suffix('.mp3').read_bytes()).decode()
        takes.append(f'<div class="take"><b>{label}</b><audio controls preload="metadata" data-label="{label}" src="{uri}"></audio></div>')
        records.append({'id':sid,'mode':mode,'source':str(src),'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'input_lufs':loud,'constant_gain_db':float(gain),'duration_seconds':len(y)/48000})
    cards.append('<section><small>'+html.escape(row['emotion'])+'</small><h2>'+html.escape(row['text'])+'</h2><button class="pair">기존 → 학습 후 연속 듣기</button><p class="playing"></p>'+''.join(takes)+'</section>')
selected=['D-H3-A-007-0787','D-S3-A-007-0796','D-A3-A-007-0840'];chunks=[];timeline=[];elapsed=0
for sid in selected:
    for mode in ['clone','finetuned']:
        y=sounds[(sid,mode)];timeline.append({'start_seconds':round(elapsed,2),'id':sid,'mode':mode});chunks.extend([y,np.zeros(48000)]);elapsed+=len(y)/48000+1
quick=p/'quick_existing_then_finetuned.wav';sf.write(quick,np.concatenate(chunks),48000,subtype='PCM_16');encode_mp3(quick,quick.with_suffix('.mp3'))
page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>미로 · Qwen 학습 전후 비교</title><style>body{background:#f6f5f0;color:#252923;font:16px/1.6 system-ui;margin:0}main{max-width:860px;margin:40px auto;padding:0 20px}h1{font-size:30px}h2{font-size:19px}section{background:white;border:1px solid #ddd;border-radius:15px;padding:24px;margin:20px 0}.take{display:grid;grid-template-columns:230px 1fr;align-items:center;margin:14px 0;gap:12px}audio{width:100%}button{background:#35462c;color:white;border:0;border-radius:8px;padding:12px;cursor:pointer}.note,small{color:#60675c}.playing{min-height:24px;font-size:14px}@media(max-width:600px){.take{grid-template-columns:1fr}section{padding:18px}}</style><main><small>MIRO · 2026.10.23 · 007번 여성 성우</small><h1>Qwen, 학습 전후 같은 대사</h1><p>각 문장을 <b>기존 클로닝 → 파인튜닝 후</b> 순서로 들어보세요.</p><p class="note">590문장·약 48분으로 1회 학습했습니다. 아래 6문장은 학습에서 제외했습니다. 기존 클로닝 파일은 그대로 재사용합니다. 재생용 파일은 음량 배율만 맞췄으며 속도·피치·쉼은 수정하지 않았습니다.</p><p class="note">기존 결과는 감정별 참조 녹음을 사용한 제로샷 클로닝이고, 학습 후는 고정 성우 모델입니다. 이번 학습에는 별도 감정 지시 기능을 추가하지 않았으므로 학습만의 효과를 완전히 분리한 실험은 아닙니다. 실제로 어느 쪽이 더 자연스러운지 판단하기 위한 비교입니다.</p>'''+''.join(cards)+'''</main><script>let active=[],index=0;const all=[...document.querySelectorAll('audio')];function stop(){active=[];all.forEach(a=>{a.onended=null;a.pause();a.currentTime=0});document.querySelectorAll('.playing').forEach(p=>p.textContent='')}all.forEach(a=>a.addEventListener('play',()=>all.forEach(b=>{if(a!==b)b.pause()})));document.querySelectorAll('.pair').forEach(b=>b.onclick=()=>{stop();active=[...b.closest('section').querySelectorAll('audio')];index=0;next()});function next(){const a=active[index++];if(!a)return;const p=a.closest('section').querySelector('.playing');p.textContent='재생 중: '+a.dataset.label;a.onended=()=>{p.textContent='';setTimeout(next,700)};a.play().catch(()=>p.textContent='재생 버튼을 눌러 주세요.')} </script></html>'''
(p/'compare.html').write_text(page)
(p/'listening_levels.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
(p/'quick_timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2))
print(json.dumps({'tracks':len(records),'quick_seconds':round(elapsed,2),'timeline':timeline},ensure_ascii=False))
