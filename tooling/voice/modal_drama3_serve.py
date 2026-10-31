"""몰입 모드 음성 서버 — Drama 3 신음 v2(native-moan-v2) on H200 1장 + GPU 상태 저장. 앱 계약은 packages/providers/src/tts.ts 그대로.

  POST /speak  {"text": "...", "voice": "<provider_voice_id>|null", "language": "ko"}  → audio/wav
  GET  /health → {"ok": true}

목소리 = /voices/_drama3/serving-voices/<id>/{ref.wav,ref.txt}(공식) 또는 /user-voices/<id>/(회원이 읽은 녹음, 10/31). 없거나 null 이면 asmr01(신음 시험에 쓴 남성).
회원 녹음은 CPU 클래스 Voices(주소 …-voices-api)가 받는다: POST /warm · POST /voices {audio(base64), text} → {id, seconds, cer} 또는 {error}
  · GET /voices/<id>/preview(만들어지는 중이면 202) · DELETE /voices/<id>.
글 안의 [moaning] 같은 괄호 태그는 그대로 모델에 들어간다.
배포: modal deploy tooling/voice/modal_drama3_serve.py   (Secret miro-drama3-tts 의 MIRO_TTS_API_KEY = Vercel 과 같은 키)
요청이 없으면 5분 뒤 꺼진다. 처음 켜질 때 모델 로드에 몇 분 걸린다.
"""
import modal
from modal_drama3_compare import image as base_image, voices

WEIGHTS = '/voices/_drama3/miro-moan-20261029-v2/native-moan-v2'
VOICES = '/voices/_drama3/serving-voices'
DEFAULT_VOICE = 'asmr01'
SAMPLING = 'fish-space-untruncated-v1'   # 시험 생성과 같은 설정
# CUDA 그래프는 켠다(fish-speech 기본값) — 10/30 판은 학습·청취 스크립트에서 FISH_DRAMA3_CUDA_GRAPH=0 을 그대로 가져와
# 한 칸마다 작은 커널 수천 개를 따로 띄우는 느린 경로(원본 주석: "eager decode is bound by kernel launches")로 돌고 있었다(10/31).
image = (base_image.env({'FISH_DRAMA3_FP8_EXPERTS': '0'})
         .pip_install('fastapi[standard]')
         .add_local_python_source('drama3_fullft', 'modal_drama3_compare'))
app = modal.App('miro-drama3-tts')
user_voices = modal.Volume.from_name('miro-user-voices', create_if_missing=True)
USER_VOICES = '/user-voices'
PREVIEW_TEXT = '안녕, 오늘 하루는 어땠어? 나는 네 이야기가 제일 궁금했어.'
# 받아쓰기와 화면 문장이 이만큼 넘게 다르면 거절(글자 오류율). ponytail: 시작값 — 실측으로 조정
MAX_CER = 0.3


# H200 1장(141GB)에 BF16 71.8GB 가 통째로 들어간다 — GPU 상태 저장은 여러 장 코드와 대체로 안 맞아서 1장으로(10/30).
# GPU 상태 저장(알파): 첫 몇 번의 켜짐에서 모델을 GPU 에 올린 상태를 저장하고, 이후 켜짐은 그 상태에서 되살린다.
# ponytail: 컨테이너 1개·요청 하나씩(줄 서기) — 동시 사용자가 늘면 max_containers 를 올린다(H200 1장씩 추가 과금).
@app.cls(image=image, gpu='H200', cpu=(8, 8), memory=(131072, 196608), timeout=1200, scaledown_window=300,
         min_containers=0, max_containers=1, volumes={'/voices': voices, USER_VOICES: user_voices}, secrets=[modal.Secret.from_name('miro-drama3-tts')],
         enable_memory_snapshot=True, experimental_options={'enable_gpu_snapshot': True})
