"""Validate training math on a tiny native model; does not launch a35B job."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image
image=base_image.add_local_python_source('drama3_fullft','modal_drama3_compare')
app=modal.App('miro-drama3-fullft-readiness')


@app.function(image=image,memory=8192,timeout=900,retries=0)
def validate():
    from drama3_fullft.smoke import run
    result=run()
    import urllib.request,torch
    from drama3_fullft.core import construct,MODEL_REV,source_keys
    from fish_speech.models.text2semantic.fish_omni.config import FishOmniConfig
    from drama3_fullft.client import build_request
    from fish_speech.utils.schema import ServeTTSRequest
    import msgpack
    request=build_request('괜찮아. 나 여기 있어.','miro_actor_007','gentle and reassuring')
    parsed=ServeTTSRequest.model_validate(msgpack.unpackb(msgpack.packb(request,use_bin_type=True),raw=False))
    assert parsed.reference_id=='miro_actor_007' and not parsed.streaming and parsed.format=='wav'
    result['native_serving_contract']={'request_schema_and_msgpack_roundtrip':True,'actual_fullft_serving_started':False}
    from drama3_fullft.data import choose_pair
    fake=[]
    for actor in ['actorA','actorB']:
        for i in range(3):fake.append({'speaker_id':actor,'clip_id':actor+str(i),'recording_id':actor+str(i),'text':f'대사{chr(44032+i)}','split':'train'})
    counts={'actorA':0,'actorB':0}
    for step in range(100):
        target,reference,slot=choose_pair(fake,step);counts[target['speaker_id']]+=1
        assert reference['speaker_id']==target['speaker_id'] and reference['recording_id']!=target['recording_id'] and 0<=slot<16
    assert counts=={'actorA':50,'actorB':50}
    result['balanced_speaker_sampler_test']={'counts':counts,'disjoint_same_speaker_references':True,'scope':'Synthetic metadata schedule test; no second real speaker claimed'}
    raw=json.loads(urllib.request.urlopen('https://huggingface.co/fishaudio/drama-3/resolve/'+MODEL_REV+'/config.json',timeout=30).read())
    full=construct(FishOmniConfig.from_dict(raw),dtype=torch.bfloat16,device='meta')
    index=json.loads(urllib.request.urlopen('https://huggingface.co/fishaudio/drama-3/resolve/'+MODEL_REV+'/model.safetensors.index.json',timeout=30).read())['weight_map']
    from fish_speech.models.text2semantic.fish_omni.backbone import backbone_name
    normalized={backbone_name(k):k for k in index if not k.startswith('audio_decoder')}
    covered=set()
    for name,p in full.named_parameters():
        for key,kind in source_keys('backbone.'+name[len('backbone.'):] if name.startswith('backbone.') else name,index,normalized):
            assert key in index;covered.add(key)
            if kind is not None:
                scale=key.replace('.weight','.weight_scale_inv');assert scale in index;covered.add(scale)
    assert covered==set(index),(len(covered),len(index),list(set(index)-covered)[:5])
    result['released_parameter_mapping']={'checkpoint_tensor_keys':len(index),'mapped_keys':len(covered),'all_source_keys_accounted_for':True}
    total=sum(p.numel() for p in full.parameters())
    result['full_model_parameter_audit']={'tts_parameters':total,'bf16_weights_gib':total*2/2**30,
        'standard_mixed_precision_adam_training_states_gib_lower_bound':total*16/2**30,
        'eight_gpu_state_gib_per_rank_before_activations':total*16/2**30/8,
        'codec_trainable':False,'note':'Meta shapes only; excludes activations,gather buffers,framework overhead and codec. No35B weights or optimizer allocated.'}
    return result


@app.local_entrypoint()
def main(folder:str):
    p=Path(folder);p.mkdir(parents=True,exist_ok=True)
    result=validate.remote();(p/'fullft_smoke.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
