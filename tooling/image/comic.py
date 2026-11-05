"""만화 글씨 얹기 (11/6) — 글씨 없이 만든 그림 위에 말풍선·효과음·작은 글씨·놀람선·제목 로고, 칸 나누기·확대 창.

  tooling/image/.venv/bin/python tooling/image/comic.py spec.json        # → spec 의 out (없으면 spec 옆 .png)

spec.json:
  {"panels": ["a.png", "b.png"], "layout": "h2",            # 1(한 장) | h2(좌우 2칸) | v2(위아래 2칸)
   "layers": [{"type": "bubble", "text": "좋다아..♥", "x": 70, "y": 18, "size": 40, "tail": [62, 30]}, ...],
   "out": "result.png"}
좌표 x·y·tail 은 완성 그림의 % (0~100), size 는 1024px 그림 기준 글자 크기(그림이 크면 비례해서 커짐).
type: bubble(말풍선) shout(뾰족 말풍선) sfx(효과음) small(작은 글씨) marks(놀람선) title(제목) inset(확대 창: src·w·h 필요)
공통 선택: angle(기울기, 도) color(글자색) vertical(true면 세로 쓰기) sub(title 의 한자 부제)
폰트는 fonts/ (Google Fonts, OFL) — ♥ 와 한자는 맥 시스템 폰트로 대신 그린다.
"""
import json, math, random, sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
FONT = {k: str(HERE / 'fonts' / v) for k, v in {
    'bubble': 'GamjaFlower-Regular.ttf', 'shout': 'Jua-Regular.ttf', 'sfx': 'Jua-Regular.ttf',
    'small': 'NanumPenScript-Regular.ttf', 'title': 'EastSeaDokdo-Regular.ttf'}.items()}
HEART_FONT = '/System/Library/Fonts/Supplemental/AppleGothic.ttf'
HANJA_FONT = '/System/Library/Fonts/Supplemental/AppleMyungjo.ttf'


def fallback(ch, path):
    # ponytail: 빠지는 글자를 cmap 으로 찾지 않고 ♥·한자만 정해서 돌린다 — 다른 기호가 네모로 나오면 여기에 추가
    if ch in '♥♡❤':
        return HEART_FONT
    if 0x4E00 <= ord(ch) <= 0x9FFF:
        return HANJA_FONT
    return path


TIGHT = {'.': .5, ',': .7, '!': .8, '?': .9, ' ': .8}   # 손글씨 폰트의 문장부호 칸이 넓어 벌어져 보이는 것을 줄인다