class Speaker:
    @modal.enter(snap=True)
    def load(self):
        import torch
        from pathlib import Path
        from fish_speech.models.text2semantic.inference import init_model, load_codec_model
        from drama3_fullft.native_inference import native_checkpoint_routing
        weights = Path(WEIGHTS)
        if not (weights / 'VOLUME_COMMITTED.json').exists(): raise ValueError('Uncommitted inference weights')
        with native_checkpoint_routing(weights): self.model, _ = init_model(weights, 'cuda:0', torch.bfloat16, compile=False)
        self.model.eval()
        self.codec = load_codec_model(weights / 'codec.pth', str(self.model.device), torch.bfloat16).eval()
        self.refs = {}

    @modal.enter()
    def capture_graphs(self):
        """상태 저장에서 되살아난 뒤 CUDA 그래프를 한 번 잡는다(상태 저장 안에 그래프를 넣는 건 알파 기능과 맞는지 몰라 피함).
        녹음을 시작할 때 앱이 GPU 를 깨우므로(warm) 이 시간도 녹음하는 동안 지나간다. 실패하면 예전 느린 경로로."""
        import os, time
        from fish_speech.models.text2semantic.fish_omni.generate import Drama3DecodeGraphs
        started = time.time()
        import torch
        try:
            with torch.inference_mode(): Drama3DecodeGraphs.for_model(self.model, 1)   # 추론 모드 밖에서 잡으면 RuntimeError(10/31 A/B)
        except Exception as e:
            os.environ['FISH_DRAMA3_CUDA_GRAPH'] = '0'; self.model.decode_graphs = None
            print('cuda graph capture failed, eager decode:', type(e).__name__, flush=True)
        print(f'cuda graphs ready in {time.time() - started:.1f}s', flush=True)

    def reference(self, name):
        import os, torch
        from fish_speech.models.text2semantic.inference import encode_audio
        if name is None or name == '': name = DEFAULT_VOICE
        ok = isinstance(name, str) and all(c.isalnum() or c in '-_' for c in name)
        if not ok: raise ValueError('invalid voice')
        if name not in self.refs:
            folder = f'{VOICES}/{name}' if ok and os.path.isfile(f'{VOICES}/{name}/ref.wav') else None
            if ok and not folder:
                # 회원 녹음은 이 컨테이너가 켜진 뒤에 들어왔을 수 있다 — 한 번 다시 읽는다
                if not os.path.isfile(f'{USER_VOICES}/{name}/ref.wav'): user_voices.reload()
                if os.path.isfile(f'{USER_VOICES}/{name}/ref.wav'): folder = f'{USER_VOICES}/{name}'
            # 없는 목소리를 기본 목소리로 몰래 바꿔 읽지 않는다(10/31 사용자: 실제로 있는 음성만) — 실패로 돌려 앱이 알게 한다.
            # 기본 목소리는 voice 를 비워 보낼 때만 쓴다.
            if not folder: raise ValueError('voice not found')
            text = open(f'{folder}/ref.txt', encoding='utf-8').read().strip()
            with torch.inference_mode(): codes = encode_audio(f'{folder}/ref.wav', self.codec, str(self.model.device)).cpu().long()
            self.refs[name] = (text, codes)
        return self.refs[name]

    def speak(self, text, voice):
        import io, numpy as np, soundfile as sf, torch
        from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt, generate_drama3
        from drama3_fullft.sampling_profiles import sampling_profile
        ref_text, codes = self.reference(voice)
        # ponytail: 길이 상한은 글자 수 비례 추정 — 잘리는 답이 많으면 실측으로 조정
        limit = min(1536, max(384, len(text) * 24))
        with torch.inference_mode():
            prompt = build_drama3_prompt('<|speaker:0|>' + text, self.model.tokenizer, self.model.config, ['<|speaker:0|>' + ref_text], [codes])
            frames, _ = generate_drama3(self.model, prompt, max_new_tokens=limit, **sampling_profile(SAMPLING))
            if len(frames) == 0: raise ValueError('Empty generated audio')
            wave = self.codec_decode(frames)
        buf = io.BytesIO(); sf.write(buf, np.clip(wave, -1, 1), self.codec.sample_rate, format='WAV', subtype='PCM_16')
        return buf.getvalue()

    def codec_decode(self, frames):
        import numpy as np
        from fish_speech.models.text2semantic.inference import decode_to_audio
        wave = decode_to_audio(frames[:, 1:].T.contiguous().to(self.model.device), self.codec).float().cpu().numpy().squeeze()
        if wave.ndim != 1 or not len(wave) or not np.isfinite(wave).all(): raise ValueError('Invalid waveform')
        return wave

    @modal.method()
    def warm(self):
        """녹음을 시작할 때 앱이 부른다 — 녹음하는 30초 동안 켜지는 시간(상태 저장 24~33초)을 숨긴다."""
        return True

    @modal.method()
    def preview(self, vid):
        """올린 직후 미리 듣기를 한 번 만들어 둔다. 다시 들을 때는 voices_api 가 이 파일을 돌려줘 GPU 를 쓰지 않는다."""
        import os
        folder = f'{USER_VOICES}/{vid}'
        if not os.path.isfile(f'{folder}/ref.wav'): user_voices.reload()
        if not os.path.isfile(f'{folder}/ref.wav'): return False
        audio = self.speak(PREVIEW_TEXT, vid)
        user_voices.reload()   # 그사이 받아쓰기에서 거절돼 지워졌으면 쓰지 않는다
        if not os.path.isfile(f'{folder}/ref.wav'): return False
        open(f'{folder}/preview.wav', 'wb').write(audio)
        user_voices.commit()
        return True

    @modal.method()
    def sample(self, name):
        """공식 목소리 미리 듣기(10/31) — 만들기 화면에서 처음 고를 때 한 번 만들어 /user-voices/_samples/<name>.wav 에 둔다."""
        import os
        os.makedirs(f'{USER_VOICES}/_samples', exist_ok=True)
        open(f'{USER_VOICES}/_samples/{name}.wav', 'wb').write(self.speak(PREVIEW_TEXT, name))
        user_voices.commit()
        return True

    @modal.asgi_app()
    def web(self):
        import hmac, os
        from fastapi import FastAPI, Request, Response
        api, key = FastAPI(), os.environ['MIRO_TTS_API_KEY']

        @api.get('/health')
        def health(): return {'ok': True, 'engine': 'drama3-moan-v2'}

        @api.post('/speak')
        async def speak(request: Request):
            if not hmac.compare_digest(request.headers.get('authorization', ''), f'Bearer {key}'): return Response(status_code=401)
            body = await request.json()
            text = str(body.get('text', '')).strip()[:600]
            if not text: return Response(b'empty text', status_code=400)
            try: return Response(self.speak(delivery_text(text, body), body.get('voice')), media_type='audio/wav')
            except Exception: return Response(b'generation failed', status_code=500)   # 글 내용은 로그에 남기지 않는다
        return api


