"""남성향 그림체 LoRA 학습 본체 — Modal 컨테이너 안에서 modal_lora.py 가 부른다 (11/1). Animagine XL 4.0 위에 시란(siran / siran2) 그림체.

사진: Volume miro-image-train 의 /siran/raw/여자캐릭터-시란/*.webp, /siran/raw/여자캐릭터-시란2/*.webp (컨테이너에선 /vol/siran)
GPU 시간당 가격은 modal_lora.py 가 env GPU_PRICE_PER_HOUR 로 넘긴다(없으면 시작하지 않는다).

  python lora_train.py tag                 # WD 태거로 설명문 + 거르기 → report.json
  python lora_train.py review --port 8000  # 걸러진 사진 확인·복구 페이지
  python lora_train.py train               # 학습 → /siran/out/siran_v1.safetensors

거르기(사용자와 정한 선: 노출 의상까지, 성행위·나체·어려 보이는 외형은 학습하지 않음):
  hard = 확실한 것 — 복구 불가. soft = 애매하게 걸린 것 — 복구 페이지에서 사람이 되살릴 수 있다.
  train 은 restore.json 을 report.json 과 다시 대조해서 soft 만 받아들인다.

비용 가드: tag·train 이 돈 시간(budget.json 에 금액으로 누적)이 COST_CAP_USD 에 닿으면 학습을 끊고 종료한다.
"""
import argparse, glob, json, os, secrets, subprocess, sys, threading, time

