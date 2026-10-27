"""Version-pinned experimental Base ICL + learned phrase-plan inference."""
import argparse,json,random
from pathlib import Path
from qwen_phrase_data import requested_plan,instruction,norm,SPEEDS,PAUSES

def main():
    p=argparse.ArgumentParser();p.add_argument('--checkpoint',required=True);p.add_argument('--text',required=True);p.add_argument('--reference',required=True);p.add_argument('--reference-text',required=True);p.add_argument('--emotion',choices=['normal','happy','sad','angry'],default='normal');p.add_argument('--speed',choices=['slow','normal','fast'],default='normal');p.add_argument('--pause',choices=['none','short','long'],default='short');p.add_argument('--plan-json');p.add_argument('--out',required=True);a=p.parse_args()
    import torch,numpy as np,soundfile as sf
    from qwen_tts import Qwen3TTSModel
    random.seed(1234);np.random.seed(1234);torch.manual_seed(1234);torch.cuda.manual_seed_all(1234)
    plan=json.loads(Path(a.plan_json).read_text()) if a.plan_json else requested_plan(a.text,a.speed,a.pause)
    assert plan['tempo'] in SPEEDS and 1<=len(plan['phrases'])<=6
    assert ''.join(norm(x['text']) for x in plan['phrases'])==norm(a.text)
    assert all(x['tempo'] in SPEEDS and x['pause'] in PAUSES for x in plan['phrases'])
    model=Qwen3TTSModel.from_pretrained(a.checkpoint,device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa');inst=instruction(a.emotion,plan);ids=model._tokenize_texts([model._build_instruct_text(inst)])
    prompt=model.create_voice_clone_prompt(ref_audio=a.reference,ref_text=a.reference_text)
    wavs,sr=model.generate_voice_clone(text=a.text,language='Korean',voice_clone_prompt=prompt,instruct_ids=ids,non_streaming_mode=True,max_new_tokens=180)
    out=Path(a.out);out.parent.mkdir(parents=True,exist_ok=True);sf.write(out,wavs[0],sr,subtype='FLOAT');cap=len(wavs[0])/sr>=14.2
    out.with_suffix('.json').write_text(json.dumps({'plan':plan,'instruction':inst,'seed':1234,'duration_seconds':len(wavs[0])/sr,'token_limit_suspected':cap,'production_approved':False},ensure_ascii=False,indent=2))
    if cap:raise RuntimeError('Output may have hit the generation limit; do not accept as a complete utterance.')

if __name__=='__main__':main()
