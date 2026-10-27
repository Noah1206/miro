"""Bounded Miro Korean-teacher experiments on authorized actor007 recordings."""
import json,io,zipfile
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,cache,voices,MODEL_REV

image=base_image.add_local_python_source('drama3_fullft','modal_drama3_compare')
app=modal.App('miro-drama3-korean-teacher-007')


@app.function(image=image,memory=8192,timeout=180,retries=0)
def validate_integration():
    from drama3_fullft.teacher_smoke import run
    return run()


@app.function(image=image,gpu=['L4','A100-40GB'],cpu=4,memory=24576,timeout=2400,retries=0,
              volumes={'/fishcache':cache,'/voices':voices})
def matched_pilot(extra_seeds=False):
    from drama3_fullft.teacher_experiment import run
    voices.reload();cache.reload();root=Path('/voices/_drama3/korean-teacher-007-20261023')
    assert json.loads((root/'preparation.json').read_text())['status']=='complete'
    original=Path('/fishcache/huggingface/hub/models--fishaudio--drama-3/snapshots')/MODEL_REV
    if extra_seeds:
        result={'status':'complete','runs':[run(root,original,steps=64,seed=seed) for seed in [1618,2718]]}
    else:result=run(root,original,steps=64)
    voices.commit();return result


@app.function(image=image,gpu=['L4','A100-40GB'],cpu=4,memory=24576,timeout=2400,retries=0,
              volumes={'/fishcache':cache,'/voices':voices})
def prepare(bundle):
    import gc,time,hashlib,torch,torchaudio,numpy as np
    from transformers import HubertModel,AutoFeatureExtractor
    from fish_speech.models.text2semantic.inference import load_codec_model,encode_audio
    from drama3_fullft.korean_teacher import TEACHER_ID,TEACHER_REV,TEACHER_LAYER,align_features
    from drama3_fullft.codec_contract import create_contract,validate_cache
    from drama3_fullft.data import read_rows
    voices.reload();cache.reload();out=Path('/voices/_drama3/korean-teacher-007-20261023');out.mkdir(parents=True,exist_ok=True)
    data_root=out/'data';data_root.mkdir(exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(bundle)) as z:
        for name in z.namelist():
            if name.startswith('/') or '..' in Path(name).parts:raise ValueError('Unsafe input')
        z.extractall(data_root)
    manifest=data_root/'recordings.jsonl';rows=[json.loads(x) for x in manifest.read_text().splitlines()]
    for row in rows:row['audio_path']=str(data_root/'wavs'/Path(row['audio_path']).name)
    manifest.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows));read_rows(manifest)
    weights=Path('/fishcache/huggingface/hub/models--fishaudio--drama-3/snapshots')/MODEL_REV
    contract=create_contract(weights/'codec.pth','bfloat16');codes=out/'codes';features=out/'teacher_features'
    codes.mkdir(exist_ok=True);features.mkdir(exist_ok=True)
    if (codes/'codec_contract.json').exists():
        assert json.loads((codes/'codec_contract.json').read_text())==contract
    (codes/'codec_contract.json').write_text(json.dumps(contract,indent=2))
    codec=load_codec_model(weights/'codec.pth','cuda',torch.bfloat16).eval()
    for p in codec.parameters():p.requires_grad_(False)
    teacher=HubertModel.from_pretrained(TEACHER_ID,revision=TEACHER_REV,trust_remote_code=False,use_safetensors=True).to('cuda').eval()
    for p in teacher.parameters():p.requires_grad_(False)
    processor=AutoFeatureExtractor.from_pretrained(TEACHER_ID,revision=TEACHER_REV,trust_remote_code=False)
    assert processor.sampling_rate==16000 and not processor.do_normalize
    result={'status':'preparing','teacher_id':TEACHER_ID,'teacher_revision':TEACHER_REV,'layer':TEACHER_LAYER,
            'teacher_frozen':True,'do_normalize':False,'codec_unchanged':True,'codec_contract':contract,
            'alignment':'Codec frame centers; teacher receptive-field center199.5/16000s,stride320/16000s; linear interpolation and edge clamp',
            'scope':'Real007 recordings and pretrained Korean HuBERT; no35B TTS training in this preparation',
            'complete_clips':0,'torch':torch.__version__,'transformers':__import__('transformers').__version__}
    for row in rows:
        sid=row['clip_id'];raw=Path(row['audio_path']);sha=hashlib.sha256(raw.read_bytes()).hexdigest();assert sha==row['sha256']
        cp=codes/(sid+'.pt');fp=features/(sid+'.pt')
        if cp.exists():code=validate_cache(torch.load(cp,weights_only=True),sha,contract)
        else:
            with torch.inference_mode():code=encode_audio(raw,codec,'cuda').cpu().long()
            torch.save({'codes':code,'source_sha256':sha,'codec_profile_id':contract['codec_profile_id'],'codec_revision':MODEL_REV},cp)
        if fp.exists():
            previous=torch.load(fp,weights_only=True)
            assert previous['source_sha256']==sha and previous['teacher_revision']==TEACHER_REV and previous['codec_profile_id']==contract['codec_profile_id']
        else:
            wav,sr=torchaudio.load(raw);wav=torchaudio.functional.resample(wav.mean(0),sr,16000)
            inputs=processor(wav.numpy(),sampling_rate=16000,return_tensors='pt').input_values.to('cuda')
            with torch.inference_mode():
                states=teacher(inputs,output_hidden_states=True).hidden_states[TEACHER_LAYER][0].float()
                aligned=align_features(states,code.shape[-1]).half().cpu()
            assert torch.isfinite(aligned).all()
            torch.save({'features':aligned,'source_sha256':sha,'teacher_id':TEACHER_ID,'teacher_revision':TEACHER_REV,
                        'layer':TEACHER_LAYER,'codec_profile_id':contract['codec_profile_id'],'original_teacher_frames':len(states)},fp)
        result['complete_clips']+=1
        if result['complete_clips']%25==0:
            (out/'preparation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));voices.commit()
            print('KO_TEACHER_PREPARED',result['complete_clips'],'/',len(rows),flush=True)
    from drama3_fullft.korean_teacher import build_training_stats
    build_training_stats(features,rows,contract)
    result['normalization']='Training-split-only per-channel mean/std, std floor0.05, clipping10; no validation/test statistics'
    result['status']='complete';result['peak_gpu_gib']=torch.cuda.max_memory_allocated()/2**30
    (out/'preparation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));voices.commit();cache.commit();return result


@app.local_entrypoint()
def main(folder:str,pilot_only:bool=False,validate_only:bool=False,extra_seeds:bool=False):
    root=Path(folder);root.mkdir(parents=True,exist_ok=True)
    if validate_only:
        result=validate_integration.remote();(root/'teacher_integration.json').write_text(json.dumps(result,indent=2));print(result);return
    if pilot_only or extra_seeds:
        result=matched_pilot.remote(extra_seeds);(root/('matched_extra_seeds.json' if extra_seeds else 'matched_pilot.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(result['status']);return
    bundle=Path('output/voice-compare/drama3-training-readiness-20261023/data/actor007_gpu_bundle.zip').read_bytes()
    result=prepare.remote(bundle);(root/'preparation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(result)