# 회원 녹음 받기(10/31) — 앱 서버(Vercel)만 부른다. 브라우저 녹음(webm·mp4)을 44.1kHz 모노 wav 로 바꾸고 품질을 본 뒤
# 받아쓰기(faster-whisper small, CPU)로 화면 문장을 읽었는지 대조하고 /user-voices/<sha256>/{ref.wav,ref.txt} 로 둔다.
# 저장하자마자 GPU 가 미리 듣기를 만들기 시작한다(Speaker.preview). 이 함수는 GPU 를 쓰지 않는다.
def delivery_text(text, body):
    """앱이 대사마다 붙인 감정·말투·빠르기·세기(delivery)를 맨 앞 괄호 지시로 — [sad, gentle, slow speech] 대사.
    예전 Fish 게이트웨이(drama3_fullft/miro_contract.py)와 같은 표. 10/30 서버가 이걸 빠뜨려 delivery 가 버려지고 있었다(10/31 수정).
    대사 사이 쉼(pauseAfterMs)은 앱 재생기가 직접 둔다."""
    from drama3_fullft.miro_contract import DELIVERY_TAGS
    d = body.get('delivery') if isinstance(body.get('delivery'), dict) else {}
    if body.get('style') == 'whisper' and 'tone' not in d: d = {**d, 'tone': 'whisper'}
    # 신음이 있는 줄은 흥분한 상태라 말이 빨라진다(10/31 사용자) — AI 가 일부러 느리게(slow) 고른 줄만 그대로 둔다
    if '[moaning' in text and d.get('pace', 'normal') == 'normal': d = {**d, 'pace': 'fast'}
    tags = [DELIVERY_TAGS[f].get(d.get(f), '') for f in DELIVERY_TAGS]
    tags = [t for t in tags if t]
    return ('[' + ', '.join(tags) + '] ' if tags else '') + text

def _whisper():
    from faster_whisper import WhisperModel
    return WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=4)

def cer(said, want):
    """한글·영숫자만 남겨 글자 편집 거리 / 화면 문장 길이."""
    keep = lambda t: [c for c in t if c.isalnum()]
    a, b = keep(said), keep(want)
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ca != cb))
    return row[len(b)] / max(1, len(b))

assert cer('안녕, 하세요!', '안녕하세요') == 0 and abs(cer('안녕하', '안녕하세요') - 0.4) < 1e-9

@app.cls(image=modal.Image.debian_slim(python_version='3.12').apt_install('ffmpeg').pip_install('fastapi[standard]', 'numpy', 'soundfile', 'faster-whisper')
         # 모델을 이미지에 미리 받아 둔다(run_function 은 이 파일을 통째로 불러 Drama 3 모듈이 없어 실패)
         .run_commands("python -c \"from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')\""),
         cpu=4, memory=4096, volumes={USER_VOICES: user_voices, '/voices': voices}, secrets=[modal.Secret.from_name('miro-drama3-tts')],
         timeout=120, max_containers=2, scaledown_window=120, enable_memory_snapshot=True)
