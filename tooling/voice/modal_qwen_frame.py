"""Bounded actor007 frame-control training and three-context comparison."""
import json
from pathlib import Path
import modal
from modal_qwen_conditioned import image as base_image
image=base_image.add_local_python_source('modal_qwen_conditioned','modal_qwen_bottleneck','qwen_phrase_data','qwen_phrase_train','qwen_frame_control')
app=modal.App('miro-qwen-007-frame-context')
voices=modal.Volume.from_name('miro-voices');cache=modal.Volume.from_name('miro-voxcpm2-cache')


@app.function(image=image,gpu='A100-80GB',memory=32768,timeout=3600,retries=0,volumes={'/voices':voices,'/cache':cache})
def run(manifest,prepared,benchmark,sources):
    import gc,hashlib,random,re,subprocess,traceback,zipfile
    import numpy as np
    import torch,soundfile as sf
    from huggingface_hub import snapshot_download,model_info
    voices.reload();out=Path('/voices')/manifest['remote_output'];out.mkdir(parents=True,exist_ok=True)
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));(out/'prepared.json').write_text(json.dumps(prepared,ensure_ascii=False));(out/'context_benchmark.json').write_text(json.dumps(benchmark,ensure_ascii=False,indent=2))
    for name,source in sources.items():(out/name).write_text(source)
    report={'status':'starting','items':[],'errors':[],'production_approved':False,'waveform_postprocessing':False,'gpu':torch.cuda.get_device_name(),'source_sha256':{name:hashlib.sha256(s.encode()).hexdigest() for name,s in sources.items()}}
    def status(s):
        report['status']=s;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));voices.commit();print('FRAME_STATUS',s,len(report['items']),flush=True)
    try:
        if manifest.get('reuse_training_output'):
            import shutil
            training_out=Path(manifest['reuse_training_output'])
            for name in ['training_history.json','adapter.pt','prefix_check.json','train.log']:
                shutil.copy2(training_out/name,out/name)
            report['reused_training_output']=str(training_out)
        else:
            training_out=out
            status('training')
            with (out/'train.log').open('w') as log:subprocess.run(['python',str(out/'qwen_frame_train.py'),'--folder',str(out)],stdout=log,stderr=subprocess.STDOUT,timeout=1800,check=True)
        history=json.loads((out/'training_history.json').read_text());status('planning_contexts')
        if manifest.get('provided_context_plans'):
            context_plans=manifest['provided_context_plans'];plans=context_plans['items']
            from qwen_frame_control import validate_plan,planned_features,FrameAdapter,GenerationControl
            for item in plans:validate_plan(item['plan'],item['case']['text'])
            (out/'context_plans.json').write_text(json.dumps(context_plans,ensure_ascii=False,indent=2))
            status('generating')
        else:
            from transformers import AutoModelForCausalLM,AutoTokenizer
            from qwen_frame_control import validate_plan,planned_features,FrameAdapter,GenerationControl
            model_id='Qwen/Qwen3-4B-Instruct-2507';revision=model_info(model_id).sha
            planner=AutoModelForCausalLM.from_pretrained(model_id,revision=revision,torch_dtype=torch.bfloat16,device_map='cuda:0',attn_implementation='sdpa');tok=AutoTokenizer.from_pretrained(model_id,revision=revision)
            system='''당신은 한국어 캐릭터 대사의 연기 감독이다. 앞 대화, 장면, 관계, 인물의 의도에 따라 연기를 정한다. 분노=큰소리, 슬픔=느림 같은 고정 공식을 피한다. 원문의 단어를 바꾸거나 더하지 않는다. 출력은 JSON만 쓴다.
    형식: {"evidence":"장면에 근거한 짧은 설명","inner_emotion":"내면 감정","outward_delivery":"겉으로 드러나는 연기","phrases":[{"text":"괜찮아.","rate_relative_to_character":0.9,"energy_start_db":-2,"energy_mid_db":-1,"energy_end_db":-3,"pause_after_ms":250},{"text":"나 여기 있어.","rate_relative_to_character":1.0,"energy_start_db":-1,"energy_mid_db":0,"energy_end_db":-2,"pause_after_ms":0}]}
    위 숫자를 베끼지 말고 장면을 보고 결정하라. required_phrases에 지정한 구절을 합치거나 나누지 말고 각각 독립 항목으로 반환하라. 각 구절의 속도와 강약 흐름을 독립적으로 판단하라. 숫자는 평소 캐릭터 대비 발화 목표다. 속도 비율0.7~1.3, 발성 에너지 변화-5~4dB, 구절 뒤 쉼0~700ms 범위. 재생 볼륨을 바꾸는 지시가 아니다. 마지막 구절 뒤 쉼은 반드시0. 힘을 뺀 위로, 감정을 누르는 긴장, 안도하며 풀리는 흐름을 구분하되 문장 안에서도 속도와 강약의 흐름을 고려한다. 음성에 없는 웃음/숨소리는 대사에 추가하지 않는다.'''
            plans=[]
            for case in benchmark['cases']:
                attempts=[]
                failure=''
                for attempt in range(3):
                    messages=[{'role':'system','content':system},{'role':'user','content':json.dumps(case,ensure_ascii=False)+( '\n직전 응답 오류: '+failure+'\n오류를 고쳐 JSON만 반환하라.' if attempt else '')}]
                    inputs=tok.apply_chat_template(messages,add_generation_prompt=True,return_tensors='pt').to('cuda')
                    with torch.inference_mode():result=planner.generate(inputs,max_new_tokens=1200,do_sample=False)
                    raw=tok.decode(result[0,inputs.shape[1]:],skip_special_tokens=True);attempts.append(raw)
                    try:
                        text=raw[raw.index('{'):raw.rindex('}')+1];plan=validate_plan(json.loads(text),case['text'])
                        if case.get('required_phrases') and [p['text'] for p in plan['phrases']]!=case['required_phrases']:raise ValueError('required_phrases의 구절 수와 각 text를 정확히 보존해야 함')
                        if plan['phrases'][-1]['pause_after_ms']!=0:raise ValueError('마지막 구절 뒤 pause_after_ms는0이어야 함')
                        break
                    except (ValueError,KeyError,TypeError,json.JSONDecodeError) as error:
                        failure=str(error)
                        if attempt==2:raise RuntimeError('Context planner failed schema for '+case['id']+': '+failure)
                plans.append({'case':case,'plan':plan,'raw_attempts':attempts})
                print('CONTEXT_PLAN',case['id'],json.dumps(plan,ensure_ascii=False),flush=True)
            (out/'context_plans.json').write_text(json.dumps({'planner':model_id,'revision':revision,'system':system,'items':plans},ensure_ascii=False,indent=2));cache.commit()
            del planner,tok;gc.collect();torch.cuda.empty_cache();status('generating')
        from qwen_tts import Qwen3TTSModel
        from qwen_phrase_data import requested_plan,instruction
        def seed(s):random.seed(s);np.random.seed(s);torch.manual_seed(s);torch.cuda.manual_seed_all(s)
        reference=manifest['references']['normal'];refpath=manifest['reference_path'];text=benchmark['cases'][0]['text']
        # The pre-experiment Base model supplies the old-cloning method for the
        # new sentence. Existing prior benchmark WAVs are never overwritten.
        base=snapshot_download('Qwen/Qwen3-TTS-12Hz-1.7B-Base',revision=manifest['base_revision']);q=Qwen3TTSModel.from_pretrained(base,device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
        prompt=q.create_voice_clone_prompt(ref_audio=refpath,ref_text=reference['text'])
        def save(file,y,sr,meta):
            y=np.asarray(y,dtype=np.float32);assert len(y) and np.isfinite(y).all()
            sf.write(out/file,y,sr,subtype='FLOAT')
            report['items'].append({'file':file,'text':text,'duration_seconds':len(y)/sr,'token_cap_suspected':len(y)/sr>=14.2,'seed':meta.get('seed',1234),'sha256':hashlib.sha256((out/file).read_bytes()).hexdigest(),**meta})
            status('generating')
        seed(1234)
        with torch.inference_mode():wavs,sr=q.generate_voice_clone(text=text,language='Korean',voice_clone_prompt=prompt,non_streaming_mode=True,max_new_tokens=180)
        save('baseline_clone.wav',wavs[0],sr,{'method':'original Base ICL cloning','base_revision':manifest['base_revision']})
        del q,prompt;gc.collect();torch.cuda.empty_cache()
        q=Qwen3TTSModel.from_pretrained(str(training_out/'checkpoint-best'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa');adapter=FrameAdapter(q.model.talker.config.hidden_size).to('cuda',torch.float32);adapter.load_state_dict(torch.load(out/'adapter.pt',weights_only=True));adapter.eval()
        prompt=q.create_voice_clone_prompt(ref_audio=refpath,ref_text=reference['text']);ins=q._tokenize_texts([q._build_instruct_text(instruction('normal',requested_plan(text)))])
        for item in plans:
            case=item['case'];features,schedule=planned_features(item['plan'],history['base_rate'],history['speaker_speech_dbfs']);tensor=torch.tensor(features,device='cuda')
            for s in [1234,4321]:
                seed(s)
                with torch.inference_mode(),GenerationControl(q,adapter,tensor) as control:
                    wavs,sr=q.generate_voice_clone(text=text,language='Korean',voice_clone_prompt=prompt,instruct_ids=ins,non_streaming_mode=True,max_new_tokens=180)
                assert control.calls[0]['frame']==0 and all(x['frame']==i for i,x in enumerate(control.calls))
                save(case['id']+f'_s{s}.wav',wavs[0],sr,{'method':'frame_conditioned','context':case['id'],'plan':item['plan'],'schedule':schedule,'control_calls':control.calls,'seed':s})
        # Controls off with identical checkpoint/reference/instruction/seed.
        seed(1234)
        with torch.inference_mode(),GenerationControl(q,adapter,tensor,enabled=False) as control:
            wavs,sr=q.generate_voice_clone(text=text,language='Korean',voice_clone_prompt=prompt,instruct_ids=ins,non_streaming_mode=True,max_new_tokens=180)
        save('frame_controls_off.wav',wavs[0],sr,{'method':'trained_checkpoint_controls_off'})
        # Factorial ablation: same prompt/text/seed, rate-only or energy-only
        # changed. This distinguishes changed waveforms from correct controls.
        import copy
        neutral={'phrases':[{'text':p['text'],'rate_relative_to_character':1.,'energy_start_db':0.,'energy_mid_db':0.,'energy_end_db':0.,'pause_after_ms':180 if i+1<len(plans[0]['plan']['phrases']) else 0} for i,p in enumerate(plans[0]['plan']['phrases'])]}
        for axis,values in [('speed',[.75,1.,1.25]),('energy',[-4.,0.,3.])]:
            for value in values:
                plan=copy.deepcopy(neutral)
                for p in plan['phrases']:
                    if axis=='speed':p['rate_relative_to_character']=value
                    else:
                        for k in ['energy_start_db','energy_mid_db','energy_end_db']:p[k]=value
                features,schedule=planned_features(plan,history['base_rate'],history['speaker_speech_dbfs']);seed(1234)
                with torch.inference_mode(),GenerationControl(q,adapter,torch.tensor(features,device='cuda')):
                    wavs,sr=q.generate_voice_clone(text=text,language='Korean',voice_clone_prompt=prompt,instruct_ids=ins,non_streaming_mode=True,max_new_tokens=180)
                save(f'{axis}_{value:g}.wav',wavs[0],sr,{'method':'axis_control','axis':axis,'value':value,'plan':plan,'schedule':schedule})
        del q,adapter,prompt;gc.collect();torch.cuda.empty_cache();status('auditing')
        from faster_whisper import WhisperModel
        from resemblyzer import VoiceEncoder,preprocess_wav
        asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/cache/asr');encoder=VoiceEncoder(device='cpu',verbose=False);reference_embedding=encoder.embed_utterance(preprocess_wav(Path(refpath)));audits=[]
        for item in report['items']:
            path=out/item['file'];segments,_=asr.transcribe(str(path),language='ko',beam_size=5,vad_filter=False);hyp=' '.join(s.text.strip() for s in segments);a=re.sub('[^가-힣]','',text);b=re.sub('[^가-힣]','',hyp);d=list(range(len(b)+1))
            for i,ca in enumerate(a,1):
                prev,d[0]=d[0],i
                for j,cb in enumerate(b,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(ca!=cb))
            y,sr=sf.read(path);frame=round(sr*.02);n=len(y)//frame;db=20*np.log10(np.sqrt(np.mean(y[:n*frame].reshape(n,frame)**2,axis=1))+1e-10);active=db>np.percentile(db,95)-30
            audits.append({'file':item['file'],'transcript':hyp,'cer':d[-1]/max(1,len(a)),'reference_speaker_similarity':float(np.dot(reference_embedding,encoder.embed_utterance(preprocess_wav(path)))),'duration_seconds':len(y)/sr,'speech_rms_median_dbfs':float(np.median(db[active])),'speech_p90_p10_db':float(np.percentile(db[active],90)-np.percentile(db[active],10)),'active_seconds':float(active.sum()*.02),'rate_active_syllables_per_second':len(a)/max(.02,active.sum()*.02)})
        (out/'acoustic_audit.json').write_text(json.dumps(audits,ensure_ascii=False,indent=2));status('complete')
    except Exception:
        report['errors'].append(traceback.format_exc());status('failed');raise
    finally:
        with zipfile.ZipFile(out/'results.zip','w',zipfile.ZIP_DEFLATED) as z:
            for f in out.iterdir():
                if f.is_file() and f.name!='results.zip':z.write(f,f.name)
        voices.commit();cache.commit()
    return report


@app.local_entrypoint()
def main(folder:str):
    p=Path(folder);manifest=json.loads((p/'manifest.json').read_text());prepared=json.loads((p/'prepared.json').read_text());benchmark=json.loads((p/'context_benchmark.json').read_text())
    if (p/'provided_context_plans.json').exists():manifest['provided_context_plans']=json.loads((p/'provided_context_plans.json').read_text())
    names=['qwen_frame_train.py','qwen_frame_control.py','qwen_phrase_train.py','qwen_phrase_data.py']
    report=run.remote(manifest,prepared,benchmark,{n:(Path('tooling/voice')/n).read_text() for n in names});(p/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(report['status'])
