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
# 11/11 밤 방 단위 목소리 기억(사용자 청취 "맨 오른쪽이 진짜 너무 좋은데", output/voice-delivery G 구역 · 실험 modal_drama3_session_memory.py):
# 턴마다 견본만 보고 새로 시작하면 높이·크기·감정이 턴마다 따로 논다 → 같은 방·같은 목소리의 지난 턴(글+소리)을 견본 뒤에 이어 붙인다.
# 붙이는 것 = 지난 합격 턴 중 견본과 가장 닮은 1개 + 바로 앞 합격 턴. 고장 난 턴(무음·대사 건너뜀)은 기억에 넣지 않는다 — 넣으면 뒤 턴이 따라 무너졌다(1차 실험).
# ponytail: 기억은 컨테이너 메모리에만 — 서버가 꺼지면(20분) 그 방은 견본만으로 다시 시작한다. 끊김이 거슬리면 볼륨에 코드(턴당 수십 KB)를 저장.
SESSION_TURNS = 6       # 방·목소리마다 들고 있는 합격 턴 수(가장 닮은 턴은 밀려나지 않게 따로 지킨다)
SESSIONS = 400          # 기억하는 방·목소리 쌍(코드만이라 작다)
SESSION_PREFIXES = 24   # 이어 붙인 상태까지 읽어 둔 모델 상태(쌍당 수백 MB) — 넘으면 가장 오래 안 쓴 것부터
RETRIES = 3             # 무음으로 시작하면 씨앗을 바꿔 다시(11/11 같은 대사가 71초 무음으로 나온 고장)
# 11/11 오후 .7·.7(안정 설정)로 바꿨다가 음질이 크게 떨어졌다(사용자) — 시험 생성과 같은 설정으로 되돌림. 줄마다 다르던 톤은 감정 지시를 빼서(EMOTION_TAGS) 잡는다.
SAMPLING = 'fish-space-untruncated-v1'
EMOTION_TAGS = False   # 11/11 밤 사용자 청취(모녀덮밥 방 7턴, output/voice-delivery E): 지시를 붙인 쪽은 "목소리가 완전 달라져서" 뺌 — 지시 없이 대사 글만으로. 낮의 "감정 지시는 무조건"을 사용자가 뒤집음. 대사 속 소리 태그([moaning] 등)는 그대로.
# 11/11 스트리밍: 첫 조각은 짧게(8프레임 ≈ 0.37초, 첫소리를 빨리), 그다음은 16프레임(≈0.74초)마다.
# stream_check 실측(희아, 248프레임): 코덱은 뒤를 보지 않는다(보류 프레임 차이 0) — 그런데 기억이 길어 앞 48·128프레임만 문맥으로 주면 소리가 갈렸고
# (최대 차이 0.52·0.10), 256프레임 이상·처음부터 전부는 한 번에 푼 것과 같았다(0.007, 수치 흔들림 수준). 처음부터 다시 풀어도 16조각에 0.34초라 전부 준다.
STREAM_FIRST, STREAM_EVERY, STREAM_CTX, STREAM_HOLD = 8, 16, 1 << 20, 0
# 11/11 견본 배경 걷어냄(modal_clean_refs.py, Demucs) — 견본을 바꾸면 이 값을 바꿔 배포해야 상태 저장(견본·준비 상태가 든)이 새로 만들어진다.
REFS_VERSION = '2026-11-11-vocals-squeezed'
# 11/11 켜질 때 미리 준비할 목소리(운영 official_voices 활성 11개 + 기본) — provider_voice_id. 목소리를 새로 열면 여기에 더한다.
def split_points(wave, lengths, rate):
    """한 번에 합성한 소리를 줄마다 자를 자리 — 글자 수 비율로 짐작한 곳 앞뒤 15% 안에서 가장 조용한 곳(160ms 평균 세기가 가장 낮은 곳)."""
    import numpy as np
    win = max(1, int(rate * 0.02)); n = len(wave) // win
    if n < 4 or len(lengths) < 2: return [len(wave) * sum(lengths[: k + 1]) // max(1, sum(lengths)) for k in range(len(lengths) - 1)]
    energy = np.sqrt(np.mean(wave[: n * win].reshape(n, win) ** 2, axis=1))
    smooth = np.convolve(energy, np.ones(8) / 8, mode='same')
    total, acc, prev, cuts = sum(lengths), 0, 0, []
    for length in lengths[:-1]:
        acc += length
        expect = int(n * acc / total); span = max(2, int(n * 0.15))
        lo, hi = max(prev + 1, expect - span), min(n - 1, expect + span)
        at = lo + int(np.argmin(smooth[lo:hi])) if hi > lo else min(n - 1, max(prev + 1, expect))
        cuts.append(at * win); prev = at
    return cuts

def trim_tail(wave, rate, floor=0.004, keep=0.25):
    """끝의 침묵은 0.25초만 남긴다(11/11 — 견본 침묵을 흉내 낸 긴 끝을 자른다)."""
    import numpy as np
    win = max(1, int(rate * 0.02)); n = len(wave) // win
    if n < 2: return wave
    loud = np.sqrt(np.mean(wave[: n * win].reshape(n, win) ** 2, axis=1)) >= floor
    if not loud.any(): return wave[: int(rate * keep)]
    return wave[: min(len(wave), (int(n - np.argmax(loud[::-1])) * win) + int(rate * keep))]

def speech_stats(text, wave, rate):
    """(한글 글자 수, 말 구간의 세기, 글자/초) — 괄호 태그는 글자 수에서 뺀다. 소리가 아예 없으면 세기 0."""
    import re, numpy as np
    n = len(re.findall('[가-힣]', re.sub(r'\[[^\]]*\]', '', text)))
    win = max(1, int(rate * 0.02)); k = len(wave) // win
    if k < 2: return n, 0.0, 0.0
    energy = np.sqrt(np.mean(wave[: k * win].reshape(k, win) ** 2, axis=1)); loud = energy >= 0.01
    if not loud.any(): return n, 0.0, 0.0
    a, b = int(np.argmax(loud)), int(k - np.argmax(loud[::-1]))
    return n, float(np.sqrt(np.mean(wave[a * win : b * win] ** 2))), n / max((b - a) * 0.02, 0.1)

def broken(text, wave, rate):
    """다시 만들어야 하는 고장인가 — 거의 무음(11/11 71초 침묵), 또는 긴 대사인데 글자/초가 비정상(대사를 건너뜀·늘어짐). 짧은 줄은 세기만 본다."""
    n, rms, cps = speech_stats(text, wave, rate)
    return rms < 0.03 or (n >= 15 and not 2.3 <= cps <= 7.5)

def rest_after(text, seconds, pace=4.2):
    """seconds 만큼 읽었다면 남은 대사 — 읽은 글자 수(초당 pace 글자)를 지난 첫 문장 끝부터. 남은 게 거의 없으면 ''.
    ponytail: 읽은 자리를 시간으로 짐작한다(한 문장쯤 겹치거나 빠질 수 있다) — 정확히 하려면 만든 소리를 받아써서 맞춘다."""
    import re
    read, seen = int(seconds * pace), 0
    for m in re.finditer('[가-힣]', text):
        seen += 1
        if seen >= read:
            end = re.search(r'[.!?…]+["\')\]]*\s+', text[m.end():])
            rest = text[m.end() + end.end():].strip() if end else ''
            return rest if len(re.findall('[가-힣]', rest)) >= 5 else ''
    return ''

def healthy(text, wave, rate):
    """기억에 넣어도 되는 소리인가 — 고장이 아니고, 판단할 만큼 긴 대사."""
    return speech_stats(text, wave, rate)[0] >= 15 and not broken(text, wave, rate)

def frame_limit(text):
    """생성 프레임 상한(초당 약 21.5프레임). 11/11 한 턴 통째 합성 때문에 1536(71초)→4096(190초) — CUDA 그래프 용량은 프롬프트 포함 10240줄."""
    return min(4096, max(384, len(text) * 24))

PREWARM_VOICES = (
    'a5201527d34471b03817182b6531bb3e01fc92df1a3f999edf2d940971b3e76e', '92cb93673ea569c86cfca09d4e72ee7d6e004f5199228417a11267c9360ed2cf',
    '69bacb4f815a856c47d4780040533a9ccc1a6855b0a44bd321675a9691bc44b8', 'f89e2d42bafe669e8deda6ed17dc03e4ff724dbec33cbe6334db6c0e22e4d436',
    '7957fb58a77207716705328b631e56af6cb50611c7a0aacf582ff00e567c1e11', '46e987920acccb82bf0cebb1ebef04880c441bcede46213fbd0864f026a9b83d',
    'd172023c27412afbaf89e1d03f76f4700ede7136fb620e0e6f3b91446203aecb', '1db62c842e73924c3ce89862666c070a8e2709d0e6de507d411c6d6b92c76ed6',
    '750e1f586d990f4c29648357194ec1c2b0ca40c76d26d7ede6400e0ff77b9f2b', 'd5b4a31e1f4ad18fed004d222ae0696417615293f96c0bc85689a8ef772da31f',
    '19b7e3a0247ca570bedcad023e46b0c16af3ece29aa481d60c661a9a6cfd4862',
)
# CUDA 그래프는 켠다(fish-speech 기본값) — 10/30 판은 학습·청취 스크립트에서 FISH_DRAMA3_CUDA_GRAPH=0 을 그대로 가져와
# 한 칸마다 작은 커널 수천 개를 따로 띄우는 느린 경로(원본 주석: "eager decode is bound by kernel launches")로 돌고 있었다(10/31).
image = (base_image.env({'FISH_DRAMA3_FP8_EXPERTS': '0'})
         .pip_install('fastapi[standard]')
         .add_local_python_source('drama3_fullft', 'modal_drama3_compare'))
import os as _os
app = modal.App(_os.environ.get('MIRO_TTS_APP', 'miro-drama3-tts'))   # 시험 배포: MIRO_TTS_APP=miro-drama3-tts-staging modal deploy …
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
        # 11/11 쓰는 목소리는 켜질 때 미리 준비(목소리 샘플까지 읽은 상태) — 상태 저장 안에 들어가 되살아난 서버는 목소리마다 첫 요청 7.5초가 없다.
        from collections import OrderedDict
        self.prefixes = OrderedDict()
        self.session_prefixes, self.memory, self.ref_embs = OrderedDict(), OrderedDict(), {}
        # 기억에서 "견본과 가장 닮은 지난 턴"을 고르는 화자 판별 모델(작다). 못 올리면 가장 처음 합격 턴을 쓴다.
        try:
            from transformers import AutoFeatureExtractor, WavLMForXVector
            self.sv_fe = AutoFeatureExtractor.from_pretrained('microsoft/wavlm-base-plus-sv', cache_dir='/voices/_drama3/hf-cache')
            self.sv = WavLMForXVector.from_pretrained('microsoft/wavlm-base-plus-sv', cache_dir='/voices/_drama3/hf-cache').to(self.model.device).eval()
        except Exception as e: self.sv = None; print('speaker model unavailable', type(e).__name__, flush=True)
        print('refs', REFS_VERSION, flush=True)
        for voice in PREWARM_VOICES:
            try: self._prewarm_voice(voice)
            except Exception as e: print('prewarm failed', voice[:8], type(e).__name__, flush=True)

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
        if not hasattr(self, 'prefixes'): self.prefixes = OrderedDict()   # 목소리 → 목소리 샘플까지 읽은 모델 상태(11/6, 아래 generate). 11/11 load 에서 미리 채움
        for name, value in (('session_prefixes', OrderedDict()), ('memory', OrderedDict()), ('ref_embs', {}), ('sv', None)):
            if not hasattr(self, name): setattr(self, name, value)

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

    def embed(self, wave, rate):
        """화자 임베딩(정규화) — 화자 판별 모델이 없으면 None."""
        import torch, torchaudio
        if self.sv is None: return None
        a = torchaudio.functional.resample(torch.as_tensor(wave, dtype=torch.float32), rate, 16000).numpy()
        with torch.inference_mode():
            e = self.sv(**{k: x.to(self.sv.device) for k, x in self.sv_fe(a, sampling_rate=16000, return_tensors='pt').items()}).embeddings[0]
        return torch.nn.functional.normalize(e.float(), dim=-1).cpu()

    def history(self, session, voice, turn=None):
        """이 방·이 목소리의 다음 턴에 이어 붙일 지난 턴 [(글, 코드)] — 견본과 가장 닮은 1개 + 바로 앞 턴. 다시 듣는 턴 자신은 뺀다."""
        if not session: return []
        good = [g for g in self.memory.get((session, voice), []) if g['turn'] != turn or turn is None]
        if not good: return []
        # 유사도는 소수 둘째 자리까지만 견준다(같으면 먼저 온 턴) — 0.988 과 0.989 의 차이로 기준 턴이 바뀌면 읽어 둔 상태를 통째로 다시 만들어야 한다(11/11 운영 확인 11초).
        best = max(good[:-1], key=lambda g: round(g['sim'], 2)) if len(good) > 1 else None
        return [(g['text'], g['codes']) for g in ((best, good[-1]) if best else (good[-1],))]

    def remember(self, session, voice, turn, text, codes, wave):
        """합격한 턴만 기억에 넣는다. codes = [칸, 프레임](소리 코드), wave = 그 소리."""
        import torch
        if not session or not healthy(text, wave, self.codec.sample_rate): return False
        if voice not in self.ref_embs:
            from fish_speech.models.text2semantic.inference import decode_to_audio
            with torch.inference_mode(): ref_wave = decode_to_audio(self.reference(voice)[1].to(self.model.device), self.codec).float().cpu().numpy().squeeze()
            self.ref_embs[voice] = self.embed(ref_wave, self.codec.sample_rate)
        e, ref = self.embed(wave, self.codec.sample_rate), self.ref_embs[voice]
        good = [g for g in self.memory.get((session, voice), []) if g['turn'] != turn or turn is None]
        good.append({'turn': turn, 'text': text, 'codes': codes.cpu().long(), 'sim': float(e @ ref) if e is not None and ref is not None else -len(good)})   # 판별 모델이 없으면 먼저 온 턴이 높다
        if len(good) > SESSION_TURNS:
            best = max(good[:-1], key=lambda g: round(g['sim'], 2))
            good = [g for g in good[:-SESSION_TURNS + 1] if g is best] + good[-SESSION_TURNS + 1 :]
        self.memory[(session, voice)] = good; self.memory.move_to_end((session, voice))
        while len(self.memory) > SESSIONS: self.memory.popitem(last=False)
        return True

    def prompts(self, text, voice, history):
        """(이 글의 프롬프트, 공통 머리말을 재는 짝 프롬프트) — 지난 턴을 이어 붙이면 둘 다 같은 기억을 단다."""
        from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt
        ref_text, codes = self.reference(voice)
        make = lambda t: build_drama3_prompt('<|speaker:0|>' + t, self.model.tokenizer, self.model.config, ['<|speaker:0|>' + ref_text], [codes],
                                             history=[('<|speaker:0|>' + h, c) for h, c in history])
        return make(text), make('Zq')

    @modal.method()
    def prepare(self, session, voice): return self._prepare(session, voice)

    def _prepare(self, session, voice):
        """턴이 끝난 뒤 뒤에서(유저가 입력하는 동안) 다음 턴이 쓸 상태를 미리 읽어 둔다 — 이어 붙인 기억(약 1,500~2,000줄)을 요청 때 읽으면 첫소리가 몇 초 늦는다."""
        import torch
        history = self.history(session, voice)
        if not history: return False
        with torch.inference_mode():
            prompt, other = self.prompts('안녕.', voice, history)
            for _ in self._decode(prompt, voice, 1, key=(session, voice), other=other): pass
        return True

    def speak(self, text, voice, reuse=True, seed=True):
        import io, numpy as np, soundfile as sf, torch
        from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt, generate_drama3
        from drama3_fullft.sampling_profiles import sampling_profile
        import zlib
        ref_text, codes = self.reference(voice)
        # ponytail: 길이 상한은 글자 수 비례 추정 — 잘리는 답이 많으면 실측으로 조정
        limit = frame_limit(text)
        # 11/11 사용자("한 문장마다 다른 사람 같다"): 목소리마다 같은 씨앗 — 요청마다 무작위가 새로 시작돼 같은 목소리의 결이 줄마다 흔들렸다.
        if seed: torch.manual_seed(zlib.crc32((voice or DEFAULT_VOICE).encode()))
        with torch.inference_mode():
            prompt = build_drama3_prompt('<|speaker:0|>' + text, self.model.tokenizer, self.model.config, ['<|speaker:0|>' + ref_text], [codes])
            frames = self.generate(prompt, voice or DEFAULT_VOICE, limit) if reuse else generate_drama3(self.model, prompt, max_new_tokens=limit, **sampling_profile(SAMPLING))[0]
            if len(frames) == 0: raise ValueError('Empty generated audio')
            wave = self.codec_decode(frames)
        buf = io.BytesIO(); sf.write(buf, np.clip(wave, -1, 1), self.codec.sample_rate, format='WAV', subtype='PCM_16')
        return buf.getvalue()

    def _prewarm_voice(self, voice):
        """_decode 의 '처음 보는 목소리' 갈래와 같은 계산으로 목소리 샘플까지 읽은 상태를 만들어 둔다(디코드는 하지 않는다).
        끊는 자리 앞까지는 글과 상관없이 같은 줄이라 계산 결과도 같다 — 요청 때 만든 것과 같은 상태."""
        import torch
        from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt, ensure_drama3_caches
        model = self.model; backbone, tower = model.backbone, model.audio_decoder
        ref_text, codes = self.reference(voice)
        with torch.inference_mode():
            prompt = build_drama3_prompt('<|speaker:0|>' + '안녕.', model.tokenizer, model.config, ['<|speaker:0|>' + ref_text], [codes])
            other = build_drama3_prompt('<|speaker:0|>' + 'Zq', model.tokenizer, model.config, ['<|speaker:0|>' + ref_text], [codes])
            rows = len(prompt)
            common = next((i for i in range(min(len(other), rows)) if not torch.equal(other[i], prompt[i])), min(len(other), rows))
            cut = (common - 1) // 128 * 128
            if cut <= 0: return
            ensure_drama3_caches(model, rows + 8)
            frames = prompt.to(tower.device); positions = torch.arange(rows, device=tower.device)
            for start in range(0, cut, 128):
                end = min(start + 128, cut)
                chunk = frames[start:end]
                hidden = backbone(inputs_embeds=tower.embed_backbone(chunk, backbone.embed(chunk[:, 0]))[None], input_pos=positions[start:end])[0].to(tower.device)
                paired = min(end, rows - 1)
                if paired > start: tower.prefill(hidden[: paired - start], positions[start:paired], frames[start:paired], frames[start + 1 : paired + 1])
            attn = [l.self_attn for l in backbone.model.layers if l.layer_type == 'full_attention']
            linear = [l.linear_attn for l in backbone.model.layers if l.layer_type != 'full_attention']
            towers = [l.transformer_layer.attention for l in (*tower.shared_layers, *tower.residual_layers)]
            self.prefixes[voice] = {'cut': cut, 'rows': prompt[: cut + 1].clone(),
                'attn': [(a.k_cache[:1, :, :cut].clone(), a.v_cache[:1, :, :cut].clone()) for a in attn],
                'linear': [(g.conv_state[:1].clone(), g.recurrent_state[:1].clone()) for g in linear],
                'tower': [(t.k_cache[:, :, :cut].clone(), t.v_cache[:, :, :cut].clone()) for t in towers]}
        print(f'prewarmed {voice[:8]} cut {cut}', flush=True)

    @modal.method()
    def compare(self, voice, lines, seed=11):
        """11/11 청취 비교: 예전(대사 줄마다 따로·줄마다 감정·요청마다 다른 무작위) vs 지금(한 묶음·첫 줄 감정·목소리 고정 씨앗). WAV 두 개."""
        import io, numpy as np, soundfile as sf, torch
        rate = self.codec.sample_rate
        def wav(parts):
            buf = io.BytesIO(); sf.write(buf, np.concatenate(parts), rate, format='WAV', subtype='PCM_16'); return buf.getvalue()
        def pcm(audio):
            data, _ = sf.read(io.BytesIO(audio), dtype='float32'); return data
        old = []
        for i, l in enumerate(lines):
            torch.manual_seed(seed + i * 7919)   # 예전엔 요청마다 무작위가 새로 시작됐다
            old.append(pcm(self.speak(delivery_text(l['text'], l), voice, seed=False)))
            old.append(np.zeros(int(rate * min(1.5, (l.get('delivery') or {}).get('pauseAfterMs', 300) / 1000)), dtype='float32'))
        joined = {'text': ' '.join(l['text'] for l in lines), 'delivery': lines[0].get('delivery')}
        new = pcm(self.speak(delivery_text(joined['text'], joined), voice))
        return {'old': wav(old), 'new': wav([new])}

    def generate(self, prompt, voice, max_new_tokens):
        """_decode 를 끝까지 돌린 결과(11/11 스트리밍 때문에 생성기로 나눔 — 계산은 그대로)."""
        for frames, rows, produced, done in self._decode(prompt, voice, max_new_tokens):
            if done: return frames[rows : rows + produced].cpu()

    def _decode(self, prompt, voice, max_new_tokens, every=0, key=None, other=None):
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
        # key 가 있으면 방·목소리 단위 저장소(이어 붙인 기억까지 읽은 상태), 없으면 목소리 단위(견본까지).
        store, name, limit = (self.session_prefixes, key, SESSION_PREFIXES) if key else (self.prefixes, voice, PREFIX_VOICES)
        def restore(saved):
            cut = saved['cut']
            for a, (k, v) in zip(attn, saved['attn']): a.k_cache[:1, :, :cut].copy_(k); a.v_cache[:1, :, :cut].copy_(v)
            for g, (c, r) in zip(linear, saved['linear']): g.conv_state[:1].copy_(c); g.recurrent_state[:1].copy_(r)
            for t, (k, v) in zip(towers, saved['tower']): t.k_cache[:, :, :cut].copy_(k); t.v_cache[:, :, :cut].copy_(v)
            return cut
        fits = lambda saved: bool(saved) and rows > saved['cut'] + 1 and torch.equal(prompt[: saved['cut'] + 1], saved['rows'])
        saved = store.get(name)
        # 방 단위는 기억이 턴마다 늘어난다 — 저장된 상태가 앞부분만 맞으면(지난 턴 하나가 더 붙음) 그 뒤만 이어 읽어 다시 저장한다.
        # 11/11 운영 확인: 이걸 안 해서 앞부분만 재사용하고 새로 붙은 턴(약 1,000줄)을 요청마다 다시 읽어 첫소리가 6초였다.
        longer = None
        if key and other is not None:
            common = next((i for i in range(min(len(other), rows)) if not torch.equal(other[i], prompt[i])), min(len(other), rows))
            longer = (common - 1) // 128 * 128
        if fits(saved) and (longer is None or saved['cut'] >= longer):
            cut = restore(saved)
            store.move_to_end(name)
            hit = True
        else:
            # 공통 머리말 = 서로 다른 두 글로 만든 프롬프트가 같은 줄까지(목소리 샘플·지시문·화자 표시, 이어 붙인 기억)
            if other is None:
                from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt
                ref_text, codes = self.reference(voice)
                other = build_drama3_prompt('<|speaker:0|>' + 'Zq', model.tokenizer, model.config, ['<|speaker:0|>' + ref_text], [codes])
            common = next((i for i in range(min(len(other), rows)) if not torch.equal(other[i], prompt[i])), min(len(other), rows))
            # 11/6: 끊는 자리를 fish-speech 의 읽기 단위(128줄) 경계로 — 경계가 다르면 계산이 미세하게 달라져 소리가 갈렸다(사용자 청취: 예전이 나음).
            # 경계를 맞추면 계산 순서가 generate_drama3 와 같아 같은 씨앗에서 예전과 똑같은 소리가 난다(bench 의 same_as_old).
            cut = (common - 1) // 128 * 128
            hit = False
            if cut > 0:
                # 방 단위 상태를 새로 만들 때도 견본까지는 목소리 단위 상태에서 되돌려 쓴다(견본 512줄을 다시 읽지 않는다). 둘 다 128줄 경계라 계산은 같다.
                base = saved if fits(saved) and saved['cut'] < cut else self.prefixes.get(voice) if key else None
                prefill(restore(base) if fits(base) and base['cut'] < cut else 0, cut)
                store[name] = {'cut': cut, 'rows': prompt[: cut + 1].clone(),
                    'attn': [(a.k_cache[:1, :, :cut].clone(), a.v_cache[:1, :, :cut].clone()) for a in attn],
                    'linear': [(g.conv_state[:1].clone(), g.recurrent_state[:1].clone()) for g in linear],
                    'tower': [(t.k_cache[:, :, :cut].clone(), t.v_cache[:, :, :cut].clone()) for t in towers]}
                while len(store) > limit: store.popitem(last=False)
            else: cut = 0
        hidden = prefill(cut, rows)
        print(f'prefill {rows} rows (reused {cut if hit else 0}) in {time.perf_counter() - started:.2f}s', flush=True)

        hidden = hidden[-1:]
        produced = 0
        t_start = time.perf_counter()
        if graphs is not None: graphs.start(hidden, rows - 1, frames[:rows], sampling['temperature'], sampling['top_k'], sampling['top_p'])
        if every: print(f'decode graphs.start {time.perf_counter() - t_start:.2f}s', flush=True)
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
            if every and produced % every == 0: yield frames, rows, produced, False   # 11/11 스트리밍: 중간 결과(계산 순서는 그대로)
            if graphs is None and step + 1 < max_new_tokens:
                hidden = backbone(inputs_embeds=tower.embed_backbone(sampled, backbone.embed(sampled[:, 0]))[None], input_pos=positions[position + 1 : position + 2])[0].to(tower.device)
        yield frames, rows, produced, True

    def speak_stream(self, text, voice, session=None, turn=None, _depth=0):
        """11/11 스트리밍(사용자: 첫소리가 늦다) — 만드는 대로 소리 조각(PCM16 모노)을 내보낸다. 생성 계산은 speak 와 같다(같은 씨앗 → 같은 프레임).
        코덱은 조각마다 앞 STREAM_CTX 프레임을 문맥으로 함께 풀고 새 부분만 보낸다 — 이음새가 전체를 한 번에 푼 것과 같은지는 stream_check 로 잰다.
        session 이 있으면 그 방의 지난 턴을 이어 붙이고(history), 끝난 뒤 합격한 소리를 기억에 넣는다. 소리 없이 시작하면(2초) 씨앗을 바꿔 다시 — 그때까지 보낸 것이 없어 듣는 쪽은 모른다."""
        import time, zlib, numpy as np, torch
        voice = voice or DEFAULT_VOICE
        limit, rate = frame_limit(text), self.codec.sample_rate
        history = self.history(session, voice, turn)
        pcm = lambda w: (np.clip(w, -1, 1) * 32767).astype('<i2').tobytes()
        for attempt in range(RETRIES):
            torch.manual_seed(zlib.crc32(voice.encode()) + attempt)   # attempt 0 = 목소리마다 같은 씨앗(11/11)
            sent, first, t0, quiet, held, loud, again, wave, codes = 0, True, time.perf_counter(), 0, [], False, False, None, None
            with torch.inference_mode():
                prompt, other = self.prompts(text, voice, history)
                for frames, rows, produced, done in self._decode(prompt, voice, limit, every=STREAM_FIRST, key=(session, voice) if history else None, other=other):
                    upto = produced if done else produced - STREAM_HOLD
                    if not done and upto - sent < (STREAM_FIRST if first else STREAM_EVERY): continue
                    if upto <= sent: continue
                    start = max(0, sent - STREAM_CTX)
                    t1 = time.perf_counter()
                    wave = self.codec_decode(frames[rows + start : rows + upto])
                    if start == 0: codes = frames[rows : rows + upto, 1:].T.clone()   # STREAM_CTX 가 커서 늘 처음부터 — wave 가 지금까지의 소리 전체다
                    if first: print(f'stream first chunk: {produced} frames at {t1 - t0:.2f}s, decode {time.perf_counter() - t1:.2f}s, history {len(history)}, attempt {attempt}', flush=True)
                    per = len(wave) // (upto - start)
                    chunk = wave[(sent - start) * per :]
                    sent, first = upto, False
                    # 11/11 안전망: 2초 넘게 소리가 없으면 말이 끝난 것 — 남은 침묵을 만들지 않고 멈춘다(견본 침묵을 흉내 내 1분 넘게 이어진 적이 있다).
                    quiet = quiet + len(chunk) if np.sqrt(np.mean(chunk ** 2)) < 0.004 else 0
                    if not loud:
                        if quiet:
                            if quiet > rate * 2: again = attempt < RETRIES - 1; break   # 소리 없이 시작 — 다시(마지막 시도면 그냥 끝)
                            held.append(chunk); continue
                        loud = True
                        for h in held: yield pcm(h)
                    if quiet > rate * 2:
                        yield pcm(chunk[: int(rate * 0.3)]); break
                    yield pcm(chunk)
            if again: print(f'silent start, retry {attempt + 1}', flush=True); continue
            if not loud and held: yield pcm(held[0][: int(rate * 0.3)])   # 끝까지 소리가 없었다 — 빈 응답 대신 짧은 침묵
            # 11/11 운영 확인: 지난 턴을 이어 붙인 턴이 대사 160자 중 앞부분만 읽고 끝났다(5.9초). 이미 내보낸 소리는 되돌릴 수 없으니 남은 대사를 이어서 만든다(한 번만).
            if loud and wave is not None and _depth == 0:
                n, _, cps = speech_stats(text, wave, rate)
                rest = rest_after(text, len(wave) / rate) if n >= 15 and cps > 7.5 else ''
                if rest:
                    print(f'ended early at {len(wave) / rate:.1f}s ({cps:.1f} chars/s), continuing', flush=True)
                    yield pcm(np.zeros(int(rate * 0.25), dtype='float32'))
                    yield from self.speak_stream(rest, voice, session, turn, _depth=1)
                    return
            if quiet and loud and codes is not None:   # 끝의 침묵은 기억에 넣지 않는다(다음 턴이 침묵을 흉내 낸다)
                drop = int(quiet // per); codes, wave = codes[:, : codes.shape[1] - drop], wave[: len(wave) - drop * per]
            if session and loud and wave is not None and codes is not None and _depth == 0:   # 이어 만든 뒷부분은 기억에 넣지 않는다(턴 전체가 아니다)
                try: print('remembered' if self.remember(session, voice, turn, text, codes, wave) else 'not remembered', flush=True)
                except Exception as e: print('remember failed', type(e).__name__, flush=True)
            return

    def speak_turn(self, lines, session=None, turn=None):
        """11/11 한 턴 통째로(사용자: 묶음이 아니라 1턴당 바로, 작품은 인물별 대사 전체를 만들어 잘라 쓰기).
        lines = 대화 순서의 대사 묶음 [{text, voice, delivery}] — 같은 사람이 이어 한 말은 이미 한 줄(앱 spokenSegments).
        목소리가 하나면 한 번에 합성하며 그대로 흘려보낸다. 여럿이면 목소리마다 그 턴의 대사를 전부 한 번에 합성하고,
        글자 수 비율 근처의 가장 조용한 곳에서 잘라 대화 순서대로 이어 보낸다(사이 쉼 = 앞 줄의 pauseAfterMs). 감정·말투는 줄마다(turn_text)."""
        import zlib, numpy as np, torch
        from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt
        groups = {}
        for i, l in enumerate(lines): groups.setdefault(l.get('voice') or DEFAULT_VOICE, []).append(i)
        pcm = lambda w: (np.clip(w, -1, 1) * 32767).astype('<i2').tobytes()
        rate = self.codec.sample_rate
        if len(groups) == 1:
            voice = next(iter(groups))
            yield from self.speak_stream(turn_text(lines), voice, session, turn)
            self.prepare_later(session, [voice])
            return
        # 11/11 첫소리를 먼저(사용자): 대화 순서대로 필요할 때 만든다 — 그 턴에 한 번만 말하는 인물은 만드는 대로 흘려보내고,
        # 여러 번 말하는 인물은 그 인물의 대사 전체를 한 번에 만든 뒤 잘라 첫 조각부터 보낸다. 뒤 인물은 앞 소리가 재생되는 동안 만든다.
        pieces = {}
        def make(voice, idx):
            text, tagged = ' '.join(lines[i]['text'] for i in idx), turn_text([lines[i] for i in idx])
            history = self.history(session, voice, turn)
            # 통째로 만든 뒤 자르는 길이라 다 듣고 판단할 수 있다 — 고장(무음·대사 건너뜀)이면 씨앗을 바꿔 다시.
            for attempt in range(RETRIES):
                torch.manual_seed(zlib.crc32(voice.encode()) + attempt)
                with torch.inference_mode():
                    prompt, other = self.prompts(tagged, voice, history)
                    for frames, rows, produced, done in self._decode(prompt, voice, frame_limit(text), key=(session, voice) if history else None, other=other):
                        if done: frames = frames[rows : rows + produced].cpu()
                    if len(frames) == 0: continue
                    whole = self.codec_decode(frames)
                if not broken(tagged, whole, rate): break
                print(f'broken turn piece, retry {attempt + 1}', flush=True)
            if len(frames) == 0: raise ValueError('Empty generated audio')
            try: self.remember(session, voice, turn, tagged, frames[:, 1:].T, whole)
            except Exception as e: print('remember failed', type(e).__name__, flush=True)
            wave = trim_tail(whole, rate)
            cuts = [0, *split_points(wave, [len(lines[i]['text']) for i in idx], rate), len(wave)]
            for k, i in enumerate(idx): pieces[i] = trim_tail(wave[cuts[k] : cuts[k + 1]], rate)
        for i, line in enumerate(lines):
            voice = line.get('voice') or DEFAULT_VOICE
            if len(groups[voice]) == 1: yield from self.speak_stream(turn_text([line]), voice, session, turn)
            else:
                if i not in pieces: make(voice, groups[voice])
                yield pcm(pieces.pop(i))
            if i < len(lines) - 1:
                pause = min(1.5, max(0.0, float((line.get('delivery') or {}).get('pauseAfterMs', 300)) / 1000))
                yield pcm(np.zeros(int(rate * pause), dtype='float32'))
        self.prepare_later(session, list(groups))

    def prepare_later(self, session, voices_used):
        """다음 턴용 상태를 뒤에서 준비시킨다(같은 컨테이너에 다음 일로 줄 선다). 실패해도 다음 턴이 요청 때 읽을 뿐이다."""
        if not session: return
        for voice in voices_used:
            try:
                if self.history(session, voice): Speaker().prepare.spawn(session, voice)
            except Exception as e: print('prepare spawn failed', type(e).__name__, flush=True)

    @modal.method()
    def session_check(self, texts, voice, session):
        """방 단위 기억 확인(11/11 밤): 같은 방의 턴들을 운영 경로(speak_stream) 그대로 순서대로 만들고, 턴 사이에 다음 턴 준비까지. 턴마다 WAV·첫소리 시간·준비 시간."""
        import io, time, numpy as np, soundfile as sf
        out = []
        for n, text in enumerate(texts, 1):
            t0, first, parts = time.perf_counter(), None, []
            for chunk in self.speak_stream(text, voice, session, f't{n}'):
                if first is None: first = time.perf_counter() - t0
                parts.append(np.frombuffer(chunk, '<i2'))
            total = time.perf_counter() - t0
            t1 = time.perf_counter(); prepared = self._prepare(session, voice); prep = time.perf_counter() - t1
            buf = io.BytesIO(); sf.write(buf, np.concatenate(parts) if parts else np.zeros(1, '<i2'), self.codec.sample_rate, format='WAV', subtype='PCM_16')
            mem = self.memory.get((session, voice), [])
            out.append({'wav': buf.getvalue(), 'first_s': round(first or 0, 2), 'total_s': round(total, 2), 'prepare_s': round(prep, 2), 'prepared': bool(prepared),
                        'remembered': [g['turn'] for g in mem], 'sims': [round(g['sim'], 3) for g in mem]})
        self.prepare_later(session, [voice])   # 뒤에서 준비시키는 호출 자체가 되는지(실패하면 로그에 prepare spawn failed)
        return out

    @modal.method()
    def stream_check(self, text, voice=None, seed=7):
        """스트리밍 이음새 확인(11/11): 같은 프레임을 한 번에 푼 소리와 조각으로 이어 붙인 소리를 비교한다. 문맥 길이·보류 프레임별 최대 차이."""
        import numpy as np, torch
        torch.manual_seed(seed)
        from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt
        ref_text, codes = self.reference(voice)
        with torch.inference_mode():
            prompt = build_drama3_prompt('<|speaker:0|>' + text, self.model.tokenizer, self.model.config, ['<|speaker:0|>' + ref_text], [codes])
            frames = self.generate(prompt, voice or DEFAULT_VOICE, frame_limit(text))
            full = self.codec_decode(frames)
            per = len(full) // len(frames)
            out = {'frames': len(frames), 'samples_per_frame': per, 'sample_rate': self.codec.sample_rate, 'full_samples': len(full)}
            def spec(w):
                t = torch.from_numpy(w).float()
                return torch.stft(t, 2048, 512, window=torch.hann_window(2048), return_complex=True).abs().clamp_min(1e-5).log10()
            ref = spec(full)
            again = self.codec_decode(frames)   # 같은 걸 두 번 풀어도 같은가(GPU 수치 흔들림 기준선)
            out['repeat_max_diff'] = float(np.abs(again - full).max())
            import time
            for ctx in (128, 256, 100000):
                for hold in (0,):
                    torch.cuda.synchronize(); t0 = time.perf_counter()
                    parts, sent, n = [], 0, len(frames)
                    marks = list(range(STREAM_FIRST + hold, n, STREAM_EVERY)) + [n]
                    for produced in marks:
                        upto = produced if produced == n else produced - hold
                        if upto <= sent: continue
                        start = max(0, sent - ctx)
                        wave = self.codec_decode(frames[start:upto])
                        parts.append(wave[(sent - start) * per :]); sent = upto
                    stitched = np.concatenate(parts)
                    torch.cuda.synchronize(); took = time.perf_counter() - t0
                    m = min(len(stitched), len(full))
                    d = (spec(stitched[:m]) - ref[:, : spec(stitched[:m]).shape[1]]).abs()
                    seams = [min(d.shape[1] - 1, (b * per) // 512) for b in range(STREAM_FIRST, n, STREAM_EVERY)]
                    out[f'ctx{ctx}_hold{hold}'] = {'max_diff': float(np.abs(stitched[:m] - full[:m]).max()), 'len_diff': int(len(stitched) - len(full)),
                        'spec_mean': round(float(d.mean()), 4), 'spec_seam': round(float(d[:, seams].mean()), 4) if seams else None, 'decode_s': round(took, 2), 'chunks': len(parts)}
        return out

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

        @api.post('/speak_stream')
        async def speak_stream(request: Request):
            """11/11 만드는 대로 PCM16 모노 조각을 흘려보낸다(x-sample-rate 헤더). 목소리가 없으면 첫 조각 전에 400."""
            from fastapi.responses import StreamingResponse
            if not hmac.compare_digest(request.headers.get('authorization', ''), f'Bearer {key}'): return Response(status_code=401)
            body = await request.json()
            text = str(body.get('text', '')).strip()[:600]
            if not text: return Response(b'empty text', status_code=400)
            try: self.reference(body.get('voice'))
            except Exception: return Response(b'voice not found', status_code=400)
            return StreamingResponse(self.speak_stream(delivery_text(text, body), body.get('voice')), media_type='audio/L16',
                                     headers={'x-sample-rate': str(self.codec.sample_rate), 'cache-control': 'no-store'})

        @api.post('/speak_turn')
        async def speak_turn(request: Request):
            """11/11 한 턴 통째: {lines:[{text, voice, delivery}]} → PCM16 조각(x-sample-rate). 목소리가 없으면 첫 조각 전에 400."""
            from fastapi.responses import StreamingResponse
            if not hmac.compare_digest(request.headers.get('authorization', ''), f'Bearer {key}'): return Response(status_code=401)
            body = await request.json()
            raw = body.get('lines') if isinstance(body.get('lines'), list) else []
            dict_or = lambda d: d if isinstance(d, dict) else {}
            lines = [{'text': str(l.get('text', '')).strip()[:1400], 'voice': l.get('voice'), 'delivery': dict_or(l.get('delivery')),
                      'parts': [{'text': str(p.get('text', '')).strip()[:1400], 'delivery': dict_or(p.get('delivery'))}
                                for p in (l.get('parts') if isinstance(l.get('parts'), list) else [])[:24] if isinstance(p, dict) and str(p.get('text', '')).strip()]}
                     for l in raw[:12] if isinstance(l, dict) and str(l.get('text', '')).strip()]
            if not lines: return Response(b'empty text', status_code=400)
            try:
                for l in lines: self.reference(l['voice'])
            except Exception: return Response(b'voice not found', status_code=400)
            # 11/11 밤 방 단위 기억: 앱이 방(session)과 메시지(turn) 식별자를 주면 같은 방의 지난 턴을 이어 받는다. 없으면 예전처럼 턴마다 새로.
            ident = lambda v: v if isinstance(v, str) and 0 < len(v) <= 64 and all(c.isalnum() or c in '-_' for c in v) else None
            return StreamingResponse(self.speak_turn(lines, ident(body.get('session')), ident(body.get('turn'))), media_type='audio/L16', headers={'x-sample-rate': str(self.codec.sample_rate), 'cache-control': 'no-store'})
        return api


# 회원 녹음 받기(10/31) — 앱 서버(Vercel)만 부른다. 브라우저 녹음(webm·mp4)을 44.1kHz 모노 wav 로 바꾸고 품질을 본 뒤
# 받아쓰기(faster-whisper small, CPU)로 화면 문장을 읽었는지 대조하고 /user-voices/<sha256>/{ref.wav,ref.txt} 로 둔다.
# 저장하자마자 GPU 가 미리 듣기를 만들기 시작한다(Speaker.preview). 이 함수는 GPU 를 쓰지 않는다.
def delivery_text(text, body):
    """앱이 대사마다 붙인 감정·말투·빠르기·세기(delivery)를 맨 앞 괄호 지시로 — [sad, gentle, slow speech] 대사.
    예전 Fish 게이트웨이(drama3_fullft/miro_contract.py)와 같은 표. 10/30 서버가 이걸 빠뜨려 delivery 가 버려지고 있었다(10/31 수정).
    대사 사이 쉼(pauseAfterMs)은 앱 재생기가 직접 둔다."""
    from drama3_fullft.miro_contract import DELIVERY_TAGS
    if not EMOTION_TAGS: return text
    d = body.get('delivery') if isinstance(body.get('delivery'), dict) else {}
    if body.get('style') == 'whisper' and 'tone' not in d: d = {**d, 'tone': 'whisper'}
    # 신음이 있는 줄은 흥분한 상태라 말이 빨라진다(10/31 사용자) — AI 가 일부러 느리게(slow) 고른 줄만 그대로 둔다
    if '[moaning' in text and d.get('pace', 'normal') == 'normal': d = {**d, 'pace': 'fast'}
    # 11/11 신음 줄에 속삭임을 같이 걸면 신음이 눌려 거의 안 들렸다(운영 대사가 거의 다 whisper+moaning) — 신음 줄은 속삭임을 뺀다.
    if '[moaning' in text and d.get('tone') == 'whisper': d = {**d, 'tone': 'normal'}
    tags = [DELIVERY_TAGS[f].get(d.get(f), '') for f in DELIVERY_TAGS]
    tags = [t for t in tags if t]
    return ('[' + ', '.join(tags) + '] ' if tags else '') + text


def turn_text(lines):
    """11/11 여러 줄을 한 번에 합성할 때 줄마다 감정 지시를 그 줄 앞에 — 바뀔 때만 다시 쓴다(같으면 이어 읽기).
    예전엔 첫 줄 감정 하나가 턴 전체에 걸려, 갑자기 만져서 놀라는 줄도 앞의 차분한 감정으로 읽혔다."""
    out, prev = [], None
    for l in lines:
        for p in l.get('parts') or [l]:
            tagged = delivery_text(p['text'], p)
            tag = tagged[: len(tagged) - len(p['text'])]
            out.append(tagged if tag != prev else p['text']); prev = tag
    return ' '.join(out)

if __name__ == '__main__':   # python modal_drama3_serve.py — 감정이 바뀌는 줄에만 지시 · 고장 판별
    import numpy as _np
    _t = '오늘은 날씨가 참 좋아서 산책을 다녀왔어요. 기분이 좋네요.'; _r = 44100
    _tone = lambda secs: (0.2 * _np.sin(2 * _np.pi * 220 * _np.arange(int(_r * secs)) / _r)).astype('float32')
    assert healthy(_t, _tone(6), _r) and not healthy(_t, _tone(6) * 0.001, _r) and not healthy(_t, _tone(1.5), _r) and not healthy(_t, _tone(40), _r)
    assert rest_after('가나다라마바사. 아자차카타파하! 거너더러머버서어.', 1.0) == '아자차카타파하! 거너더러머버서어.' and rest_after('가나다라마바사.', 1.0) == ''
    assert not broken('응, 알았어.', _tone(1.2), _r) and broken('응, 알았어.', _tone(1.2) * 0.001, _r) and not healthy('응, 알았어.', _tone(1.2), _r)
    assert turn_text([{'text': 'a', 'parts': [{'text': 'a', 'delivery': {}}, {'text': 'b', 'delivery': {'emotion': 'anxious'}}, {'text': 'c', 'delivery': {'emotion': 'anxious'}}]}]) == ('a [anxious] b c' if EMOTION_TAGS else 'a b c')

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

@app.cls(image=modal.Image.debian_slim(python_version='3.12').apt_install('ffmpeg').pip_install('fastapi[standard]', 'numpy<2', 'soundfile', 'faster-whisper')
         # 11/11 회원 녹음 배경 제거(voice_clean, Demucs) — CPU 판 torch 와 모델 무게를 이미지에 미리 받아 둔다
         .pip_install('torch==2.8.0', 'torchaudio==2.8.0', index_url='https://download.pytorch.org/whl/cpu').pip_install('demucs==4.0.1')
         .run_commands("python -c \"from demucs.pretrained import get_model; get_model('htdemucs')\"")
         # 모델을 이미지에 미리 받아 둔다(run_function 은 이 파일을 통째로 불러 Drama 3 모듈이 없어 실패)
         .run_commands("python -c \"from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')\"")
         # 이 파일이 맨 위에서 modal_drama3_compare 를 불러서, 컨테이너에도 같이 넣어야 켜진다(10/31: 빠져 있어 켜질 때마다 죽었다)
         .add_local_python_source('drama3_fullft', 'modal_drama3_compare', 'voice_clean'),
         cpu=8, memory=8192, volumes={USER_VOICES: user_voices, '/voices': voices}, secrets=[modal.Secret.from_name('miro-drama3-tts')],
         timeout=180, max_containers=2, scaledown_window=120, enable_memory_snapshot=True)
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
                # 11/11 배경 제거 — 합성 모델은 견본의 배경음악·잡음·긴 침묵까지 흉내 낸다. 원본은 ref.orig.wav 로 남긴다(받아쓰기도 원본으로).
                from voice_clean import clean_reference
                cleaned, background_db, clean_rate = clean_reference(wave.astype('float32'), rate)
                if len(cleaned) < clean_rate * 3 or float(np.sqrt(np.mean(cleaned ** 2))) < 0.01: return {'error': 'quiet'}   # 목소리가 거의 없는 녹음(음악만 등)
                os.makedirs(f'{USER_VOICES}/{vid}', exist_ok=True)
                open(f'{USER_VOICES}/{vid}/ref.orig.wav', 'wb').write(data)
                sf.write(f'{USER_VOICES}/{vid}/ref.wav', cleaned, clean_rate, subtype='PCM_16')
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
            return {'id': vid, 'seconds': round(seconds, 1), 'cer': round(score, 2), 'background_db': round(background_db, 1)}

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
