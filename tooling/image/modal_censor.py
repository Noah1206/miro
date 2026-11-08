"""채팅 사진 가림 서버(11/8) — 앱이 만든 언베일 사진을 받아 성기 부위만 투명 블러(색은 보이고 세부만 뭉갬)로 덮어 돌려준다.

감지는 tooling/image/censor.py 와 같은 애니 전용 모델(dghs-imgutils detect_censors, penis·pussy). CPU 로 충분하다.
그림 서버(modal_lora_test.py)와 따로 둔다 — 앱(lib/ai/censor.ts)이 그림을 받은 뒤 여기를 거친다.

  modal deploy tooling/image/modal_censor.py
  → 주소를 Vercel env MIRO_CENSOR_URL 에(키는 그림 서버와 같은 MIRO_IMAGE_SECRET).
"""
import modal

app = modal.App('miro-censor')


def warm():
    from PIL import Image
    from imgutils.detect import detect_censors
    detect_censors(Image.new('RGB', (64, 64)))   # 감지 모델을 이미지에 미리 받아 둔다(첫 요청이 느리지 않게)


image = (modal.Image.debian_slim(python_version='3.11')
         .apt_install('libgl1', 'libglib2.0-0')   # imgutils 가 opencv 를 불러온다
         .pip_install('dghs-imgutils', 'onnxruntime', 'pillow', 'fastapi[standard]')
         .run_function(warm))

LABELS = {'penis', 'pussy'}
THRESHOLD = 0.3   # 놓치는 것보다 더 가리는 편이 낫다
PAD = 0.25


def blur(img, boxes):
    from PIL import Image, ImageDraw, ImageFilter
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    for x0, y0, x1, y1 in boxes:
        px, py = (x1 - x0) * PAD, (y1 - y0) * PAD
        draw.ellipse((x0 - px, y0 - py, x1 + px, y1 + py), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(6, min(w, h) // 80)))
    # 사용자가 손으로 칠한 블러(blur_editor.py)와 같은 방식 — 줄였다 키워 색은 남기고 세부만 없앤다
    s = max(12, max(w, h) // 70)
    soft = img.resize((max(1, w // s), max(1, h // s)), Image.BILINEAR).resize((w, h), Image.BICUBIC)
    return Image.composite(soft, img, mask)


# POST {key, png(base64)} → {png(base64), hits}
@app.function(image=image, secrets=[modal.Secret.from_name('miro-image-api')], timeout=120, scaledown_window=300)
@modal.fastapi_endpoint(method='POST')
def censor(body: dict):
    import base64, hmac, io, os
    from fastapi import HTTPException
    from PIL import Image
    from imgutils.detect import detect_censors
    if not hmac.compare_digest(str(body.get('key', '')), os.environ['MIRO_IMAGE_SECRET']):
        raise HTTPException(status_code=401)
    img = Image.open(io.BytesIO(base64.b64decode(body['png']))).convert('RGB')
    boxes = [b for b, l, s in detect_censors(img) if l in LABELS and s >= THRESHOLD]
    if boxes:
        img = blur(img, boxes)
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return {'png': base64.b64encode(buf.getvalue()).decode(), 'hits': len(boxes)}