W = os.environ.get('SIRAN_ROOT', '/vol/siran')
RAW = f'{W}/raw'
# 학습 묶음. LORA_RUN 으로 고른다(11/1 가다공 하나만 학습 추가). siran 은 예전 경로 그대로, 나머지는 경로에 이름을 붙여 서로 안 섞인다.
RUNS = {
    'siran': dict(sets={'여자캐릭터-시란': 'siran style', '여자캐릭터-시란2': 'siran2 style'}, name='siran_v1', cap=12.0, steps=2500, save=500),
    'gda': dict(sets={'가다공-P': 'gda style'}, name='gda_v1', cap=6.0, steps=2000, save=250),
    # 11/2 보강: 같은 태깅 결과(data='gda')로 dim 64 + 텍스트 인코더까지 학습
    'gda2': dict(sets={'가다공-P': 'gda style'}, name='gda_v2', cap=9.0, steps=2500, save=250, data='gda', dim=64, te=True),
    # 11/2 추가 학습: gda_v2 에서 이어서 세 그림체를 트리거로 나눠 한 파일에. 사용자 요청: 새 두 세트(FA·KDH)는 트리거를 쓰면 확실히 바뀌게 —
    # 이미 배운 가다공은 유지만(214×2≈430), FA 1196×2≈2390, KDH 340×7≈2380 으로 새 세트 비중을 키운다.
    'gda3': dict(sets={'가다공-P': 'gda style', 'FA-5176': 'fa style', 'KDH': 'kdh style'}, name='gda_v3', cap=11.0, steps=2900, save=500,
                 dim=64, te=True, repeats={'가다공-P': 2, 'FA-5176': 2, 'KDH': 7}, init='out-gda2/gda_v2.safetensors'),
    # 11/2 여성향 맛보기 — 남성향과 별개 파일(기본 모델에서 새로 시작). 위프 공개 대표 사진 17장(아이 나오는 컷 제외), 10배 반복.
    'whif': dict(sets={'여성향-whif': 'whif style'}, name='whif_v1', cap=4.0, steps=800, save=100, repeats={'여성향-whif': 10},
                 samples=['1boy, solo, adult male, mature male, short black hair, grey eyes, black shirt, indoors, upper body, looking at viewer',
                          '1boy, solo, adult male, mature male, ash blonde hair, suit, city night, smirk, upper body']),
    # 11/3 mojz 그림체(베이비챗 창작자 허락, 사용자 진술). 폭력·부상·아기 나오는 상황 번호는 받을 때 뺐다(modal_fetch_mojz.py --skip).
    # 11/5: $9 상한에 걸려 1750 에서 멈췄던 것을 사용자 요청으로 2000 까지 이어서($11 도 준비 비용에 걸려 실패 → 사용자 승인 $20 → 다시 $25).
    'mojz1': dict(sets={'mojz': 'mojz style'}, name='mojz_v1', cap=25.0, steps=2000, save=250),
    # 11/4 itim 그림체(itimg.kr/5598, 창작자 허락 — 사용자 진술). 학교·교복·폭력·강제로 보이는 컷은 EXCLUDE 태그로 학습 제외.
    'itim1': dict(sets={'itim': 'itim style'}, name='itim_v1', cap=12.0, steps=2000, save=250, exclude=True),
    # 11/4 isg 그림체(r2.dev/ISG, 창작자 허락 — 사용자 진술)·th 그림체(itimg.kr/5176/TH, 같은 허락). itim 과 같은 거르기(exclude), 각각 별개 파일. 사용자 승인 상한 각 $12.
    'isg1': dict(sets={'isg': 'isg style'}, name='isg_v1', cap=12.0, steps=2000, save=250, exclude=True),
    'th1': dict(sets={'th': 'th style'}, name='th_v1', cap=12.0, steps=2000, save=250, exclude=True),
    # 11/4 itim_v1 에서 이어서, 같은 작가 세 캐릭터(CHR·BSY·SIY) 추가. 같은 트리거. 사용자 승인 상한 $12.
    'itim2': dict(sets={'itim': 'itim style', 'itimb': 'itim style'}, name='itim_v2', cap=12.0, steps=1500, save=250, exclude=True,
                  init='out-itim1/itim_v1.safetensors'),
    # 11/5 seka 그림체(seka2.pages.dev, 창작자 허락 — 사용자 진술). 학교·교복·폭력·강제·어려 보이는 컷은 EXCLUDE 로 제외. 사용자 승인 상한 $12.
    'seka1': dict(sets={'seka': 'seka style'}, name='seka_v1', cap=12.0, steps=2000, save=250, exclude=True),
    # 11/6 srn 무협 평면 셀 채색(si-ran 미리보기, 창작자 허락 확인 안 됨 — 권리 위험 고지 후 사용자 결정). 사용자 "넉넉하게" → 상한 $25.
    # 말풍선·효과음·칸 나눈 컷은 notext 로 제외(SDXL 이 한글을 배우면 가짜 글자가 박힌다 — 글씨는 comic.py 로 얹는다).
    'srn1': dict(sets={'srn': 'srn style'}, name='srn_v1', cap=25.0, steps=2500, save=250, exclude=True, notext=True),
}
RUN = os.environ.get('LORA_RUN', 'siran')
CFG = RUNS[RUN]
SUF = '' if RUN == 'siran' else f'-{RUN}'
DSUF = '' if CFG.get('data', RUN) == 'siran' else f"-{CFG.get('data', RUN)}"   # 태깅 결과(설명문·리포트)는 data 묶음 것을 쓴다
TRAIN, OUT, CAPS = f'{W}/train{SUF}', f'{W}/out{SUF}', f'{W}/captions{DSUF}'
REPORT, RESTORE, BUDGET = f'{W}/report{DSUF}.json', f'{W}/restore{DSUF}.json', f'{W}/budget{SUF}.json'
SETS = CFG['sets']   # 폴더 → 트리거(설명문 맨 앞, keep_tokens=1)
COST_CAP_USD = CFG['cap']
STEPS, BATCH = CFG['steps'], 4
SAMPLES = [   # 저장마다 뽑는 확인용 샘플(성인·노출 없음) — 학습 데이터와 나란히 비교한다
    '1girl, solo, mature female, long hair, purple hair, yellow eyes, white sweater, black skirt, outdoors, park, smile, looking at viewer, cowboy shot',
    '1girl, solo, mature female, short hair, brown hair, glasses, white blouse, indoors, upper body, looking at viewer',
]
KOHYA = '/workspace/sd-scripts'   # Modal 이미지에 v0.9.1 로 미리 설치
BASE = ('cagliostrolab/animagine-xl-4.0', 'animagine-xl-4.0.safetensors')   # CreativeML Open RAIL++-M, 상업 이용 가능

CORE = {'sex', 'penis', 'pussy', 'nipples', 'areolae', 'nude', 'completely nude', 'topless', 'bottomless', 'cum',
        'cum in pussy', 'after sex', 'vaginal', 'anal', 'oral', 'fellatio', 'paizuri', 'handjob', 'cunnilingus',
        'masturbation', 'erection', 'testicles', 'anus', 'clitoris', 'pubic hair', 'sex toy'}
