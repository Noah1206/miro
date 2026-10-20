"""
몰입 모드 음성 합성 서버 — 참고 구현(표준 라이브러리 + chatterbox_engine 의 모델). 앱은 MIRO_TTS_URL 로 이 계약만 안다.

  POST /speak   {"text": "...", "voice": "<provider_voice_id>|null", "language": "ko"}  → audio/wav
  GET  /health  → {"ok": true, "voices": n}

voice 는 --voices-dir 안의 <provider_voice_id>.pt(prepare 로 만든 Conditionals). 없거나 null 이면 --default-voice.
  python server.py --voices-dir voices --default-voice voices/base.pt --port 8787 [--api-key KEY] [--device cuda]

ponytail: 요청을 한 번에 하나씩 처리한다(모델이 하나) — 동시 사용자가 늘면 워커를 늘리거나 큐를 둔다.
"""
import argparse
import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from chatterbox_engine import checkpoint

LANGS = {'ko', 'en', 'ja', 'zh'}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--voices-dir', required=True)
    p.add_argument('--default-voice', required=True)
    p.add_argument('--port', type=int, default=8787)
    p.add_argument('--api-key', default=os.environ.get('MIRO_TTS_API_KEY', ''))
    p.add_argument('--device', default='auto')
    args = p.parse_args()

    import soundfile
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, Conditionals
    device = args.device if args.device != 'auto' else ('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')
    model = ChatterboxMultilingualTTS.from_local(checkpoint(download=False), device)
    lock = threading.Lock()
    conds: dict[str, object] = {}

    def voice(name: str | None):
        path = os.path.join(args.voices_dir, f'{name}.pt') if name and name.replace('_', '').replace('-', '').isalnum() else ''
        if not os.path.isfile(path):
            path = args.default_voice
        if path not in conds:
            conds[path] = Conditionals.load(path, map_location='cpu').to(device)
        return conds[path]

    class H(BaseHTTPRequestHandler):
        def _send(self, status: int, body: bytes, ctype: str) -> None:
            self.send_response(status); self.send_header('content-type', ctype); self.send_header('content-length', str(len(body))); self.end_headers(); self.wfile.write(body)

        def do_GET(self) -> None:
            if self.path != '/health':
                return self._send(404, b'', 'text/plain')
            n = len([f for f in os.listdir(args.voices_dir) if f.endswith('.pt')]) if os.path.isdir(args.voices_dir) else 0
            self._send(200, json.dumps({'ok': True, 'voices': n, 'device': device}).encode(), 'application/json')

        def do_POST(self) -> None:
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
                    model.conds = voice(req.get('voice'))
                    wav = model.generate(text, language_id=lang)
                buf = io.BytesIO()
                soundfile.write(buf, wav.squeeze(0).cpu().numpy(), model.sr, format='WAV')
                self._send(200, buf.getvalue(), 'audio/wav')
            except Exception as e:  # noqa: BLE001 — 한 요청의 실패가 서버를 죽이지 않게
                self._send(500, str(e).encode(), 'text/plain')

        def log_message(self, fmt, *a):  # 글 내용은 로그에 남기지 않는다
            print(f'{self.command} {self.path} {a[1] if len(a) > 1 else ""}', flush=True)

    print(f'tts server :{args.port} device={device}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', args.port), H).serve_forever()


if __name__ == '__main__':
    main()
