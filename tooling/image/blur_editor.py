"""손으로 블러 칠하기(11/8) — 목록의 사진을 하나씩 열어 드래그한 곳만 투명 블러(색은 보이고 세부만 뭉갬)를 칠하고 저장한다.

원본은 ~/Desktop/miro-characters/_upload/<slug>/<파일>(가린 뒤 바뀐 건 _upload_orig 의 원본)에서 읽고,
저장하면 _censored/<slug>/<파일> 에 쓴다 → apps/web/scripts/upload-censored.mts 로 운영에 올린다.

  python3 tooling/image/blur_editor.py [목록 파일] [--port 8000]     # → http://localhost:8000
목록 파일: 'slug/파일' 한 줄씩(기본 _censored/blur-list.txt).
"""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

BASE = Path.home() / 'Desktop/miro-characters'
OUT = BASE / '_censored'
ap = argparse.ArgumentParser()
ap.add_argument('list', nargs='?', default=str(OUT / 'blur-list.txt'))
ap.add_argument('--port', type=int, default=8000)
a = ap.parse_args()
ITEMS = [l for l in Path(a.list).read_text(encoding='utf-8').split() if l.count('/') == 1]


def original(item: str) -> Path:
    o = BASE / '_upload_orig' / item
    return o if o.exists() else BASE / '_upload' / item


def safe(item: str) -> bool:
    return item in ITEMS   # 목록 밖 경로는 읽지도 쓰지도 않는다