MINOR = {'loli', 'child', 'aged down', 'shota'}
SOFT_TAGS = {'censored', 'mosaic censoring', 'bar censor', 'flat chest'}
# exclude=True 묶음만: 학교·교복·폭력·강제로 보이는 컷은 학습에서 뺀다(애매하면 제외라 문턱 0.35). reason 이 'minor:' 로 시작하면 build_dataset 이 뺀다.
EXCLUDE = {'school uniform', 'serafuku', 'sailor collar', 'school', 'classroom', 'school desk', 'school bag', 'randoseru',
           'gym uniform', 'buruma', 'kindergarten uniform', 'blood', 'injury', 'bruise', 'restrained', 'bound', 'bdsm',
           'rape', 'molestation', 'crying', 'crying with eyes open', 'unconscious', 'sleeping', 'tied up', 'chained', 'gag'}

# notext=True 묶음만: 그림 안에 글씨·말풍선·칸이 있는 컷
TEXT = {'speech bubble', 'text', 'sound effects', 'comic', 'korean text', 'english text', 'chinese text', 'translated', 'spoken heart',
        'multiple views', 'inset', 'border', 'panel', '2koma', '4koma', 'title', 'logo', 'watermark', 'onomatopoeia'}


def classify(rating, probs):
    """→ ('keep'|'soft'|'hard', 이유). probs = {태그: 확률} (0.35 넘는 일반 태그)."""
    ex = rating.get('explicit', 0.0)
    hit = lambda names, t: sorted(n for n in names if probs.get(n, 0) >= t)
    if hit(MINOR, 0.35):
        return 'hard', 'minor:' + ','.join(hit(MINOR, 0.35))
    if CFG.get('exclude') and hit(EXCLUDE, 0.35):
        return 'hard', 'minor:excluded:' + ','.join(hit(EXCLUDE, 0.35))
    if CFG.get('notext') and hit(TEXT, 0.35):   # 'minor:' 로 시작해야 build_dataset 이 확실히 뺀다(복구 불가)
        return 'hard', 'minor:text:' + ','.join(hit(TEXT, 0.35))
    if ex >= 0.5:
        return 'hard', f'explicit={ex:.2f}'
    if hit(CORE, 0.5):
        return 'hard', 'tags:' + ','.join(hit(CORE, 0.5))
    if ex >= 0.3:
        return 'soft', f'explicit={ex:.2f}'
    if hit(CORE, 0.35) or hit(SOFT_TAGS, 0.35):
        return 'soft', 'tags:' + ','.join(hit(CORE, 0.35) + hit(SOFT_TAGS, 0.35))
    return 'keep', ''


# ---------- 비용 가드 ----------
class Budget:
    def __init__(self):
        price = os.environ.get('GPU_PRICE_PER_HOUR')
        if not price:
            sys.exit('GPU_PRICE_PER_HOUR 가 없다 — modal_lora.py 로 실행할 것')
        self.price = float(price)
        self.spent = json.load(open(BUDGET))['usd'] if os.path.exists(BUDGET) else 0.0   # 단계마다 GPU 단가가 달라 금액으로 누적
        self.child = None

    def check(self):
        if self.spent >= COST_CAP_USD:
            sys.exit(f'비용 상한 ${COST_CAP_USD} 도달(누적 ${self.spent:.2f}) — 시작하지 않는다')

    def watch(self):   # 30초마다 누적 저장, 상한이면 학습을 끊는다
        def loop():
            last = time.time()
            while True:
                time.sleep(30)
                now = time.time(); self.spent += (now - last) / 3600 * self.price; last = now
                json.dump({'usd': round(self.spent, 4), 'price': self.price}, open(BUDGET, 'w'))
                if self.spent >= COST_CAP_USD:
                    print(f'[guard] 비용 상한 ${COST_CAP_USD} 도달 — 중단', flush=True)
                    if self.child:
                        self.child.terminate()
                    os._exit(3)
        threading.Thread(target=loop, daemon=True).start()


