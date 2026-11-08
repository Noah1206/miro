"""성기 가림(11/8) — 언베일 사진의 성기를 흰색으로 칠한다(국내 성인 웹툰과 같은 선, 정보통신망법 44조의7).

감지는 애니 그림 전용 모델(deepghs anime_censor_detection, dghs-imgutils)이 penis·pussy 상자를 찾는다. 유두는 가리지 않는다.
원본은 그대로 두고 <out>/<slug>/<파일> 로 가린 사본만 쓴다 + <out>/review.html(전후 비교).

  ~/.miro/censor-venv/bin/python tooling/image/censor.py                      # _upload 전체 → _censored
  ~/.miro/censor-venv/bin/python tooling/image/censor.py --only=official-m-wall-friend
  (cd ~/Desktop/miro-characters && python3 -m http.server 8090)   # 검토: localhost:8090/_censored/review.html
"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter
from imgutils.detect import detect_censors

ROOT = Path.home() / 'Desktop/miro-characters/_upload'
OUT = Path.home() / 'Desktop/miro-characters/_censored'
LABELS = {'penis', 'pussy'}
THRESHOLD = 0.3   # 놓치는 것보다 더 가리는 편이 낫다
PAD = 0.15        # 감지 상자를 사방으로 15% 넓힌다(상자가 끝까지 안 덮는 경우)
WHITE = 0.88      # 흰색 비율 — 나머지는 원본 명암이라 흰 덩어리에 입체감이 조금 남는다

_sam = None


def sam_masks(img: Image.Image, boxes):
    """상자마다 SAM(facebook/sam-vit-base)이 그 안의 물체 윤곽을 따낸다 → [H×W bool] 목록."""
    global _sam
    import torch
    from transformers import SamModel, SamProcessor
    if _sam is None:
        _sam = SamProcessor.from_pretrained('facebook/sam-vit-base'), SamModel.from_pretrained('facebook/sam-vit-base').eval()
    proc, model = _sam
    inputs = proc(img, input_boxes=[[list(map(float, b)) for b in boxes]], return_tensors='pt')
    with torch.no_grad():
        out = model(**inputs)
    masks = proc.image_processor.post_process_masks(out.pred_masks, inputs['original_sizes'], inputs['reshaped_input_sizes'])[0]
    best = out.iou_scores[0].argmax(-1)
    return [masks[i, best[i]].numpy() for i in range(len(boxes))]


def pad(box, w, h):
    x0, y0, x1, y1 = box
    px, py = (x1 - x0) * PAD, (y1 - y0) * PAD
    return max(0, x0 - px), max(0, y0 - py), min(w, x1 + px), min(h, y1 + py)


def censor(img: Image.Image, hits) -> Image.Image:
    """성인 웹툰식 — 남성기는 모양 그대로 흰색으로 칠하고, 여성기는 흰 둥근 사각형으로 덮는다."""
    import numpy as np
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    penis = [pad(b, w, h) for b, l, _ in hits if l == 'penis']
    for box, m in zip(penis, sam_masks(img, penis) if penis else []):
        x0, y0, x1, y1 = map(int, box)
        clip = np.zeros((h, w), bool)
        clip[y0:y1, x0:x1] = m[y0:y1, x0:x1]   # 상자 밖(몸 전체 등)으로 번지지 않게
        if clip.sum() < 0.15 * (x1 - x0) * (y1 - y0):   # 윤곽을 못 땄으면 타원으로
            draw.ellipse(box, fill=255)
        else:
            mask.paste(255, mask=Image.fromarray(clip.astype('uint8') * 255))
    for b, l, _ in hits:
        if l == 'pussy':
            x0, y0, x1, y1 = pad(b, w, h)
            draw.rounded_rectangle((x0, y0, x1, y1), radius=min(x1 - x0, y1 - y0) * 0.2, fill=255)
    edge = max(2, int(min(w, h) * 0.002))
    mask = mask.filter(ImageFilter.MaxFilter(edge * 2 + 1)).filter(ImageFilter.GaussianBlur(edge * 0.6))   # 윤곽선까지 덮고 가장자리만 살짝 부드럽게
    white = Image.blend(img.convert('L').convert('RGB'), Image.new('RGB', (w, h), 'white'), WHITE)
    return Image.composite(white, img, mask)


def restore(path: str):
    """--restore=<목록 파일> — 'slug/파일' 줄마다 가린 사본을 지운다. 올릴 때 사본이 없으면 원본이 그대로 쓰인다."""
    for line in Path(path).read_text(encoding='utf-8').split():
        f = OUT / line
        if f.is_file() and f.resolve().is_relative_to(OUT.resolve()):
            f.unlink()
            print('원본으로', line)


def main():
    if (r := next((a[10:] for a in sys.argv if a.startswith('--restore=')), None)):
        return restore(r)
    only =next((a[7:] for a in sys.argv if a.startswith('--only=')), None)
    rows = []
    for d in sorted(ROOT.iterdir()):
        if not d.is_dir() or (only and d.name != only) or not d.name.startswith('official-'):
            continue
        for f in sorted(d.glob('*.jpg')):
            hits = [(b, l, s) for b, l, s in detect_censors(str(f)) if l in LABELS and s >= THRESHOLD]
            if not hits:
                continue
            (OUT / d.name).mkdir(parents=True, exist_ok=True)
            img = Image.open(f).convert('RGB')
            censor(img, hits).save(OUT / d.name / f.name, quality=92)
            rows.append((d.name, f.name, ', '.join(f'{l} {s:.2f}' for _, l, s in hits)))
            print(d.name, f.name, rows[-1][2], flush=True)
    if only and (OUT / 'review.html').exists():
        return print(f'{len(rows)}장 — review.html 은 전체 실행 때만 다시 만든다')
    cells = ''.join(
        f'<figure><figcaption><label><input type="checkbox" value="{s}/{n}"> 원본으로 되돌리기</label> {s}/{n} · {why}</figcaption>'
        f'<img loading="lazy" src="../_upload/{s}/{n}"><img loading="lazy" src="{s}/{n}"></figure>'
        for s, n, why in rows)
    # 고른 목록은 아래 칸에 모인다 — 복사해서 Claude 에게 붙여 넣으면 --restore 로 되돌린다(file:// 라 저장은 브라우저에만).
    (OUT / 'review.html').write_text(
        '<!doctype html><meta charset="utf-8"><title>가림 검토</title>'
        '<style>body{background:#111;color:#ddd;font:13px sans-serif;margin:16px 16px 140px}figure{margin:0 0 24px}'
        'figure img{width:49%;margin-right:1%}label{font-weight:700;color:#ffb36b;cursor:pointer}'
        '#bar{position:fixed;left:0;right:0;bottom:0;background:#222;padding:8px 16px;display:flex;gap:8px}'
        '#out{flex:1;height:96px;background:#000;color:#ddd}</style>'
        f'<h1>가림 검토 {len(rows)}장 (왼쪽 원본 · 오른쪽 가림)</h1>{cells}'
        '<div id="bar"><textarea id="out" readonly placeholder="되돌릴 사진을 체크하면 여기에 모여요"></textarea>'
        '<button id="copy">목록 복사</button></div><script>'
        'const K="censor-restore",boxes=[...document.querySelectorAll("input[type=checkbox]")],out=document.getElementById("out");'
        'let saved=[];try{saved=JSON.parse(localStorage.getItem(K)||"[]")}catch{}'
        'boxes.forEach(b=>{b.checked=saved.includes(b.value);b.onchange=sync});'
        'function sync(){const v=boxes.filter(b=>b.checked).map(b=>b.value);out.value=v.join("\\n");try{localStorage.setItem(K,JSON.stringify(v))}catch{}}'
        'document.getElementById("copy").onclick=()=>{out.select();document.execCommand("copy")};sync()'
        '</script>', encoding='utf-8')
    print(f'{len(rows)}장 → {OUT}/review.html')


if __name__ == '__main__':
    os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')
    main()
