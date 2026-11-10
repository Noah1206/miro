"""몰입 모드 음성 서버 — Drama 3 감정 v1(native-emotion-v1, 신음 v2 에서 이어 학습) on H200 1장 + GPU 상태 저장. 앱 계약은 packages/providers/src/tts.ts 그대로.

  POST /speak  {"text": "...", "voice": "<provider_voice_id>|null", "language": "ko"}  → audio/wav
  GET  /health → {"ok": true}

목소리 = /voices/_drama3/serving-voices/<id>/{ref.wav,ref.txt}(공식) 또는 /user-voices/<id>/(회원이 읽은 녹음, 10/31). 없거나 null 이면 asmr01(신음 시험에 쓴 남성).
회원 녹음은 CPU 클래스 Voices(주소 …-voices-api)가 받는다: POST /warm · POST /voices {audio(base64), text} → {id, seconds, cer} 또는 {error}
  · GET /voices/<id>/preview(만들어지는 중이면 202) · DELETE /voices/<id>.
글 안의 [moaning] 같은 괄호 태그는 그대로 모델에 들어간다.
배포: modal deploy tooling/voice/modal_drama3_serve.py   (Secret miro-drama3-tts 의 MIRO_TTS_API_KEY = Vercel 과 같은 키)
요청이 없으면 20분 뒤 꺼진다. 처음 켜질 때 모델 로드에 몇 분 걸린다.
"""
import modal
from modal_drama3_compare import image as base_image, voices

