"""Reproduce the trained preset contract; reject unsupported acting controls."""
import argparse,json,random
from pathlib import Path

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--checkpoint',required=True);ap.add_argument('--manifest',required=True);ap.add_argument('--text',required=True);ap.add_argument('--emotion',choices=['normal','happy','sad','angry'],default='normal');ap.add_argument('--out',required=True);ap.add_argument('--seed',type=int,default=1234);args=ap.parse_args()
    import numpy as np
    import torch,soundfile as sf
    from qwen_tts import Qwen3TTSModel
    manifest=json.loads(Path(args.manifest).read_text());instruction=manifest['instructions'][args.emotion]
    random.seed(args.seed);np.random.seed(args.seed);torch.manual_seed(args.seed);torch.cuda.manual_seed_all(args.seed)
    model=Qwen3TTSModel.from_pretrained(args.checkpoint,device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
    waves,sr=model.generate_custom_voice(text=args.text,language='Korean',speaker='miro007',instruct=instruction,max_new_tokens=180)
    dest=Path(args.out);dest.parent.mkdir(parents=True,exist_ok=True);sf.write(dest,waves[0],sr,subtype='FLOAT')
    cap=len(waves[0])/sr>=14.2
    metadata={'speaker':'007','emotion':args.emotion,'instruction':instruction,'seed':args.seed,'duration_seconds':len(waves[0])/sr,'token_limit_suspected':cap,'production_approved':False}
    dest.with_suffix('.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
    if cap:raise RuntimeError('Output may have hit the generation ceiling; do not accept as a complete performance.')
if __name__=='__main__':main()
