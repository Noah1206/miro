"""대사+신음(mixed) 클립만 모아 받아쓰기 화면을 만든다. 사용: python3 mixed_label_page.py 데이터폴더 → mixed_label.html

같은 목소리가 말도 하고 신음도 하는 예제를 만들기 위한 것. 저장하면 mixed_labels.json 이 내려받아진다.
"""
import html, json, sys
from pathlib import Path

KINDS = ['mixed', 'moan_low', 'moan_mid', 'moan_high', 'breath', 'discard']
root = Path(sys.argv[1])
labels = json.loads((root / 'labels.normalized.json').read_text())
clips = {c['clip_id']: c for c in json.loads((root / 'clips.json').read_text())}
rows = []
for l in labels:
    if l['kind'] != 'mixed': continue
    c = clips[l['clip_id']]
    opts = ''.join(f'<option{" selected" if k == "mixed" else ""}>{k}</option>' for k in KINDS)
    rows.append(f'''<tr data-id="{l['clip_id']}" data-speaker="{l['speaker']}"><td>{l['clip_id']}<br><small>{l['speaker']} · {c['duration']}s</small></td>
<td><audio controls preload="none" src="{c['audio']}"></audio></td><td><select class=kind>{opts}</select></td>
<td><input class=text value="{html.escape(l['text'])}" placeholder="예: 하아 [moaning] 거기 조금만 [moaning loudly]"></td></tr>''')
(root / 'mixed_label.html').write_text(f'''<!doctype html><meta charset=utf-8><title>대사+신음 받아쓰기</title>
<style>body{{font:14px sans-serif;margin:16px}}td{{padding:4px;border-bottom:1px solid #ddd}}input{{width:460px}}code{{background:#eee;padding:1px 4px}}</style>
<p><b>{len(rows)}개.</b> 들리는 말은 한글로 그대로, 신음 자리는 <code>[moaning]</code> (약하면 <code>[moaning softly]</code>, 세면 <code>[moaning loudly]</code>, 거친 숨은 <code>[breathing heavily]</code>).
말이 전혀 없으면 종류를 moan_* 로 바꾸고 칸은 비우세요. 다 하면 <button onclick=save()>mixed_labels.json 저장</button></p>
<table>{''.join(rows)}</table>
<script>function save(){{const out=[...document.querySelectorAll('tr[data-id]')].map(r=>({{clip_id:r.dataset.id,speaker:r.dataset.speaker,kind:r.querySelector('.kind').value,text:r.querySelector('.text').value.trim(),verified:true}}));
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{{type:'application/json'}}));a.download='mixed_labels.json';a.click()}}</script>''')
print(len(rows), 'mixed clips ->', root / 'mixed_label.html')
