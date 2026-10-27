"""Does the frozen codec preserve absolute gain? No training or acting labels."""
import json
from pathlib import Path
import modal
from modal_qwen_conditioned import image as base_image
image=base_image.add_local_python_source('modal_qwen_conditioned','modal_qwen_bottleneck')
app=modal.App('miro-qwen-007-energy-probe')
voices=modal.Volume.from_name('miro-voices');cache=modal.Volume.from_name('miro-voxcpm2-cache')


@app.function(image=image,gpu='A100-40GB',memory=16384,timeout=600,retries=0,volumes={'/voices':voices,'/cache':cache})
def probe():
    import numpy as np,torch,soundfile as sf
    from qwen_tts import Qwen3TTSModel
    voices.reload();q=Qwen3TTSModel.from_pretrained('/voices/_qwen_context/007-20261023-frame-residual-short-v3/checkpoint-best',device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
    tokenizer=q.model.speech_tokenizer;y,sr=sf.read('/voices/_qwen_ft/007-20261023-pilot1/data/D-NX-A-007-0501.wav')
    def level(y,sr):
        frame=round(sr*.02);n=len(y)//frame;db=20*np.log10(np.sqrt(np.mean(y[:n*frame].reshape(n,frame)**2,axis=1))+1e-10)
        return float(np.median(db[db>np.percentile(db,95)-30]))
    rows=[];code_arrays=[]
    for gain_db in [-4.,0.,3.]:
        source=y*10**(gain_db/20)
        with torch.inference_mode():encoded=tokenizer.encode(source,sr=sr);decoded,dsr=tokenizer.decode(encoded)
        codes=encoded.audio_codes[0].cpu().numpy();code_arrays.append(codes)
        rows.append({'gain_db':gain_db,'input_speech_median_dbfs':level(source,sr),'decoded_speech_median_dbfs':level(np.asarray(decoded[0]),dsr),'input_peak':float(np.max(np.abs(source))),'decoded_peak':float(np.max(np.abs(decoded[0])))})
    for row,codes in zip(rows,code_arrays):
        row['codec0_fraction_changed_vs_zero']=float(np.mean(codes[:,0]!=code_arrays[1][:,0]));row['residual_fraction_changed_vs_zero']=float(np.mean(codes[:,1:]!=code_arrays[1][:,1:]))
    result={'voice':'007','rows':rows,'absolute_gain_retained':all(rows[i+1]['decoded_speech_median_dbfs']-rows[i]['decoded_speech_median_dbfs']>=1 for i in range(2)), 'not_an_acting_test':True}
    return result


@app.local_entrypoint()
def main(folder:str):
    result=probe.remote();Path(folder,'codec_gain_probe.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
