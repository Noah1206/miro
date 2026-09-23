"""logo-mark-source.webp(검정 바탕 원본) → apps/web/public 의 마크·층·PWA 아이콘.

  python3 docs/brand/make-logo-assets.py

- logo-mark.png : 바탕을 걷어낸 투명 정사각형(512). 헤더·시트가 쓴다.
- logo-m / logo-s / logo-d : 색으로 나눈 세 층(흰 몸통·주황 팔·주황 점). 로그인 인트로가 쓴다.
- icon-512/192/180 : 검정 바탕, 마크 폭 62% (maskable 안전 영역). 홈 화면·푸시 아이콘.
- favicon.png : 투명 96px. 브라우저 탭에는 검정 상자가 아니라 마크만 보인다.
점의 중심(캔버스 %)을 찍어 준다 — components/ui/logo.tsx 의 DOT_ORIGIN 에 넣는다.
"""
from PIL import Image
import numpy as np

SRC = 'docs/brand/logo-mark-source.webp'
OUT = 'apps/web/public'

a = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
mx = a.max(axis=2)
alpha = np.clip(mx / 200.0, 0, 1)                          # 밝기 200 이상은 불투명, 테두리는 비례
col = np.clip(a / np.maximum(alpha[..., None], 1e-6), 0, 255)  # 테두리에 섞인 검정을 벗긴다
R, B = col[..., 0], col[..., 2]
ink = alpha > 0.02
orange = ink & ((R - B) > 80)
white = ink & ~orange

ys, xs = np.where(ink)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
w, h = x1 - x0 + 1, y1 - y0 + 1
S = int(round(max(w, h) * 1.06)); ox, oy = (S - w) // 2, (S - h) // 2

# 점 = 오른쪽 아래 주황 원. 무게중심과 반지름으로 팔과 가른다.
dm = orange.copy(); dm[:700, :] = False; dm[:, :735] = False
dy, dx = np.where(dm); cx, cy = dx.mean(), dy.mean()
r = np.sqrt((dx - cx) ** 2 + (dy - cy) ** 2).max()
yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
dot = orange & (((xx - cx) ** 2 + (yy - cy) ** 2) <= (r + 2) ** 2)
stroke = orange & ~dot

def layer(mask, name):
    out = np.zeros((S, S, 4), dtype=np.uint8)
    rgba = np.dstack([col, alpha * 255]); rgba[~mask] = 0
    out[oy:oy + h, ox:ox + w] = np.round(rgba[y0:y1 + 1, x0:x1 + 1]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').resize((512, 512), Image.LANCZOS).save(f'{OUT}/{name}.png', optimize=True)
    return out

full = layer(ink, 'logo-mark'); layer(white, 'logo-m'); layer(stroke, 'logo-s'); layer(dot, 'logo-d')
mark = Image.fromarray(full, 'RGBA')
for n, px in [('icon-512', 512), ('icon-192', 192), ('icon-180', 180)]:
    canvas = Image.new('RGBA', (px, px), (0, 0, 0, 255)); m = int(px * 0.62)
    canvas.alpha_composite(mark.resize((m, m), Image.LANCZOS), ((px - m) // 2, (px - m) // 2))
    canvas.convert('RGB').save(f'{OUT}/{n}.png', optimize=True)
mark.resize((96, 96), Image.LANCZOS).save(f'{OUT}/favicon.png', optimize=True)
print('DOT_ORIGIN = %.1f%% %.1f%%' % ((cx - x0 + ox) / S * 100, (cy - y0 + oy) / S * 100))
