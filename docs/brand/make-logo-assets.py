"""logo-mark-source.png(검정 바탕 원본, 2026-09-28 마크) → apps/web/public 의 마크·층·PWA 아이콘.

  python3 docs/brand/make-logo-assets.py

- logo-mark.png : 바탕을 걷어낸 투명 정사각형(512). 헤더·시트가 쓴다. 접힘의 검은 면(흰·주황에 둘러싸인 검정)은
  마크의 일부라 불투명 검정으로 남긴다 — 바탕만 걷는다.
- logo-m / logo-s : 가운데 골에서 가른 왼쪽 조각(검은 면 포함) · 오른쪽 조각. 로그인 인트로가 양쪽에서 모은다.
- icon-512/192/180 : 검정 바탕, 마크 폭 62% (maskable 안전 영역). 홈 화면·푸시 아이콘.
- favicon.png : 투명 96px. 브라우저 탭에는 검정 상자가 아니라 마크만 보인다.
"""
from PIL import Image, ImageDraw
import numpy as np

SRC = 'docs/brand/logo-mark-source.png'
OUT = 'apps/web/public'

img = Image.open(SRC).convert('RGB')
a = np.asarray(img).astype(float)
mx = a.max(axis=2)
alpha = np.clip(mx / 200.0, 0, 1)                              # 밝기 200 이상은 불투명, 테두리는 비례
col = np.clip(a / np.maximum(alpha[..., None], 1e-6), 0, 255)  # 테두리에 섞인 검정을 벗긴다
ink = alpha > 0.02

# 바탕 = 모서리에서 이어지는 검정. 이어지지 않는 검정은 마크 안의 면이다.
reach = Image.fromarray((ink * 255).astype(np.uint8), 'L').copy()   # fromarray 는 읽기 전용 버퍼라 floodfill 이 조용히 실패한다
ImageDraw.floodfill(reach, (0, 0), 128)
hole = np.asarray(reach) == 0
alpha_all = np.where(hole, 1.0, alpha)
col_all = col.copy(); col_all[hole] = 0

R, B = col[..., 0], col[..., 2]
orange = ink & ((R - B) > 80)
white = ink & ~orange

# 두 조각의 경계 = 위쪽 V 의 꼭짓점(흰 윗선이 가장 낮게 내려오는 열). 흰 몸통은 거기서 이어져 있으니 그 열에서 가른다.
lo, hi = int(a.shape[1] * .4), int(a.shape[1] * .6)
top = np.array([np.where(white[:, x])[0].min() if white[:, x].any() else -1 for x in range(lo, hi)])
xc = lo + int(top.argmax())
xx = np.arange(a.shape[1])[None, :]
left = (white | orange) & (xx < xc) | hole
right = (white | orange) & (xx >= xc)
print('split at column', xc)

ys, xs = np.where(ink | hole)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
w, h = x1 - x0 + 1, y1 - y0 + 1
S = int(round(max(w, h) * 1.06)); ox, oy = (S - w) // 2, (S - h) // 2

def layer(mask, name):
    out = np.zeros((S, S, 4), dtype=np.uint8)
    rgba = np.dstack([col_all, alpha_all * 255]); rgba[~mask] = 0
    out[oy:oy + h, ox:ox + w] = np.round(rgba[y0:y1 + 1, x0:x1 + 1]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').resize((512, 512), Image.LANCZOS).save(f'{OUT}/{name}.png', optimize=True)
    return out

full = layer(ink | hole, 'logo-mark'); layer(left, 'logo-m'); layer(right, 'logo-s')
mark = Image.fromarray(full, 'RGBA')
for n, px in [('icon-512', 512), ('icon-192', 192), ('icon-180', 180)]:
    canvas = Image.new('RGBA', (px, px), (0, 0, 0, 255)); m = int(px * 0.62)
    canvas.alpha_composite(mark.resize((m, m), Image.LANCZOS), ((px - m) // 2, (px - m) // 2))
    canvas.convert('RGB').save(f'{OUT}/{n}.png', optimize=True)
mark.resize((96, 96), Image.LANCZOS).save(f'{OUT}/favicon.png', optimize=True)
print('left px', int(left.sum()), 'right px', int(right.sum()), 'hole px', int(hole.sum()), 'canvas', S)