PAGE = r'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>블러 칠하기</title>
<style>
body{margin:0;background:#111;color:#ddd;font:13px sans-serif;display:flex;height:100vh}
#side{width:240px;overflow:auto;border-right:1px solid #333;padding:8px;flex:none}
#side div{padding:4px 6px;cursor:pointer;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#side div.on{background:#333}#side div.done::before{content:"✓ ";color:#7c7}
#main{flex:1;display:flex;flex-direction:column;min-width:0}
#bar{display:flex;gap:10px;align-items:center;padding:8px;border-bottom:1px solid #333;flex-wrap:wrap}
#wrap{flex:1;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:8px}
canvas{max-height:calc(100vh - 70px);max-width:100%;cursor:crosshair;touch-action:none}
button{background:#333;color:#ddd;border:1px solid #555;border-radius:4px;padding:5px 10px;cursor:pointer}
button.primary{background:#e8762c;border-color:#e8762c;color:#fff}#msg{color:#7c7}
</style>
<div id="side"></div>
<div id="main"><div id="bar">
<b id="name"></b>
<label>붓 <input id="size" type="range" min="10" max="300" value="80"></label>
<label>블러 세기 <input id="strength" type="range" min="4" max="60" value="18"></label>
<label><input id="orig" type="checkbox"> 원본 보기</label>
<button id="undo">되돌리기 (Z)</button><button id="reset">처음부터</button>
<button id="prev">◀ (A)</button><button id="next">▶ (D)</button>
<button id="save" class="primary">저장 (S)</button><span id="msg"></span>
</div><div id="wrap"><canvas id="c"></canvas></div></div>
<script>
const $=id=>document.getElementById(id), c=$('c'), ctx=c.getContext('2d')
let items=[], done=new Set(), cur=0, img=null, blurred=null, history=[], drawing=false, last=null, dirty=false
async function load(){const r=await (await fetch('/api/list')).json();items=r.items;done=new Set(r.done);side();open(0)}
function side(){$('side').innerHTML='';items.forEach((it,i)=>{const d=document.createElement('div');d.textContent=it;d.title=it
 d.className=(i===cur?'on ':'')+(done.has(it)?'done':'');d.onclick=()=>open(i);$('side').appendChild(d)})}
function open(i){if(dirty&&!confirm('저장 안 한 칠이 있어요. 넘어갈까요?'))return;cur=(i+items.length)%items.length;dirty=false;$('msg').textContent=''
 const it=items[cur];$('name').textContent=it;side();img=new Image();img.onload=()=>{c.width=img.naturalWidth;c.height=img.naturalHeight
 // 이미 저장한 사진은 저장본에서 이어서 칠한다
 ctx.drawImage(img,0,0);makeBlur();history=[]};img.src=(done.has(it)?'/saved/':'/orig/')+encodeURIComponent(it)+'?t='+Date.now()}
function makeBlur(){// 줄였다 키우면 색은 남고 세부만 뭉개진다(모든 브라우저에서 같은 결과)
 const s=+$('strength').value, w=Math.max(1,Math.round(c.width/s)), h=Math.max(1,Math.round(c.height/s))
 const small=document.createElement('canvas');small.width=w;small.height=h;const sc=small.getContext('2d');sc.imageSmoothingQuality='high'
 const src=document.createElement('canvas');src.width=c.width;src.height=c.height;src.getContext('2d').drawImage(img,0,0)
 sc.drawImage(src,0,0,w,h);blurred=document.createElement('canvas');blurred.width=c.width;blurred.height=c.height
 const bc=blurred.getContext('2d');bc.imageSmoothingQuality='high';bc.drawImage(small,0,0,c.width,c.height)}
function pt(e){const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height}}
function dab(p){ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,+$('size').value*c.width/1000,0,Math.PI*2);ctx.clip();ctx.drawImage(blurred,0,0);ctx.restore()}
function stroke(a,b){const step=Math.max(1,+$('size').value*c.width/4000),d=Math.hypot(b.x-a.x,b.y-a.y)
 for(let t=0;t<=d;t+=step)dab({x:a.x+(b.x-a.x)*t/d||a.x,y:a.y+(b.y-a.y)*t/d||a.y});dab(b)}
c.onpointerdown=e=>{if($('orig').checked)return;c.setPointerCapture(e.pointerId);history.push(ctx.getImageData(0,0,c.width,c.height));if(history.length>20)history.shift()
 drawing=true;last=pt(e);dab(last);dirty=true}
c.onpointermove=e=>{if(!drawing)return;const p=pt(e);stroke(last,p);last=p}
c.onpointerup=c.onpointercancel=()=>drawing=false
let shown=null
$('orig').onchange=()=>{if($('orig').checked){shown=ctx.getImageData(0,0,c.width,c.height);ctx.drawImage(img,0,0)}else if(shown)ctx.putImageData(shown,0,0)}
$('strength').onchange=makeBlur
$('undo').onclick=()=>{const h=history.pop();if(h)ctx.putImageData(h,0,0)}
$('reset').onclick=async()=>{if(!confirm('원본으로 처음부터 할까요?'))return;const o=new Image();o.onload=()=>{img=o;ctx.drawImage(o,0,0);makeBlur();history=[];dirty=true};o.src='/orig/'+encodeURIComponent(items[cur])}
$('prev').onclick=()=>open(cur-1);$('next').onclick=()=>open(cur+1)
$('save').onclick=()=>{if($('orig').checked){$('orig').checked=false;$('orig').onchange()}
 c.toBlob(async b=>{const r=await fetch('/api/save?item='+encodeURIComponent(items[cur]),{method:'POST',body:b})
 if(r.ok){done.add(items[cur]);dirty=false;$('msg').textContent='저장했어요';side()}else $('msg').textContent='저장 실패 '+r.status},'image/jpeg',0.92)}
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'&&e.target.type!=='checkbox'&&e.target.type!=='range')return
 const k=e.key.toLowerCase();if(k==='z')$('undo').click();else if(k==='a')$('prev').click();else if(k==='d')$('next').click();else if(k==='s'){e.preventDefault();$('save').click()}})
load()
</script>'''


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body=b'', ctype='text/plain; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/':
            return self.send(200, PAGE.encode(), 'text/html; charset=utf-8')
        if u.path == '/api/list':
            done = [i for i in ITEMS if (OUT / i).exists()]
            return self.send(200, json.dumps({'items': ITEMS, 'done': done}).encode(), 'application/json')
        for prefix, fn in (('/orig/', original), ('/saved/', lambda i: OUT / i)):
            if u.path.startswith(prefix):
                item = unquote(u.path[len(prefix):])
                f = fn(item) if safe(item) else None
                return self.send(200, f.read_bytes(), 'image/jpeg') if f and f.exists() else self.send(404)
        self.send(404)

    def do_POST(self):
        u = urlparse(self.path)
        item = unquote(u.query.removeprefix('item='))
        if u.path != '/api/save' or not safe(item):
            return self.send(400)
        data = self.rfile.read(int(self.headers['Content-Length']))
        (OUT / item).parent.mkdir(parents=True, exist_ok=True)
        (OUT / item).write_bytes(data)
        print('저장', item, flush=True)
        self.send(200, b'ok')


print(f'{len(ITEMS)}장 · http://localhost:{a.port}', flush=True)
ThreadingHTTPServer(('127.0.0.1', a.port), H).serve_forever()