# ---------- tag ----------
def tag(_):
    b = Budget(); b.check(); b.watch()
    import numpy as np, pandas as pd, onnxruntime as ort
    from PIL import Image
    from huggingface_hub import hf_hub_download
    getattr(ort, 'preload_dlls', lambda: None)()   # pip 으로 깔린 CUDA·cuDNN 을 찾게 (없으면 CPU 로 느려짐)
    repo = 'SmilingWolf/wd-eva02-large-tagger-v3'
    sess = ort.InferenceSession(hf_hub_download(repo, 'model.onnx'), providers=['CUDAExecutionProvider', 'CPUExecutionProvider'])
    print('태거 실행 장치', sess.get_providers(), flush=True)
    labels = pd.read_csv(hf_hub_download(repo, 'selected_tags.csv'))
    names, cats = [n.replace('_', ' ') for n in labels['name']], labels['category'].tolist()
    size, inp = sess.get_inputs()[0].shape[1], sess.get_inputs()[0].name

    def prep(p):
        im = Image.open(p).convert('RGBA')
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg.convert('RGB')
        s = max(im.size); sq = Image.new('RGB', (s, s), (255, 255, 255))
        sq.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
        return np.asarray(sq.resize((size, size), Image.BICUBIC), dtype=np.float32)[:, :, ::-1]

    items = [(d, os.path.basename(p)) for d in SETS for p in sorted(glob.glob(f'{RAW}/{d}/*')) if not p.endswith('.txt')]
    if not items:
        sys.exit(f'{RAW}/<폴더>/ 에 사진이 없다')
    report = {}
    for i in range(0, len(items), 32):
        batch = items[i:i + 32]
        out = sess.run(None, {inp: np.stack([prep(f'{RAW}/{d}/{n}') for d, n in batch])})[0]
        for (d, n), p in zip(batch, out):
            rating = {names[j]: float(p[j]) for j in range(len(p)) if cats[j] == 9}
            probs = {names[j]: float(p[j]) for j in np.argsort(-p) if cats[j] == 0 and p[j] > 0.35}
            status, reason = classify(rating, probs)
            key = f'{d}/{n}'
            report[key] = {'status': status, 'reason': reason, 'explicit': round(rating.get('explicit', 0), 3)}
            if not reason.startswith('minor:'):   # 학습에 들어가는 사진은 전부 설명문을 만든다(어려 보임은 학습 제외라 만들지 않음)
                os.makedirs(f'{CAPS}/{d}', exist_ok=True)
                open(f'{CAPS}/{d}/{os.path.splitext(n)[0]}.txt', 'w').write(', '.join([SETS[d]] + list(probs)))
        print(f'tag {min(i + 32, len(items))}/{len(items)}', flush=True)
    json.dump(report, open(REPORT, 'w'), ensure_ascii=False, indent=0)
    count = {s: sum(r['status'] == s for r in report.values()) for s in ('keep', 'soft', 'hard')}
    print('결과', count, f'누적 비용 ${b.spent:.2f}')


# ---------- review (복구 페이지) ----------
PAGE = '''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>걸러진 사진 복구</title><style>
body{margin:0;background:#111;color:#eee;font:14px -apple-system,sans-serif}
header{position:sticky;top:0;background:#111e;padding:10px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #222;z-index:2}
button{background:#b9a6ff;color:#111;border:0;border-radius:8px;padding:7px 14px;font-weight:600;cursor:pointer}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px;padding:12px 16px}
.c{position:relative;cursor:pointer;border-radius:6px;overflow:hidden;outline:3px solid transparent;background:#1a1a1a}
.c img{width:100%;aspect-ratio:1;object-fit:cover;display:block}.c.on{outline-color:#7ee2a8}
.c.on::after{content:"복구";position:absolute;top:5px;right:5px;background:#7ee2a8;color:#111;border-radius:6px;padding:1px 6px;font-size:12px;font-weight:700}
.c p{margin:0;padding:4px 6px;font-size:11px;color:#aaa;word-break:break-all}
</style></head><body><header><b>걸러진 사진 복구</b><span id="n"></span><button id="save">복구 저장</button>
<span style="color:#888">애매하게 걸린 사진만 보입니다(확실한 성행위·나체·어린 외형 __HARD__장은 복구 불가) · 클릭=복구 선택</span><span id="msg"></span></header>
<div class="g" id="g"></div><script>
const T=new URLSearchParams(location.search).get("token"), ITEMS=__ITEMS__; const sel=new Set(__RESTORED__);
const n=document.getElementById("n"), upd=()=>n.textContent=`${ITEMS.length}장 중 ${sel.size}장 복구 선택`;
for(const [k,why] of ITEMS){const c=document.createElement("div");c.className="c"+(sel.has(k)?" on":"");
 c.innerHTML=`<img loading="lazy" src="img/${k.split("/").map(encodeURIComponent).join("/")}?token=${T}"><p>${k}<br>${why}</p>`;
 c.onclick=()=>{sel.has(k)?sel.delete(k):sel.add(k);c.classList.toggle("on");upd()};document.getElementById("g").append(c)}
document.getElementById("save").onclick=async()=>{const r=await fetch(`restore?token=${T}`,{method:"POST",body:JSON.stringify([...sel])});
 document.getElementById("msg").textContent=r.ok?` 저장됨 (${(await r.json()).restored}장) — 다음 학습에 들어갑니다`:" 저장 실패"};upd();
</script></body></html>'''