def text_img(text, path, size, fill, stroke=0, stroke_fill='white', vertical=False, jitter=0.0, fill2=None, align='center'):
    """글자를 한 글자씩(대체 폰트 포함) 그린 투명 그림.
    jitter: 글자마다 크기·기울기·높이를 조금씩 흔들어 손으로 쓴 느낌(0=반듯, 1=많이). 같은 글이면 늘 같은 모양.
    fill2: 있으면 위 fill → 아래 fill2 그라데이션. 외곽선은 따로 모아 글자 밑에 깔아 이웃 글자를 덮지 않게."""
    text = text.replace('…', '..')   # 손글씨 폰트 여럿에 말줄임표 글자가 없다
    if vertical:
        text = '\n'.join(c for c in text.replace('\n', '') if c != ' ')
    rnd = random.Random(text)
    fonts = {}
    font = lambda c: fonts.setdefault(fallback(c, path), ImageFont.truetype(fallback(c, path), size))
    lines = text.split('\n')
    line_h = int(size * (1.0 if vertical else 1.25))
    adv = lambda c: font(c).getlength(c) * TIGHT.get(c, 1)
    widths = [sum(adv(c) for c in ln) for ln in lines]
    pad = stroke + size // 2
    W, H = int(max(widths)) + pad * 2, line_h * len(lines) + pad * 2
    mask, edge = Image.new('L', (W, H)), Image.new('L', (W, H))
    g = size // 2 + stroke
    for i, ln in enumerate(lines):
        x = pad + (0 if align == 'left' else (max(widths) - widths[i]) / 2)
        for c in ln:
            f, full = font(c), font(c).getlength(c)
            cw, ch = int(full) + 2 * g, int(size * 1.3) + 2 * g   # 글자 칸 가운데 = 글자 가운데
            m, e = Image.new('L', (cw, ch)), Image.new('L', (cw, ch))
            ImageDraw.Draw(m).text((g, g), c, font=f, fill=255)
            if stroke:
                ImageDraw.Draw(e).text((g, g), c, font=f, fill=255, stroke_width=stroke, stroke_fill=255)
            s = 1 + rnd.uniform(-1, 1) * jitter * 0.12
            rot, dy = rnd.uniform(-1, 1) * jitter * 9, rnd.uniform(-1, 1) * jitter * size * 0.08
            m, e = [im.resize((max(1, int(cw * s)), max(1, int(ch * s))), Image.BICUBIC).rotate(rot, resample=Image.BICUBIC) for im in (m, e)]
            xy = (int(x + full / 2 - m.width / 2), int(pad + i * line_h + size * 0.65 + dy - m.height / 2))
            mask.paste(m, xy, m)
            edge.paste(e, xy, e)
            x += adv(c)
    out = Image.new('RGBA', (W, H))
    if stroke:
        out.paste(Image.new('RGBA', (W, H), stroke_fill), mask=edge)
    face = Image.new('RGBA', (W, H), fill)
    if fill2:
        box = mask.getbbox() or (0, 0, W, H)
        grad = Image.linear_gradient('L').resize((W, max(1, box[3] - box[1])))
        ramp = Image.new('L', (W, H), 255)
        ramp.paste(grad, (0, box[1]))
        face = Image.composite(Image.new('RGBA', (W, H), fill2), face, ramp)
    out.paste(face, mask=mask)
    return out.crop(out.getbbox() or (0, 0, 1, 1))


def paste(canvas, layer, cx, cy, angle=0):
    if angle:
        layer = layer.rotate(angle, expand=True, resample=Image.BICUBIC)
    canvas.alpha_composite(layer, (int(cx - layer.width / 2), int(cy - layer.height / 2)))


def bezier(p0, c, p1, n=14):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1])
            for t in (i / n for i in range(n + 1))]


