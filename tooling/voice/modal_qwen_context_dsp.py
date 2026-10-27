"""Explicit signal-control fallback, separate from learned acting claims."""
import json
from pathlib import Path
import modal
from modal_qwen_conditioned import image as base_image
image=base_image.add_local_python_source('modal_qwen_conditioned','modal_qwen_bottleneck')
app=modal.App('miro-qwen-context-signal-control')
voices=modal.Volume.from_name('miro-voices');cache=modal.Volume.from_name('miro-voxcpm2-cache')


@app.function(image=image,gpu='L4',memory=16384,timeout=600,retries=0,volumes={'/voices':voices,'/cache':cache})
def run(raw,plans):
    import hashlib,re,subprocess,zipfile
    import numpy as np,soundfile as sf
    from faster_whisper import WhisperModel
    p=Path('/voices/_qwen_context/007-20261023-signal-control');p.mkdir(parents=True,exist_ok=True);(p/'baseline_clone.wav').write_bytes(raw)
    asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/cache/asr')
    segments,_=asr.transcribe(str(p/'baseline_clone.wav'),language='ko',beam_size=5,vad_filter=False,word_timestamps=True);words=[{'text':w.word,'start':w.start,'end':w.end,'probability':w.probability} for s in segments for w in s.words]
    norm=lambda x:re.sub('[^가-힣]','',x);target=plans['items'][0]['case']['text'];assert ''.join(norm(w['text']) for w in words)==norm(target)
    phrase_texts=plans['items'][0]['case']['required_phrases'];bounds=[];offset=0;word_start=0
    cumulative=np.cumsum([len(norm(w['text'])) for w in words]).tolist()
    y,sr=sf.read(p/'baseline_clone.wav');assert sr==24000
    for part in phrase_texts:
        offset+=len(norm(part));last=cumulative.index(offset)
        lo=max(0,words[word_start]['start']-.04);hi=min(len(y)/sr,words[last]['end']+.06)
        if word_start:lo=max(lo,(words[word_start-1]['end']+words[word_start]['start'])/2)
        if last+1<len(words):hi=min(hi,(words[last]['end']+words[last+1]['start'])/2)
        assert hi-lo>.15;bounds.append({'text':part,'start':lo,'end':hi});word_start=last+1
    report={'method':'explicit signal processing of fixed original Qwen clone','learned_acting':False,'source_sha256':hashlib.sha256(raw).hexdigest(),'words_estimated_by_whisper':words,'phrase_bounds':bounds,'items':[],'phonation_or_pitch_control':False}
    for item in plans['items']:
        pieces=[np.zeros(round(sr*.12))];controls=[]
        for i,(part,bound) in enumerate(zip(item['plan']['phrases'],bounds)):
            assert norm(part['text'])==norm(bound['text']);core=y[round(bound['start']*sr):round(bound['end']*sr)];rate=part['rate_relative_to_character']
            source=p/f'core_{i}.wav';dest=p/f'tempo_{i}.wav';sf.write(source,core,sr,subtype='FLOAT')
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-af',f'atempo={rate}','-c:a','pcm_f32le',str(dest)],check=True)
            z,dsr=sf.read(dest);assert dsr==sr
            time=np.linspace(0,1,len(z));db=np.interp(time,[0,.5,1],[part['energy_start_db'],part['energy_mid_db'],part['energy_end_db']]);z=z*10**(db/20)
            fade=min(round(sr*.005),len(z)//4);z[:fade]*=np.linspace(0,1,fade);z[-fade:]*=np.linspace(1,0,fade)
            begin=sum(len(x) for x in pieces)/sr;pieces.append(z)
            controls.append({'text':part['text'],'requested_rate':rate,'realized_duration_rate':len(core)/len(z),'core_source_seconds':len(core)/sr,'output_seconds':len(z)/sr,'energy_start_mid_end_db':[part['energy_start_db'],part['energy_mid_db'],part['energy_end_db']],'output_start':begin,'output_end':begin+len(z)/sr,'pause_after_ms':part['pause_after_ms']})
            pieces.append(np.zeros(round(sr*part['pause_after_ms']/1000)))
        pieces.append(np.zeros(round(sr*.12)));z=np.concatenate(pieces);name=item['case']['id']+'_signal.wav';sf.write(p/name,z,sr,subtype='FLOAT')
        if np.max(np.abs(z))>=1:raise ValueError('Fallback peak would clip; do not serve without common playback gain')
        segments,_=asr.transcribe(str(p/name),language='ko',beam_size=5,vad_filter=False);hyp=' '.join(s.text.strip() for s in segments)
        report['items'].append({'file':name,'context':item['case']['id'],'text':target,'transcript':hyp,'exact_asr_match':norm(hyp)==norm(target),'controls':controls,'duration_seconds':len(z)/sr,'peak':float(np.max(np.abs(z)))})
    (p/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(p/'context_plans.json').write_text(json.dumps(plans,ensure_ascii=False,indent=2))
    with zipfile.ZipFile(p/'results.zip','w',zipfile.ZIP_DEFLATED) as z:
        for name in ['baseline_clone.wav','comfort_signal.wav','contained_anger_signal.wav','relief_signal.wav','report.json','context_plans.json']:z.write(p/name,name)
    voices.commit();cache.commit();return report


@app.local_entrypoint()
def main(folder:str,baseline:str,plans:str):
    p=Path(folder);p.mkdir(parents=True,exist_ok=True);r=run.remote(Path(baseline).read_bytes(),json.loads(Path(plans).read_text()));(p/'report.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(json.dumps(r,ensure_ascii=False,indent=2))
