"""Private CPU adapter for Miro's existing/speak contract and a native Fish server.

Only running main starts an HTTP listener. It never starts a GPU, registers a
voice, launches Modal, or downloads weights. Configure a private, already-running
Fish endpoint and an explicit voice registry before using it.
"""
import hmac
import json
import os
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from .miro_contract import fish_request


def create_handler(base_url, upstream_key, app_key, registry, default_voice=None):
    if not upstream_key or not app_key:
        raise ValueError('Both server-owned API keys are required')
    gate = threading.BoundedSemaphore(1)

    class Handler(BaseHTTPRequestHandler):
        def send(self, code, payload=b'', content_type='application/json'):
            self.send_response(code)
            self.send_header('content-type', content_type)
            self.send_header('cache-control', 'private, no-store')
            self.send_header('content-length', str(len(payload)))
            self.end_headers()
            try:
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_POST(self):
            if self.path != '/speak':
                return self.send(404)
            if not hmac.compare_digest(self.headers.get('authorization', ''), 'Bearer '+app_key):
                return self.send(401)
            try:
                size = int(self.headers.get('content-length', '0'))
                if not 0 < size <= 16384:
                    raise ValueError('Invalid request size')
                body = json.loads(self.rfile.read(size))
                native = fish_request(body, registry, default_voice=default_voice)
            except (ValueError, TypeError):
                return self.send(400)
            if not gate.acquire(blocking=False):
                return self.send(429)
            try:
                request = urllib.request.Request(base_url.rstrip('/')+'/v1/tts',
                    data=json.dumps(native, ensure_ascii=False).encode(),
                    headers={'content-type': 'application/json', 'authorization': 'Bearer '+upstream_key})
                with urllib.request.urlopen(request, timeout=165) as response:
                    audio = response.read(16*1024*1024+1)
                if len(audio) > 16*1024*1024 or not audio.startswith(b'RIFF') or audio[8:12] != b'WAVE':
                    raise ValueError('Expected bounded WAV response')
                self.send(200, audio, 'audio/wav')
            except Exception:
                self.send(502)
            finally:
                gate.release()

        def log_message(self, *args):
            # No dialogue, key, voice recordings or provider error body in logs.
            pass
    return Handler


def main():
    registry = json.loads(Path(os.environ['MIRO_TTS_VOICE_REGISTRY_FILE']).read_text())
    handler = create_handler(os.environ['MIRO_VOICE_URL'], os.environ['MIRO_VOICE_API_KEY'],
        os.environ['MIRO_TTS_API_KEY'], registry, os.environ.get('MIRO_TTS_DEFAULT_VOICE'))
    ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('MIRO_TTS_GATEWAY_PORT', '8789'))), handler).serve_forever()


if __name__ == '__main__':
    main()
