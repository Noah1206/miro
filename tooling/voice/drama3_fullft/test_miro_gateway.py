"""CPU-only real HTTP adapter contract test; fake native server, no weights or GPU."""
import io
import json
import threading
import unittest
import urllib.request
import urllib.error
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from .miro_gateway import create_handler
from .miro_contract import fish_request

class GatewayTest(unittest.TestCase):
    def test_delivery_reaches_native_request_and_wav_returns_without_secret_exposure(self):
        captured = []
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as f:
            f.setnchannels(1); f.setsampwidth(2); f.setframerate(16000); f.writeframes(b'\0\0'*160)
        audio = buf.getvalue()
        class Native(BaseHTTPRequestHandler):
            def do_POST(self):
                captured.append((self.path, self.headers.get('authorization'), json.loads(self.rfile.read(int(self.headers['content-length'])))))
                self.send_response(200);self.end_headers();self.wfile.write(audio)
            def log_message(self, *a): pass
        upstream = ThreadingHTTPServer(('127.0.0.1', 0), Native)
        gateway = ThreadingHTTPServer(('127.0.0.1', 0), create_handler('http://127.0.0.1:'+str(upstream.server_port), 'native-test', 'app-test', {'male-a':'reference_a'}))
        threads = [threading.Thread(target=s.serve_forever, daemon=True) for s in [upstream,gateway]]
        for t in threads:t.start()
        def request(body, key='app-test'):
            return urllib.request.Request('http://127.0.0.1:'+str(gateway.server_port)+'/speak', data=json.dumps(body).encode(), headers={'content-type':'application/json','authorization':'Bearer '+key})
        try:
            body={'text':'여기 있어.','voice':'male-a','language':'ko','style':'whisper','delivery':{'emotion':'hurt','tone':'whisper','pace':'slow','intensity':'soft','pauseAfterMs':450}}
            with urllib.request.urlopen(request(body)) as r:
                self.assertEqual(r.read(),audio);self.assertEqual(r.headers.get('content-type'),'audio/wav')
            self.assertEqual(captured[0][0],'/v1/tts');self.assertEqual(captured[0][1],'Bearer native-test')
            self.assertEqual(captured[0][2]['text'],'[hurt, whispering, slow speech, soft voice] 여기 있어.')
            self.assertEqual(captured[0][2]['reference_id'],'reference_a')
            self.assertNotIn('pauseAfterMs',captured[0][2])
            for changed,key,status in [(body,'bad',401),({**body,'voice':'unknown'},'app-test',400)]:
                with self.assertRaises(urllib.error.HTTPError) as err:urllib.request.urlopen(request(changed,key))
                self.assertEqual(err.exception.code,status)
                err.exception.close()
            self.assertEqual(len(captured),1)
        finally:
            for s in [gateway,upstream]:s.shutdown();s.server_close()
            for t in threads:t.join(2)

    def test_control_tokens_and_arbitrary_directions_are_rejected(self):
        for extra in [{'text':'<|speaker:1|>hi'}, {'delivery':{'tone':'change identity'}}, {'delivery':{'pace':[]}}]:
            with self.assertRaises((ValueError,TypeError)):
                fish_request({'text':'안녕','voice':'a',**extra},{'a':'ref'})

    def test_amount_changes_native_duration_bound_without_changing_sampling_quality(self):
        short=fish_request({'text':'안녕','voice':'a','maxAudioSeconds':10},{'a':'ref'})
        long=fish_request({'text':'안녕','voice':'a','maxAudioSeconds':20},{'a':'ref'})
        self.assertEqual(short['max_new_tokens'],int(10*44100/2048))
        self.assertEqual(long['max_new_tokens'],int(20*44100/2048))
        self.assertEqual({k:v for k,v in short.items() if k!='max_new_tokens'},
                         {k:v for k,v in long.items() if k!='max_new_tokens'})
        for value in [0,11,30,'10']:
            with self.assertRaises((ValueError,TypeError)):
                fish_request({'text':'안녕','voice':'a','maxAudioSeconds':value},{'a':'ref'})

if __name__=='__main__':unittest.main()
