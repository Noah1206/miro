"""Miro actor007 codec audit: no TTS generation, codebook changes or deployment."""
import hashlib,json,zipfile,io
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,cache,voices,SOURCE_REV,MODEL_REV

image=base_image.add_local_python_source('modal_drama3_compare','drama3_fullft')
app=modal.App('miro-drama3-codec-audit')


@app.function(image=image,memory=8192,timeout=180,retries=0)
def contracts():
    import io,unittest,torch
    from drama3_fullft.test_codec_contract import CodecContractTests
    stream=io.StringIO();suite=unittest.defaultTestLoader.loadTestsFromTestCase(CodecContractTests)
    result=unittest.TextTestRunner(stream=stream,verbosity=2).run(suite)
    if not result.wasSuccessful():raise AssertionError(stream.getvalue())
    return {'status':'passed','tests':result.testsRun,'torch':torch.__version__,
            'scope':'Cache/train/export/serving preflight contract checks; no35B training or real serving started',
            'details':stream.getvalue()}


@app.function(image=image,gpu=['L4','A10G','A100-40GB'],cpu=4,memory=24576,timeout=1200,retries=0,
              volumes={'/fishcache':cache,'/voices':voices})
def audit(manifest,recordings):
    import gc,os,re,time,torch,numpy as np,soundfile as sf
    import torch.nn.functional as F
    from fish_speech.models.text2semantic.inference import load_codec_model,encode_audio,decode_to_audio
    voices.reload();cache.reload()
    out=Path('/voices')/manifest['remote_output'];out.mkdir(parents=True,exist_ok=True)
    checkpoint=Path('/fishcache/huggingface/hub/models--fishaudio--drama-3/snapshots')/MODEL_REV/'codec.pth'
    assert checkpoint.is_file(),checkpoint
    report={'status':'encoding','source_revision':SOURCE_REV,'model_revision':MODEL_REV,
            'codec_sha256':hashlib.sha256(checkpoint.read_bytes()).hexdigest(),'tts_model_loaded':False,
            'trained':False,'production_changed':False,'gpu':torch.cuda.get_device_name(),'items':[]}
    if (out/'report.json').exists():
        previous=json.loads((out/'report.json').read_text())
        if previous['codec_sha256']!=report['codec_sha256']:raise ValueError('Changed codec')
        report['items']=previous['items']
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    codec=load_codec_model(checkpoint,'cuda',torch.float32).eval()
    for p in codec.parameters():p.requires_grad_(False)
    counts=[np.zeros(4096 if i==0 else 1024,dtype=np.int64) for i in range(10)]
    def save(name,wav,sr):
        x=np.asarray(wav,dtype=np.float32).reshape(-1)
        assert np.isfinite(x).all()
        sf.write(out/name,x,sr,subtype='FLOAT')
        return name
    def checkpoint_report():
        (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));voices.commit()
    for row in manifest['items']:
        sid=row['clip_id'];blob=recordings[sid]
        assert hashlib.sha256(blob).hexdigest()==row['sha256']
        raw=out/(sid+'_original.wav');raw.write_bytes(blob)
        x,sr=sf.read(raw,dtype='float32');assert sr==44100 and x.ndim==1
        prior=next((v for v in report['items'] if v['clip_id']==sid),None)
        if prior is not None:
            if prior['source_sha256']!=row['sha256']:raise ValueError('Changed source')
            cached=torch.load(out/(sid+'_codes.pt'),weights_only=True)
            assert cached['codec_sha256']==report['codec_sha256']
            for i,c in enumerate(cached['codes'].numpy()):counts[i]+=np.bincount(c,minlength=len(counts[i]))
            print('CODEC_REUSED',sid,flush=True);continue
        with torch.inference_mode():
            codes=encode_audio(raw,codec,'cuda')
            y=decode_to_audio(codes.clone(),codec).float().cpu().numpy()
        assert codes.shape[0]==10
        for i,c in enumerate(codes.cpu().numpy()):counts[i]+=np.bincount(c,minlength=len(counts[i]))
        torch.save({'codes':codes.cpu(),'source_sha256':row['sha256'],'codec_sha256':report['codec_sha256']},out/(sid+'_codes.pt'))
        item={'clip_id':sid,'emotion':row['emotion'],'text':row['text'],'split':row['split'],
              'source_sha256':row['sha256'],'original_file':raw.name,'codec_file':save(sid+'_codec.wav',y,sr),
              'input_samples':len(x),'output_samples':len(y),'frames':codes.shape[-1],
              'padding_samples':len(y)-len(x),'precision':'float32','sample_rate':sr}
        if row.get('ablation'):
            # A lower-codebook count tests the residual channel contribution, not VQ vs continuous.
            quant=codec.quantizer
            with torch.inference_mode():
                q0=quant.semantic_quantizer.from_codes(codes[None,:1])[0]
                q01=q0+quant.quantizer.from_codes(codes[None,1:2])[0]
                for label,z in [('q0',q0),('q01',q01)]:
                    w=codec.decoder(quant.upsample(quant.post_module(z))).float().cpu().numpy()[0,0]
                    item[label+'_file']=save(sid+'_'+label+'.wav',w,sr)
                # Off-distribution intervention; not a perceptual upper bound or exact VQ-loss estimate.
                t=torch.as_tensor(x,device='cuda')[None,None]
                t=F.pad(t,(0,(-t.shape[-1])%int(codec.frame_length)))
                z=codec.encoder(t);down=quant.pre_module(quant.downsample(z))
                sem=quant.semantic_quantizer(down)[0]
                residual=quant.quantizer(down-sem)[0]
                item['quantization_latent_nmse']=float(((down-sem-residual).square().mean()/down.square().mean()).item())
                w=codec.decoder(quant.upsample(quant.post_module(down))).float().cpu().numpy()[0,0]
                item['continuous_intervention_file']=save(sid+'_continuous_intervention.wav',w,sr)
        report['items'].append(item);print('CODEC_ENCODED',sid,codes.shape,flush=True)
        checkpoint_report()
    report['codebook_usage']=[{'codebook':i,'vocabulary':len(c),'frames':int(c.sum()),
        'unique_codes':int((c>0).sum()),'entropy_bits':float(-(c[c>0]/c.sum()*np.log2(c[c>0]/c.sum())).sum())}
        for i,c in enumerate(counts)]
    report['usage_note']='Small single-speaker Korean sample only; not a collapse diagnosis or training-language distribution estimate.'
    # Precision control uses exactly the same original audio; stored FP32 result remains primary.
    # Reload instead of casting an exercised model: PyTorch inference tensors may lack version counters.
    del codec;gc.collect();torch.cuda.empty_cache()
    codec=load_codec_model(checkpoint,'cuda',torch.bfloat16).eval()
    for item in report['items']:
        if not any(r['clip_id']==item['clip_id'] and r.get('ablation') for r in manifest['items']):continue
        with torch.inference_mode():
            c=encode_audio(out/item['original_file'],codec,'cuda');w=decode_to_audio(c.clone(),codec).float().cpu().numpy()
        fp32=torch.load(out/(item['clip_id']+'_codes.pt'),weights_only=True)['codes']
        item['bf16_code_agreement']=float((fp32==c.cpu()).float().mean())
        item['bf16_file']=save(item['clip_id']+'_bf16.wav',w,44100)
    del codec;gc.collect();torch.cuda.empty_cache()
    report['status']='transcribing';checkpoint_report()
    from faster_whisper import WhisperModel
    import librosa
    asr=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',download_root='/fishcache/asr')
    def cer(ref,hyp):
        a=re.sub('[^가-힣0-9A-Za-z]','',ref).lower();b=re.sub('[^가-힣0-9A-Za-z]','',hyp).lower();d=list(range(len(b)+1))
        for i,ca in enumerate(a,1):
            prev,d[0]=d[0],i
            for j,cb in enumerate(b,1):prev,d[j]=d[j],min(d[j]+1,d[j-1]+1,prev+(ca!=cb))
        return d[-1]/max(1,len(a))
    for item in report['items']:
        item['asr']={}
        for key in ['original_file','codec_file']:
            wav,sr=sf.read(out/item[key],dtype='float32');wav=librosa.resample(wav,orig_sr=sr,target_sr=16000)
            seg,_=asr.transcribe(wav,language='ko',beam_size=5,vad_filter=False,condition_on_previous_text=False)
            hyp=' '.join(s.text.strip() for s in seg)
            item['asr'][key]={'transcript':hyp,'cer_to_verified_text':cer(item['text'],hyp)}
        item['asr']['cer_original_to_codec_transcript']=cer(item['asr']['original_file']['transcript'],item['asr']['codec_file']['transcript'])
        print('CODEC_ASR',item['clip_id'],item['asr'],flush=True);checkpoint_report()
    report['status']='complete';report['peak_gpu_gib']=torch.cuda.max_memory_allocated()/2**30;checkpoint_report();cache.commit()
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
        for p in out.iterdir():
            if p.is_file() and p.suffix in ['.json','.wav','.pt']:z.write(p,p.name)
    return buf.getvalue()


@app.local_entrypoint()
def main(folder:str,contracts_only:bool=False):
    p=Path(folder);m=json.loads((p/'manifest.json').read_text())
    if contracts_only:
        result=contracts.remote();(p/'contract_tests.json').write_text(json.dumps(result,indent=2));print(result);return
    recordings={r['clip_id']:Path(r['audio_path']).read_bytes() for r in m['items']}
    payload=audit.remote(m,recordings)
    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        for name in z.namelist():
            if Path(name).name!=name:raise ValueError('Unsafe output archive')
        z.extractall(p)
    print('CODEC_AUDIT_DOWNLOADED',p)