def soft_keys():
    return {k for k, r in json.load(open(REPORT)).items() if r['status'] == 'soft'}


def review(a):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from urllib.parse import parse_qs, unquote, urlparse
    report = json.load(open(REPORT))
    soft = sorted((k, r['reason']) for k, r in report.items() if r['status'] == 'soft')
    hard = sum(r['status'] == 'hard' for r in report.values())
    token = os.environ.get('REVIEW_TOKEN') or secrets.token_urlsafe(16)

    class H(BaseHTTPRequestHandler):
        def ok(self):
            if parse_qs(urlparse(self.path).query).get('token', [''])[0] != token:
                self.send_error(401); return False
            return True

        def send(self, body, ctype):
            self.send_response(200); self.send_header('content-type', ctype); self.end_headers(); self.wfile.write(body)

        def do_GET(self):
            if not self.ok():
                return
            path = unquote(urlparse(self.path).path)
            if path == '/':
                restored = json.load(open(RESTORE)) if os.path.exists(RESTORE) else []
                self.send(PAGE.replace('__ITEMS__', json.dumps(soft, ensure_ascii=False)).replace('__HARD__', str(hard))
                          .replace('__RESTORED__', json.dumps(restored, ensure_ascii=False)).encode(), 'text/html; charset=utf-8')
            elif path.startswith('/img/') and path[5:] in dict(soft):   # soft 사진만 보여 준다
                self.send(open(f'{RAW}/{path[5:]}', 'rb').read(), 'image/webp')
            else:
                self.send_error(404)

        def do_POST(self):
            if not self.ok():
                return
            picked = json.loads(self.rfile.read(int(self.headers['content-length'])))
            allowed = sorted(set(picked) & soft_keys())   # soft 가 아닌 건 무시
            json.dump(allowed, open(RESTORE, 'w'), ensure_ascii=False)
            self.send(json.dumps({'restored': len(allowed)}).encode(), 'application/json')

    print(f'복구 페이지 포트 {a.port} (soft {len(soft)}장, hard {hard}장)', flush=True)
    ThreadingHTTPServer(('0.0.0.0', a.port), H).serve_forever()


def build_dataset():
    report = json.load(open(REPORT))
    restored = set(json.load(open(RESTORE))) & soft_keys() if os.path.exists(RESTORE) else set()
    
    # keep + hard + 복구된 soft 를 학습한다. 단 hard 중 어려 보임(minor:)으로 걸린 것은 제외
    use = [k for k, r in report.items()
           if (r['status'] in ('keep', 'hard') and not r['reason'].startswith('minor:')) or k in restored]
    
    subprocess.run(['rm', '-rf', TRAIN], check=True)
    folder = lambda d: f"{TRAIN}/{CFG.get('repeats', {}).get(d, 1)}_{SETS[d].split()[0]}"   # kohya 폴더 이름 앞 숫자 = 반복 횟수(세트 크기 맞추기)
    for d in SETS:
        os.makedirs(folder(d), exist_ok=True)

    for k in use:
        d, n = k.split('/', 1)
        stem, ext = os.path.splitext(n)
        link = f'{stem}_{ext[1:]}'   # A_1.jpg 와 A_1.webp 처럼 이름만 같고 확장자가 다른 사진이 있어 링크 이름에 확장자를 붙인다
        dst = folder(d)

        # 이미지 심볼릭 링크 생성
        os.symlink(f'{RAW}/{k}', f'{dst}/{link}{ext}')
        
        # 2. [캡션 파일 에러 방지 가드]
        # 만약 hard 이미지여서 캡션 파일이 없다면, 트리거 워드만 들어간 텍스트 파일을 실시간으로 만듭니다.
        cap_file = f'{CAPS}/{d}/{stem}.txt'
        if not os.path.exists(cap_file):
            os.makedirs(os.path.dirname(cap_file), exist_ok=True)
            with open(cap_file, 'w') as f:
                f.write(SETS[d]) # 해당 폴더의 기본 트리거 워드(예: siran style)만 입력
                
        # 캡션 파일 심볼릭 링크 생성
        os.symlink(cap_file, f'{dst}/{link}.txt')
        
    print(f'학습 사진 {len(use)}장 (복구 {len(restored)}장 포함, 제외 {len(report) - len(use)}장)', flush=True)