def bubble(canvas, L, k, cx, cy):
    shout = L['type'] == 'shout'
    size = k(L.get('size', 40))
    font = str(HERE / 'fonts' / L['font']) if L.get('font') else FONT[L['type']]
    t = text_img(L['text'], font, size, L.get('color', 'black'), jitter=L.get('jitter', 0.5),
                 stroke=max(1, size // 30), stroke_fill=L.get('color', 'black'))   # 같은 색 얇은 외곽선 = 펜을 눌러 쓴 굵기
    rx, ry = t.width * (0.85 if shout else 0.68) + k(16), t.height * (0.85 if shout else 0.72) + k(14)
    line = max(1, k(L.get('line', 3)))
    rnd = random.Random(L['text'])
    layer = Image.new('RGBA', canvas.size)
    d = ImageDraw.Draw(layer)
    if 'tail' in L:   # 꼬리: 풍선 가운데에서 tail 지점까지 한쪽으로 살짝 휜 뾰족한 꼬리
        tx, ty = pct(L['tail'][0], canvas.width), pct(L['tail'][1], canvas.height)
        a = math.atan2(ty - cy, tx - cx) + math.pi / 2
        base = min(rx, ry) * 0.32
        b1 = (cx + base * math.cos(a), cy + base * math.sin(a))
        b2 = (cx - base * math.cos(a), cy - base * math.sin(a))
        bend = math.hypot(tx - cx, ty - cy) * 0.18
        mid = ((cx + tx) / 2 + bend * math.cos(a), (cy + ty) / 2 + bend * math.sin(a))
        d.polygon(bezier(b1, mid, (tx, ty)) + bezier((tx, ty), mid, b2)[1:], fill='white', outline='black', width=line)
    if shout:   # 외침: 가시 길이를 조금씩 다르게 한 별 모양
        n = 20
        pts = [(cx + rx * (rnd.uniform(1.12, 1.3) if i % 2 else 0.92) * math.cos(math.pi * i / n),
                cy + ry * (rnd.uniform(1.15, 1.38) if i % 2 else 0.92) * math.sin(math.pi * i / n)) for i in range(2 * n)]
        d.polygon(pts, fill='white', outline='black', width=line)
    else:   # 손으로 그린 듯 살짝 찌그러진 타원
        p1, p2 = rnd.uniform(0, 6.3), rnd.uniform(0, 6.3)
        wob = lambda th: 1 + 0.035 * math.sin(3 * th + p1) + 0.02 * math.sin(5 * th + p2)
        ring = lambda ex: [(cx + (rx + ex) * wob(th) * math.cos(th), cy + (ry + ex) * wob(th) * math.sin(th))
                           for th in (2 * math.pi * i / 90 for i in range(90))]
        d.polygon(ring(line), fill='black')
        d.polygon(ring(0), fill='white')
    canvas.alpha_composite(layer)
    paste(canvas, t, cx, cy)


def sfx(canvas, L, k, cx, cy):
    size = k(L.get('size', 90))
    color = L.get('color', '#ff6fae')
    t = text_img(L['text'], FONT['sfx'], size, color, stroke=max(3, size // 8), vertical=L.get('vertical', False),
                 jitter=L.get('jitter', 1.0), fill2=L.get('color2', '#c2185b' if color == '#ff6fae' else None))
    shadow = Image.new('RGBA', t.size, (0, 0, 0, 0))   # 흰 외곽선이 밝은 배경에 묻히지 않게 아주 옅은 그림자
    shadow.putalpha(t.getchannel('A').point(lambda v: v * 0.35).filter(ImageFilter.GaussianBlur(size / 25)))
    paste(canvas, shadow, cx + size / 30, cy + size / 30, L.get('angle', 12))
    paste(canvas, t, cx, cy, L.get('angle', 12))


def small(canvas, L, k, cx, cy):
    size = k(L.get('size', 52))
    t = text_img(L['text'], FONT['small'], size, L.get('color', '#c2185b'), stroke=L.get('stroke', max(2, size // 10)), vertical=L.get('vertical', False),
                 jitter=L.get('jitter', 0.8), align=L.get('align', 'center'))
    paste(canvas, t, cx, cy, L.get('angle', 0))


def marks(canvas, L, k, cx, cy):
    """놀람선: 머리 위에 부채꼴로 짧은 선 몇 개."""
    d = ImageDraw.Draw(canvas)
    r, n = k(L.get('size', 40)), int(L.get('count', 5))
    for i in range(n):
        a = math.radians(-90 + (i - (n - 1) / 2) * 22 + L.get('angle', 0))
        p1 = (cx + r * 0.6 * math.cos(a), cy + r * 0.6 * math.sin(a))
        p2 = (cx + r * (1.25 if i % 2 else 1.05) * math.cos(a), cy + r * (1.25 if i % 2 else 1.05) * math.sin(a))
        d.line([p1, p2], fill=L.get('color', '#2b2b2b'), width=max(2, k(4)))


def heart_poly(cx, cy, r, rot=0.0):
    pts = []
    for i in range(40):
        t = 2 * math.pi * i / 40
        x, y = 16 * math.sin(t) ** 3, -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        x, y = x * math.cos(rot) - y * math.sin(rot), x * math.sin(rot) + y * math.cos(rot)
        pts.append((cx + x * r / 16, cy + y * r / 16))
    return pts


def hearts(canvas, L, k, cx, cy):
    """작은 하트 무리(FA 원본처럼 머리 주변에 흩뿌림): 흰 테두리 + 분홍."""
    rnd = random.Random(f"{L['x']},{L['y']}")
    d = ImageDraw.Draw(canvas)
    spread, size = k(L.get('spread', 70)), k(L.get('size', 16))
    for _ in range(int(L.get('count', 6))):
        x, y = cx + rnd.uniform(-1, 1) * spread, cy + rnd.uniform(-0.6, 0.6) * spread
        r, rot = size * rnd.uniform(0.6, 1.3), rnd.uniform(-0.5, 0.5)
        d.polygon(heart_poly(x, y, r + max(1, k(2.5)), rot), fill='white')
        d.polygon(heart_poly(x, y, r, rot), fill=L.get('color', '#ff4f8b'))


def shake(canvas, L, k, cx, cy):
    """떨림선: 몸 가장자리에 짧은 두 줄씩(〃) 몇 군데 — angle 방향으로 늘어놓는다."""
    rnd = random.Random(f"{L['x']},{L['y']}")
    d = ImageDraw.Draw(canvas)
    n, gap, ln = int(L.get('count', 3)), k(L.get('size', 26)), k(L.get('size', 26)) * 0.55
    a = math.radians(L.get('angle', 90))   # 늘어놓는 방향(90 = 세로)
    w = max(2, k(2.5))
    for i in range(n):
        bx, by = cx + math.cos(a) * gap * (i - (n - 1) / 2), cy + math.sin(a) * gap * (i - (n - 1) / 2)
        tilt = math.radians(L.get('tilt', 20)) + rnd.uniform(-0.2, 0.2)
        for off in (-w * 1.4, w * 1.4):
            ox, oy = math.cos(a) * off, math.sin(a) * off
            d.line([(bx + ox - math.cos(tilt) * ln / 2, by + oy - math.sin(tilt) * ln / 2),
                    (bx + ox + math.cos(tilt) * ln / 2, by + oy + math.sin(tilt) * ln / 2)], fill=L.get('color', '#3a3a3a'), width=w)


def title(canvas, L, k, cx, cy):
    """제목 로고: 붓글씨 + 빛 번짐 + 진한 외곽선, 아래에 한자 부제."""
    size, glow = k(L.get('size', 150)), L.get('glow', '#a24bff')
    font = str(HERE / 'fonts' / L['font']) if L.get('font') else FONT['title']
    parts = [(L['text'], font, size)] + ([(L['sub'], HANJA_FONT, size // 3)] if L.get('sub') else [])
    imgs = [(text_img(text, path, sz, L.get('color', 'white'), stroke=max(3, sz // 14), stroke_fill=L.get('edge', '#2a0b45'), jitter=0.3,
                      fill2=L.get('color2')), sz) for text, path, sz in parts]
    if L.get('plate'):   # 레퍼런스 표지 로고처럼: 모서리를 깎은 어두운 판 + 금테 두 줄
        bw = max(t.width for t, _ in imgs) + size * 0.9
        bh = sum(t.height * 0.75 + sz * 0.15 for t, sz in imgs) + size * 0.5
        top, cut = cy - imgs[0][0].height / 2 - size * 0.25, size * 0.35
        x0, x1, y1 = cx - bw / 2, cx + bw / 2, top + bh
        shape = lambda e: [(x0 - e + cut, top - e), (x1 + e - cut, top - e), (x1 + e, top + bh / 2), (x1 + e - cut, y1 + e),
                           (x0 - e + cut, y1 + e), (x0 - e, top + bh / 2)]
        plate = Image.new('RGBA', canvas.size)
        d = ImageDraw.Draw(plate)
        d.polygon(shape(0), fill=(12, 6, 6, 215))
        gold = L.get('trim', '#d9a441')
        d.polygon(shape(k(6)), outline=gold, width=max(2, k(4)))
        d.polygon(shape(-k(7)), outline=gold, width=max(1, k(2)))
        canvas.alpha_composite(plate)
    y = cy
    for t, sz in imgs:
        m = sz // 2   # 빛이 퍼질 여백 — 없으면 글자 상자 모양으로 잘린 네모가 된다
        mask = Image.new('L', (t.width + 2 * m, t.height + 2 * m))
        mask.paste(t.getchannel('A'), (m, m))
        halo = Image.new('RGBA', mask.size, glow)
        halo.putalpha(mask.filter(ImageFilter.GaussianBlur(sz / 6)))
        for _ in range(2):
            paste(canvas, halo, cx, y, L.get('angle', 0))
        paste(canvas, t, cx, y, L.get('angle', 0))
        y += t.height * 0.75 + sz * 0.15


def inset(canvas, L, k, cx, cy):
    """확대 창: src 그림을 창 비율로 가운데 잘라 흰 테두리와 함께 붙인다. w·h 는 % ."""
    w, h = pct(L.get('w', 28), canvas.width), pct(L.get('h', 28), canvas.height)
    src = fit(Image.open(L['src']).convert('RGBA'), int(w), int(h), L.get('focus'), L.get('zoom', 2.5 if L.get('focus') else 1))
    border = max(4, k(7))
    framed = Image.new('RGBA', (src.width + border * 2, src.height + border * 2), 'white')
    ImageDraw.Draw(framed).rectangle([0, 0, framed.width - 1, framed.height - 1], outline='black', width=max(1, k(2)))
    framed.paste(src, (border, border))
    paste(canvas, framed, cx, cy, L.get('angle', 0))


DRAW = {'bubble': bubble, 'shout': bubble, 'sfx': sfx, 'small': small, 'marks': marks, 'title': title, 'inset': inset,
        'hearts': hearts, 'shake': shake}


def pct(v, total):
    return float(v) / 100 * total


def fit(img, w, h, focus=None, zoom=1.0):
    """w×h 비율로 잘라 맞춘다. focus=[x%, y%] 면 그 지점을 중심으로, zoom 배로 더 키워서(확대 창에서 얼굴만 따올 때)."""
    scale = max(w / img.width, h / img.height) * zoom
    img = img.resize((max(w, round(img.width * scale)), max(h, round(img.height * scale))), Image.LANCZOS)
    fx, fy = (pct(focus[0], img.width), pct(focus[1], img.height)) if focus else (img.width / 2, img.height / 2)
    x = int(min(max(fx - w / 2, 0), img.width - w))
    y = int(min(max(fy - h / 2, 0), img.height - h))
    return img.crop((x, y, x + w, y + h))


def compose(paths, layout='1', gutter=14):
    first = Image.open(paths[0]).convert('RGBA')
    W, H = first.size
    if layout == '1' or len(paths) < 2:
        return first
    canvas = Image.new('RGBA', (W, H), 'white')
    if layout == 'h2':
        pw, ph, spots = (W - gutter * 3) // 2, H - gutter * 2, [(gutter, gutter), ((W + gutter) // 2, gutter)]
    else:
        pw, ph, spots = W - gutter * 2, (H - gutter * 3) // 2, [(gutter, gutter), (gutter, (H + gutter) // 2)]
    for p, xy in zip(paths, spots):
        canvas.paste(fit(Image.open(p).convert('RGBA'), pw, ph), xy)
    return canvas


def render(panels, layout='1', layers=(), ratio=None, focus=None):
    canvas = compose(panels, layout)
    if ratio:   # 앱 카드 비율(예: [4, 5])로 먼저 자른다 — 글씨 좌표는 자른 뒤 그림 기준
        w = canvas.width
        canvas = fit(canvas, w, round(w * ratio[1] / ratio[0]), focus)
    k = lambda v: max(1, round(float(v) * canvas.width / 1024))
    for L in layers:
        DRAW[L['type']](canvas, L, k, pct(L['x'], canvas.width), pct(L['y'], canvas.height))
    return canvas.convert('RGB')


if __name__ == '__main__':
    spec_path = Path(sys.argv[1])
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    base = spec_path.parent
    rel = lambda p: str(p if Path(p).is_absolute() else base / p)
    panels = [rel(p) for p in spec['panels']]
    layers = [{**L, 'src': rel(L['src'])} if 'src' in L else L for L in spec.get('layers', [])]
    out = Path(rel(spec.get('out', spec_path.with_suffix('.png').name)))
    render(panels, spec.get('layout', '1'), layers, spec.get('ratio'), spec.get('focus')).save(out)
    print(out)
