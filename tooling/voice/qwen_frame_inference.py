"""Run a learned frame-control checkpoint with its required acoustic adapter."""
import argparse,json,random
from pathlib import Path


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--checkpoint',required=True);ap.add_argument('--adapter',required=True);ap.add_argument('--history',required=True);ap.add_argument('--plan',required=True);ap.add_argument('--text',required=True);ap.add_argument('--reference',required=True);ap.add_argument('--reference-text',required=True);ap.add_argument('--out',required=True);ap.add_argument('--seed',type=int,default=1234);a=ap.parse_args()
    import numpy as np,soundfile as sf,torch
    from qwen_tts import Qwen3TTSModel
    from qwen_frame_control import FrameAdapter,GenerationControl,planned_features,validate_plan
    from qwen_phrase_data import instruction,requested_plan
    plan=validate_plan(json.loads(Path(a.plan).read_text()),a.text);history=json.loads(Path(a.history).read_text())
    features,schedule=planned_features(plan,history['base_rate'],history['speaker_speech_dbfs'])
    q=Qwen3TTSModel.from_pretrained(a.checkpoint,device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa');adapter=FrameAdapter(q.model.talker.config.hidden_size).to('cuda',torch.float32);adapter.load_state_dict(torch.load(a.adapter,weights_only=True));adapter.eval()
    prompt=q.create_voice_clone_prompt(ref_audio=a.reference,ref_text=a.reference_text);ins=q._tokenize_texts([q._build_instruct_text(instruction('normal',requested_plan(a.text)))])
    random.seed(a.seed);np.random.seed(a.seed);torch.manual_seed(a.seed);torch.cuda.manual_seed_all(a.seed)
    with torch.inference_mode(),GenerationControl(q,adapter,torch.tensor(features,device='cuda')) as control:
        wavs,sr=q.generate_voice_clone(text=a.text,language='Korean',voice_clone_prompt=prompt,instruct_ids=ins,non_streaming_mode=True,max_new_tokens=180)
    out=Path(a.out);out.parent.mkdir(parents=True,exist_ok=True);sf.write(out,wavs[0],sr,subtype='FLOAT');cap=len(wavs[0])/sr>=14.2
    out.with_suffix('.json').write_text(json.dumps({'text':a.text,'plan':plan,'schedule':schedule,'seed':a.seed,'duration_seconds':len(wavs[0])/sr,'token_cap_suspected':cap,'control_calls':control.calls,'waveform_postprocessing':False,'production_approved':False},ensure_ascii=False,indent=2))
    if cap:raise RuntimeError('Generation may have hit token cap; do not serve as a complete utterance')


if __name__=='__main__':main()
