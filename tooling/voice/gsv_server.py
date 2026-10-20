"""
몰입 모드 음성 합성 서버 — GPT-SoVITS v2 판(참고 구현 server.py 와 같은 계약, 엔진만 다르다).
앱(apps/web/app/api/tts)은 MIRO_TTS_URL 로 이 계약만 안다:

  POST /speak   {"text": "...", "voice": "<id>|null", "language": "ko"}  → audio/wav
  GET  /health  → {"ok": true, "voices": [...]}

목소리 = --voices-dir 안의 폴더 하나:  <id>/ref.wav(3~10초 참조) + <id>/ref.txt(그 참조의 대사)
      + 선택 <id>/gpt.ckpt·<id>/sovits.pth(파인튜닝 가중치, 없으면 v2 기본 가중치로 zero-shot).
voice 가 없거나 null 이면 --default-voice 폴더.

실행(~/GPT-SoVITS 의 venv 로):
  cd ~/GPT-SoVITS && ./venv/bin/python ~/Desktop/Miro/tooling/voice/gsv_server.py --voices-dir ~/.miro/voices/gsv/voices --default-voice default --port 8787

ponytail: 요청을 한 번에 하나씩(모델이 하나, CPU) — 사용자가 늘면 GPU 서버에서 이 파일 그대로 워커만 늘린다.
"""
import argparse
import io
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LANGS = {'ko', 'en', 'ja', 'zh'}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--gsv-root', default=os.path.expanduser('~/GPT-SoVITS'))
    p.add_argument('--voices-dir', required=True)
    p.add_argument('--default-voice', default='default')
    p.add_argument('--port', type=int, default=8787)
    p.add_argument('--api-key', default=os.environ.get('MIRO_TTS_API_KEY', ''))
    p.add_argument('--version', default='v2', help='tts_infer.yaml 의 섹션(v2 = 한국어 기본 가중치)')
    args = p.parse_args()

    root = os.path.abspath(args.gsv_root)
    os.chdir(root)  # TTS_Config 의 상대 경로(GPT_SoVITS/pretrained_models/…)가 여기 기준이다
    for sub in ('', 'GPT_SoVITS', 'tools'):
        sys.path.insert(0, os.path.join(root, sub))
    import numpy as np
    import soundfile
    from GPT_SoVITS.TTS_infer_pack.TTS import TTS, TTS_Config

    cfg = TTS_Config('GPT_SoVITS/configs/tts_infer.yaml')
    cfg.update_version(args.version) if hasattr(cfg, 'update_version') else None
    tts = TTS(cfg)
    base = {'gpt': cfg.t2s_weights_path, 'sovits': cfg.vits_weights_path}
    loaded = dict(base)
    lock = threading.Lock()
    voices_dir = os.path.abspath(os.path.expanduser(args.voices_dir))

    def voice_dir(name):
        ok = isinstance(name, str) and name and all(c.isalnum() or c in '-_' for c in name)
        d = os.path.join(voices_dir, name) if ok else ''
        return d if os.path.isfile(os.path.join(d, 'ref.wav')) else os.path.join(voices_dir, args.default_voice)

    def use_weights(d):
        """목소리 폴더에 파인튜닝 가중치가 있으면 그걸로, 없으면 기본으로 — 바뀔 때만 다시 올린다."""
        want = {'gpt': os.path.join(d, 'gpt.ckpt'), 'sovits': os.path.join(d, 'sovits.pth')}
        for k in want:
            if not os.path.isfile(want[k]):
                want[k] = base[k]
        if want['gpt'] != loaded['gpt']:
            tts.init_t2s_weights(want['gpt']); loaded['gpt'] = want['gpt']
        if want['sovits'] != loaded['sovits']:
            tts.init_vits_weights(want['sovits']); loaded['sovits'] = want['sovits']

    def synth(text, name, lang):
        d = voice_dir(name)
        with open(os.path.join(d, 'ref.txt'), encoding='utf-8') as f:
            prompt = f.read().strip()
        use_weights(d)
        req = {'text': text, 'text_lang': lang, 'ref_audio_path': os.path.join(d, 'ref.wav'), 'prompt_text': prompt, 'prompt_lang': 'ko',
               'text_split_method': 'cut5', 'batch_size': 1, 'speed_factor': 1.0, 'streaming_mode': False, 'parallel_infer': True, 'return_fragment': False}
        sr, parts = 32000, []
        for sr, chunk in tts.run(req):
            parts.append(chunk)
        audio = np.concatenate(parts) if parts else np.zeros(sr // 2, dtype=np.int16)
        buf = io.BytesIO()
        soundfile.write(buf, audio, sr, format='WAV', subtype='PCM_16')
        return buf.getvalue()

    class H(BaseHTTPRequestHandler):
        def _send(self, status, body, ctype):
            self.send_response(status); self.send_header('content-type', ctype); self.send_header('content-length', str(len(body))); self.end_headers(); self.wfile.write(body)

        def do_GET(self):
            if self.path != '/health':
                return self._send(404, b'', 'text/plain')
            names = sorted(n for n in os.listdir(voices_dir) if os.path.isfile(os.path.join(voices_dir, n, 'ref.wav'))) if os.path.isdir(voices_dir) else []
            self._send(200, json.dumps({'ok': True, 'engine': 'gpt-sovits', 'version': args.version, 'voices': names}).encode(), 'application/json')

        def do_POST(self):
            if self.path != '/speak':
                return self._send(404, b'', 'text/plain')
            if args.api_key and self.headers.get('authorization') != f'Bearer {args.api_key}':
                return self._send(401, b'', 'text/plain')
            try:
                req = json.loads(self.rfile.read(int(self.headers.get('content-length', '0'))))
                text = str(req.get('text', '')).strip()[:1200]
                lang = req.get('language') if req.get('language') in LANGS else 'ko'
                if not text:
                    return self._send(400, b'empty text', 'text/plain')
                with lock:
                    wav = synth(text, req.get('voice'), lang)
                print(f"speak voice={os.path.basename(voice_dir(req.get('voice')))} chars={len(text)}", flush=True)
                self._send(200, wav, 'audio/wav')
            except Exception as e:  # noqa: BLE001 — 한 요청의 실패가 서버를 죽이지 않게
                import traceback; traceback.print_exc()
                self._send(500, str(e).encode(), 'text/plain')

        def log_message(self, fmt, *a):  # 대사 내용은 로그에 남기지 않는다
            print(f'{self.command} {self.path} {a[1] if len(a) > 1 else ""}', flush=True)

    print(f'gsv tts server :{args.port} version={args.version} device={cfg.device} voices={voices_dir}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', args.port), H).serve_forever()


if __name__ == '__main__':
    main()
