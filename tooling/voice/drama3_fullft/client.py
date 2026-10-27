"""Server-side Miro caller of a private native Fish server; no browser API keys."""
import argparse,json,os,re,urllib.request
from pathlib import Path
import msgpack


def build_request(text,reference_id,direction='',seed=1234):
    if not text.strip() or len(text)>2000:raise ValueError('Text must contain1–2000characters')
    if not re.fullmatch(r'[A-Za-z0-9_\- ]{1,255}',reference_id):raise ValueError('Invalid registered voice ID')
    if any(t in text+direction for t in ['<|im_start|>','<|im_end|>','<|voice|>','<|semantic:']):raise ValueError('Reserved model control tokens')
    return {'text':('['+direction+'] ' if direction else '')+text,'reference_id':reference_id,
            'seed':seed,'format':'wav','streaming':False,'use_memory_cache':'on',
            'single_chunk':False,'max_new_tokens':0,'temperature':.7,'top_p':.7}


def synthesize(base,key,request):
    payload=msgpack.packb(request,use_bin_type=True)
    req=urllib.request.Request(base.rstrip('/')+'/v1/tts',data=payload,headers={
        'Content-Type':'application/msgpack','Authorization':'Bearer '+key})
    with urllib.request.urlopen(req,timeout=180) as response:
        audio=response.read()
        if not audio.startswith(b'RIFF') or audio[8:12]!=b'WAVE':raise ValueError('Backend did not return WAV audio')
        return audio


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--text',required=True);ap.add_argument('--voice',required=True)
    ap.add_argument('--direction',default='');ap.add_argument('--output',required=True);a=ap.parse_args()
    body=build_request(a.text,a.voice,a.direction)
    result=synthesize(os.environ.get('MIRO_VOICE_URL','http://127.0.0.1:8788'),os.environ['MIRO_VOICE_API_KEY'],body)
    Path(a.output).write_bytes(result);print(a.output)
