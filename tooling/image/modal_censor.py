"""채팅 사진 가림 서버(11/8) — 앱이 만든 언베일 사진을 받아 남성 성기만 흰색으로 칠해 돌려준다(11/18 사용자 결정: 남성기만 흰색, 그 밖은 가리지 않음 — 딜도가 함께 칠해져도 괜찮다).

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

LABELS = {'penis'}
THRESHOLD = 0.3   # 놓치는 것보다 더 가리는 편이 낫다
PAD = 0.25


WHITE = 0.97   # 흰색 비율 — 0.9 는 윤곽이 비쳤다(11/18 실측), 거의 흰색으로


def whiten(img, boxes):
    from PIL import Image, ImageDraw, ImageFilter
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    for x0, y0, x1, y1 in boxes:
        px, py = (x1 - x0) * PAD, (y1 - y0) * PAD
        draw.ellipse((x0 - px, y0 - py, x1 + px, y1 + py), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(2, min(w, h) // 400)))   # 가장자리만 살짝 부드럽게
    white = Image.blend(img.convert('L').convert('RGB'), Image.new('RGB', (w, h), 'white'), WHITE)
    return Image.composite(white, img, mask)


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
    if body.get('warm'):   # 11/11 사진 창을 열 때 미리 깨우기 — 서버만 띄우고 바로 답한다
        return {'ok': True}
    img = Image.open(io.BytesIO(base64.b64decode(body['png']))).convert('RGB')
    boxes = [b for b, l, s in detect_censors(img) if l in LABELS and s >= THRESHOLD]
    if boxes:
        img = whiten(img, boxes)
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=90, method=4)   # 11/11 PNG 대신 WebP(약 1/10) — 앱으로 돌려보내고 저장·전송하는 크기. 키 이름 png 는 예전 그대로
    return {'png': base64.b64encode(buf.getvalue()).decode(), 'hits': len(boxes)}