WEIGHTS = '/voices/_drama3/miro-emotion-20261031-v1/native-emotion-v1'   # 11/1 감정 단계로 교체(사용자 청취 "괜찮네"), 되돌리기: miro-moan-20261029-v2/native-moan-v2
VOICES = '/voices/_drama3/serving-voices'
DEFAULT_VOICE = 'asmr01'
# ponytail: 목소리 샘플 상태는 목소리 16개까지 들고 있는다(하나 ~100MB) — 넘으면 가장 오래 안 쓴 것부터 버린다
PREFIX_VOICES = 16
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
@app.cls(image=image, gpu='H200', cpu=(8, 8), memory=(131072, 196608), timeout=1200, scaledown_window=1200,   # 11/6: 5분 → 20분(Modal 상한) — 대화 중 잠깐 쉬어도 다시 켜는 대기가 없게
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
        from collections import OrderedDict
        self.prefixes = OrderedDict()   # 목소리 → 목소리 샘플까지 읽은 모델 상태(11/6, 아래 generate)

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

    def speak(self, text, voice, reuse=True):
        import io, numpy as np, soundfile as sf, torch
        from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt, generate_drama3
        from drama3_fullft.sampling_profiles import sampling_profile
        import zlib
        ref_text, codes = self.reference(voice)
        # ponytail: 길이 상한은 글자 수 비례 추정 — 잘리는 답이 많으면 실측으로 조정
        limit = min(1536, max(384, len(text) * 24))
        # 11/11 사용자("한 문장마다 다른 사람 같다"): 목소리마다 같은 씨앗 — 요청마다 무작위가 새로 시작돼 같은 목소리의 결이 줄마다 흔들렸다.
        torch.manual_seed(zlib.crc32((voice or DEFAULT_VOICE).encode()))
        with torch.inference_mode():
            prompt = build_drama3_prompt('<|speaker:0|>' + text, self.model.tokenizer, self.model.config, ['<|speaker:0|>' + ref_text], [codes])
            frames = self.generate(prompt, voice or DEFAULT_VOICE, limit) if reuse else generate_drama3(self.model, prompt, max_new_tokens=limit, **sampling_profile(SAMPLING))[0]
            if len(frames) == 0: raise ValueError('Empty generated audio')
            wave = self.codec_decode(frames)
        buf = io.BytesIO(); sf.write(buf, np.clip(wave, -1, 1), self.codec.sample_rate, format='WAV', subtype='PCM_16')
        return buf.getvalue()

    def generate(self, prompt, voice, max_new_tokens):
        """generate_drama3 와 같은 생성(같은 샘플링·같은 디코드 그래프)인데, 목소리 샘플까지 읽은 상태를 목소리마다 저장해 두고 되돌려 쓴다(11/6).
        요청마다 같은 목소리 샘플 ~670줄을 다시 읽느라 4.7초씩 들던 준비를, 목소리당 처음 한 번만 한다.
        모델은 위치별로 저장되는 주의층과, 앞 내용을 상태 하나로 요약하는 순환층(GatedDeltaNet)이 섞여 있다 —
        주의층 저장값은 [:cut] 위치를, 순환층은 그 시점의 상태를 통째로 떠 둔다. cut 은 목소리 샘플과 공통 머리말이 끝나기 한 줄 전:
        보조 디코더(tower)의 줄 p 는 다음 줄 p+1 을 정답으로 보고 채워지므로, 마지막 공통 줄은 글마다 다시 채워야 한다."""
        import time, torch
        from fish_speech.models.text2semantic.fish_omni.generate import Drama3DecodeGraphs, ensure_drama3_caches
        from drama3_fullft.sampling_profiles import sampling_profile
        model = self.model; backbone, tower = model.backbone, model.audio_decoder
        sampling = sampling_profile(SAMPLING)
        rows = len(prompt); capacity = rows + max_new_tokens
        if capacity > model.config.text.max_position_embeddings: raise ValueError('prompt too long')
        graphs = Drama3DecodeGraphs.for_model(model, capacity)
        if graphs is None: ensure_drama3_caches(model, capacity)
        frames = torch.zeros((capacity, prompt.shape[1]), dtype=torch.long, device=tower.device)
        frames[:rows] = prompt.to(tower.device)
        positions = torch.arange(capacity, device=tower.device)

        def prefill(lo, hi):
            hidden = None
            for start in range(lo, hi, 128):
                end = min(start + 128, hi)
                chunk = frames[start:end]
                hidden = backbone(inputs_embeds=tower.embed_backbone(chunk, backbone.embed(chunk[:, 0]))[None], input_pos=positions[start:end])[0].to(tower.device)
                paired = min(end, rows - 1)
                if paired > start: tower.prefill(hidden[: paired - start], positions[start:paired], frames[start:paired], frames[start + 1 : paired + 1])
            return hidden

        attn = [l.self_attn for l in backbone.model.layers if l.layer_type == 'full_attention']
        linear = [l.linear_attn for l in backbone.model.layers if l.layer_type != 'full_attention']
        towers = [l.transformer_layer.attention for l in (*tower.shared_layers, *tower.residual_layers)]
        started = time.perf_counter()
        saved = self.prefixes.get(voice)
        if saved and rows > saved['cut'] + 1 and torch.equal(prompt[: saved['cut'] + 1], saved['rows']):
            cut = saved['cut']
            for a, (k, v) in zip(attn, saved['attn']): a.k_cache[:1, :, :cut].copy_(k); a.v_cache[:1, :, :cut].copy_(v)
            for g, (c, r) in zip(linear, saved['linear']): g.conv_state[:1].copy_(c); g.recurrent_state[:1].copy_(r)
            for t, (k, v) in zip(towers, saved['tower']): t.k_cache[:, :, :cut].copy_(k); t.v_cache[:, :, :cut].copy_(v)
            self.prefixes.move_to_end(voice)
            hit = True
        else:
            # 공통 머리말 = 서로 다른 두 글로 만든 프롬프트가 같은 줄까지(목소리 샘플·지시문·화자 표시)
            from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt
            ref_text, codes = self.reference(voice)
            other = build_drama3_prompt('<|speaker:0|>' + 'Zq', model.tokenizer, model.config, ['<|speaker:0|>' + ref_text], [codes])
            common = next((i for i in range(min(len(other), rows)) if not torch.equal(other[i], prompt[i])), min(len(other), rows))
            # 11/6: 끊는 자리를 fish-speech 의 읽기 단위(128줄) 경계로 — 경계가 다르면 계산이 미세하게 달라져 소리가 갈렸다(사용자 청취: 예전이 나음).
            # 경계를 맞추면 계산 순서가 generate_drama3 와 같아 같은 씨앗에서 예전과 똑같은 소리가 난다(bench 의 same_as_old).
            cut = (common - 1) // 128 * 128
            hit = False
            if cut > 0:
                prefill(0, cut)
                self.prefixes[voice] = {'cut': cut, 'rows': prompt[: cut + 1].clone(),
                    'attn': [(a.k_cache[:1, :, :cut].clone(), a.v_cache[:1, :, :cut].clone()) for a in attn],
                    'linear': [(g.conv_state[:1].clone(), g.recurrent_state[:1].clone()) for g in linear],
                    'tower': [(t.k_cache[:, :, :cut].clone(), t.v_cache[:, :, :cut].clone()) for t in towers]}
                while len(self.prefixes) > PREFIX_VOICES: self.prefixes.popitem(last=False)
            else: cut = 0
        hidden = prefill(cut, rows)
        print(f'prefill {rows} rows (reused {cut if hit else 0}) in {time.perf_counter() - started:.2f}s', flush=True)

        hidden = hidden[-1:]
        produced = 0
        if graphs is not None: graphs.start(hidden, rows - 1, frames[:rows], sampling['temperature'], sampling['top_k'], sampling['top_p'])
        for step in range(max_new_tokens):
            position = rows - 1 + step
            if graphs is not None: sampled, main = graphs.step(position)
            else:
                logits = backbone.compute_logits(hidden).to(tower.device)
                sampled = tower.decode_step(logits, hidden, positions[position : position + 1], frames[position : position + 1], frames[: position + 1, 0],
                                            temperature=sampling['temperature'], top_k=sampling['top_k'], top_p=sampling['top_p'])
                main = sampled[0, 0].item()
            if main == model.config.eos_token_id: break
            frames[position + 1] = sampled[0]
            produced += 1
            if graphs is None and step + 1 < max_new_tokens:
                hidden = backbone(inputs_embeds=tower.embed_backbone(sampled, backbone.embed(sampled[:, 0]))[None], input_pos=positions[position + 1 : position + 2])[0].to(tower.device)
        return frames[rows : rows + produced].cpu()

    @modal.method()
    def bench(self, items, seed=7):
        """재사용 확인용(11/6): 같은 글을 예전 방식·재사용 첫 번째(저장)·재사용 두 번째(되돌림)로 만들어 시간과 소리를 돌려준다.
        저장/되돌림이 같은 씨앗에서 같은 소리면 상태를 제대로 되돌린 것이다."""
        import time, torch
        out = []
        for item in items:
            text, voice = delivery_text(item['text'], item), item.get('voice')
            row = {'text': item['text'], 'voice': voice}
            for name, reuse, drop in (('old', False, False), ('first', True, True), ('again', True, False)):
                if drop: self.prefixes.pop(voice or DEFAULT_VOICE, None)
                torch.manual_seed(seed); torch.cuda.synchronize(); t = time.perf_counter()
                row[name] = self.speak(text, voice, reuse=reuse)
                torch.cuda.synchronize(); row[name + '_s'] = round(time.perf_counter() - t, 2)
            row['same'] = row['first'] == row['again']
            row['same_as_old'] = row['first'] == row['old']
            out.append(row)
        return out

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
         .run_commands("python -c \"from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')\"")
         # 이 파일이 맨 위에서 modal_drama3_compare 를 불러서, 컨테이너에도 같이 넣어야 켜진다(10/31: 빠져 있어 켜질 때마다 죽었다)
         .add_local_python_source('drama3_fullft', 'modal_drama3_compare'),
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
                # 11/3: 파일 경로를 주면 faster-whisper 가 PyAV 로 읽다가 버전 차이(metadata_errors 인자)로 죽는다 — 16kHz 배열로 넘긴다.
                subprocess.run(['ffmpeg', '-v', 'error', '-i', f'{d}/ref.wav', '-ac', '1', '-ar', '16000', f'{d}/ref16.wav'], check=True)
                segments, _ = self.asr.transcribe(sf.read(f'{d}/ref16.wav', dtype='float32')[0], language='ko', beam_size=1, vad_filter=True)
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