def train(_):
    b = Budget(); b.check(); b.watch()
    from huggingface_hub import hf_hub_download
    model = hf_hub_download(*BASE, local_dir=f'{W}/base')   # 캐시 심볼릭 링크(../../blobs/…)는 kohya 가 경로로 못 읽는다 → 실제 .safetensors 파일로
    build_dataset()
    os.makedirs(OUT, exist_ok=True)
    neg = 'lowres, bad anatomy, bad hands, worst quality, low quality, child, loli, shota, young, nsfw, nude'
    open(f'{OUT}/samples.txt', 'w').write(''.join(f'{t}, {p} --n {neg} --w 832 --h 1216 --d 7 --l 5 --s 28\n'
                                                  for t in SETS.values() for p in CFG.get('samples', SAMPLES)))
    states = sorted(glob.glob(f'{OUT}/*-state'), key=os.path.getmtime)   # 다시 돌리면 마지막 저장에서 이어서
    cmd = ['accelerate', 'launch', '--num_cpu_threads_per_process', '4', '--mixed_precision', 'bf16', 'sdxl_train_network.py',
           '--pretrained_model_name_or_path', model, '--train_data_dir', TRAIN, '--caption_extension', '.txt',
           '--resolution', '1024,1024', '--enable_bucket', '--min_bucket_reso', '512', '--max_bucket_reso', '1536',
           '--output_dir', OUT, '--output_name', CFG['name'], '--save_model_as', 'safetensors',
           '--network_module', 'networks.lora', '--network_dim', str(CFG.get('dim', 32)), '--network_alpha', str(CFG.get('dim', 32) // 2),
           *(['--text_encoder_lr', '5e-5'] if CFG.get('te') else ['--network_train_unet_only']),
           '--learning_rate', '1e-4', '--optimizer_type', 'AdamW8bit', '--lr_scheduler', 'cosine', '--lr_warmup_steps', '100',
           '--train_batch_size', str(BATCH), '--max_train_steps', str(STEPS), '--save_precision', 'fp16',
           '--no_half_vae', '--cache_latents', '--cache_latents_to_disk', '--gradient_checkpointing', '--sdpa',
           '--shuffle_caption', '--keep_tokens', '1', '--seed', '42', '--max_data_loader_n_workers', '4',
           '--save_every_n_steps', str(CFG['save']), '--save_state', '--save_last_n_steps_state', '1000',
           '--sample_every_n_steps', str(CFG['save']), '--sample_prompts', f'{OUT}/samples.txt', '--sample_sampler', 'euler_a']
    if states:
        cmd += ['--resume', states[-1]]
    elif CFG.get('init'):   # 이전 LoRA 가중치에서 이어서 학습(11/2 gda_v2 → 새 세트 추가)
        cmd += ['--network_weights', f"{W}/{CFG['init']}"]
    b.child = subprocess.Popen(cmd, cwd=KOHYA)
    code = b.child.wait()
    print(f'학습 종료 code={code}, 누적 비용 ${b.spent:.2f}, 결과 {sorted(os.listdir(OUT)) if os.path.isdir(OUT) else []}', flush=True)
    sys.exit(code)


def selftest(_):   # 거르기 규칙 확인: python lora_train.py selftest
    assert classify({'general': .9}, {'1girl': .9})[0] == 'keep'
    assert classify({'explicit': .6}, {})[0] == 'hard'
    assert classify({'explicit': .4}, {})[0] == 'soft'
    assert classify({}, {'nipples': .7})[0] == 'hard'
    assert classify({}, {'nipples': .4})[0] == 'soft'
    assert classify({}, {'bar censor': .5})[0] == 'soft'
    assert classify({}, {'loli': .36})[0] == 'hard'
    if CFG.get('exclude'):
        assert classify({}, {'school uniform': .4})[1].startswith('minor:')
    print('ok')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('selftest').set_defaults(fn=selftest)
    sub.add_parser('tag').set_defaults(fn=tag)
    r = sub.add_parser('review'); r.add_argument('--port', type=int, default=8000); r.set_defaults(fn=review)
    sub.add_parser('train').set_defaults(fn=train)
    a = ap.parse_args(); a.fn(a)
