"""몰입 모드 음성 서버 — Drama 3 신음 v2(native-moan-v2) on H200 1장 + GPU 상태 저장. 앱 계약은 packages/providers/src/tts.ts 그대로.

  POST /speak  {"text": "...", "voice": "<provider_voice_id>|null", "language": "ko"}  → audio/wav
  GET  /health → {"ok": true}

목소리 = /voices/_drama3/serving-voices/<id>/{ref.wav,ref.txt}. 없거나 null 이면 asmr01(신음 시험에 쓴 남성).
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
image = (base_image.env({'FISH_DRAMA3_FP8_EXPERTS': '0', 'FISH_DRAMA3_CUDA_GRAPH': '0'})
         .pip_install('fastapi[standard]')
         .add_local_python_source('drama3_fullft', 'modal_drama3_compare'))
app = modal.App('miro-drama3-tts')


# H200 1장(141GB)에 BF16 71.8GB 가 통째로 들어간다 — GPU 상태 저장은 여러 장 코드와 대체로 안 맞아서 1장으로(10/30).
# GPU 상태 저장(알파): 첫 몇 번의 켜짐에서 모델을 GPU 에 올린 상태를 저장하고, 이후 켜짐은 그 상태에서 되살린다.
# ponytail: 컨테이너 1개·요청 하나씩(줄 서기) — 동시 사용자가 늘면 max_containers 를 올린다(H200 1장씩 추가 과금).
@app.cls(image=image, gpu='H200', cpu=(8, 8), memory=(131072, 196608), timeout=1200, scaledown_window=300,
         min_containers=0, max_containers=1, volumes={'/voices': voices}, secrets=[modal.Secret.from_name('miro-drama3-tts')],
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

    def reference(self, name):
        import os, torch
        from fish_speech.models.text2semantic.inference import encode_audio
        ok = isinstance(name, str) and name and all(c.isalnum() or c in '-_' for c in name)
        if not (ok and os.path.isfile(f'{VOICES}/{name}/ref.wav')): name = DEFAULT_VOICE
        if name not in self.refs:
            text = open(f'{VOICES}/{name}/ref.txt', encoding='utf-8').read().strip()
            with torch.inference_mode(): codes = encode_audio(f'{VOICES}/{name}/ref.wav', self.codec, str(self.model.device)).cpu().long()
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
            try: return Response(self.speak(text, body.get('voice')), media_type='audio/wav')
            except Exception: return Response(b'generation failed', status_code=500)   # 글 내용은 로그에 남기지 않는다
        return api