class Voices:
    @modal.enter(snap=True)
    def load(self): self.asr = _whisper()

    @modal.asgi_app()
    def api(self):
        import base64, hashlib, hmac, os, shutil, subprocess, tempfile
        import numpy as np, soundfile as sf
        from fastapi import FastAPI, Request, Response
        api, key = FastAPI(), os.environ['MIRO_TTS_API_KEY']
        authed = lambda r: hmac.compare_digest(r.headers.get('authorization', ''), f'Bearer {key}')
        valid = lambda vid: len(vid) == 64 and all(c in '0123456789abcdef' for c in vid)

        @api.post('/warm')
        def warm(request: Request):
            if not authed(request): return Response(status_code=401)
            Speaker().warm.spawn()
            return {'ok': True}

        @api.post('/voices')
        async def add(request: Request):
            if not authed(request): return Response(status_code=401)
            body = await request.json()
            text = str(body.get('text', '')).strip()[:300]
            raw = base64.b64decode(str(body.get('audio', '')), validate=True)
            if not text or not raw or len(raw) > 3_000_000: return {'error': 'invalid'}
            with tempfile.TemporaryDirectory() as d:
                open(f'{d}/in', 'wb').write(raw)
                if subprocess.run(['ffmpeg', '-v', 'error', '-i', f'{d}/in', '-ac', '1', '-ar', '44100', f'{d}/ref.wav'], capture_output=True).returncode: return {'error': 'unreadable'}
                wave, rate = sf.read(f'{d}/ref.wav')
                seconds = len(wave) / rate
                if seconds < 5 or seconds > 30: return {'error': 'length', 'seconds': round(seconds, 1)}
                rms, clipped = float(np.sqrt(np.mean(wave ** 2))), float(np.mean(np.abs(wave) > 0.99))
                if rms < 0.01: return {'error': 'quiet'}
                if clipped > 0.01: return {'error': 'clipped'}
                data = open(f'{d}/ref.wav', 'rb').read()
                vid = hashlib.sha256(data).hexdigest()
                os.makedirs(f'{USER_VOICES}/{vid}', exist_ok=True)
                open(f'{USER_VOICES}/{vid}/ref.wav', 'wb').write(data)
                open(f'{USER_VOICES}/{vid}/ref.txt', 'w', encoding='utf-8').write(text)
                user_voices.commit()
                # 미리 듣기를 받아쓰기보다 먼저 시작한다 — 받아쓰기 시간이 기다림에서 빠진다. 문장이 다르면 파일을 지우고 거절(그 미리 듣기는 버림).
                Speaker().preview.spawn(vid)
                segments, _ = self.asr.transcribe(f'{d}/ref.wav', language='ko', beam_size=1, vad_filter=True)
                score = cer(''.join(s.text for s in segments), text)
            if score > MAX_CER:
                shutil.rmtree(f'{USER_VOICES}/{vid}', ignore_errors=True); user_voices.commit()
                return {'error': 'mismatch', 'cer': round(score, 2)}
            return {'id': vid, 'seconds': round(seconds, 1), 'cer': round(score, 2)}

        @api.get('/voices/{vid}/preview')
        def preview(vid: str, request: Request):
            if not authed(request): return Response(status_code=401)
            if not valid(vid): return Response(status_code=400)
            path = f'{USER_VOICES}/{vid}/preview.wav'
            if not os.path.isfile(path): user_voices.reload()
            if not os.path.isfile(path): return Response(status_code=202)
            return Response(open(path, 'rb').read(), media_type='audio/wav')

        named = lambda n: 0 < len(n) <= 64 and all(c.isalnum() or c in '-_' for c in n)

        @api.get('/samples/{name}')
        def sample(name: str, request: Request):
            """공식 목소리 미리 듣기 파일. 없으면 202 — 앱이 POST 로 한 번 만들게 한 뒤 다시 묻는다."""
            if not authed(request): return Response(status_code=401)
            if not named(name): return Response(status_code=400)
            path = f'{USER_VOICES}/_samples/{name}.wav'
            if not os.path.isfile(path): user_voices.reload()
            if not os.path.isfile(path): return Response(status_code=202)
            return Response(open(path, 'rb').read(), media_type='audio/wav')

        @api.post('/samples/{name}')
        def make_sample(name: str, request: Request):
            if not authed(request): return Response(status_code=401)
            if not named(name): return Response(status_code=400)
            # ponytail: 같은 목소리를 여러 명이 동시에 처음 누르면 두 번 만들 수 있다 — 한 번 만들면 끝이라 둔다
            # 실제로 있는 공식 목소리만 견본을 만든다(없는 이름으로 기본 목소리 견본이 저장되지 않게)
            voices.reload()
            if not os.path.isfile(f'{VOICES}/{name}/ref.wav'): return Response(status_code=404)
            if not os.path.isfile(f'{USER_VOICES}/_samples/{name}.wav'): Speaker().sample.spawn(name)
            return {'ok': True}

        @api.delete('/voices/{vid}')
        def remove(vid: str, request: Request):
            if not authed(request): return Response(status_code=401)
            if not valid(vid): return Response(status_code=400)
            shutil.rmtree(f'{USER_VOICES}/{vid}', ignore_errors=True)
            user_voices.commit()
            return {'ok': True}
        return api
