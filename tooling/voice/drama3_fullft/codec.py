"""Encode original recordings with the frozen Drama3 codec, preserving timing/level."""
import argparse,hashlib,json
from pathlib import Path
import torch
from .core import MODEL_REV
from .data import read_rows
from .codec_contract import create_contract,read_contract,validate_cache


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--manifest',required=True);ap.add_argument('--checkpoint',required=True)
    ap.add_argument('--output',required=True);ap.add_argument('--device',default='cuda:0')
    ap.add_argument('--precision',choices=['bfloat16','float32'],default='bfloat16');a=ap.parse_args()
    from fish_speech.models.text2semantic.inference import load_codec_model,encode_audio
    rows=read_rows(a.manifest);dest=Path(a.output);dest.mkdir(parents=True,exist_ok=True)
    contract=create_contract(Path(a.checkpoint)/'codec.pth',a.precision)
    contract_path=dest/'codec_contract.json'
    if contract_path.exists():
        if read_contract(contract_path)!=contract:raise ValueError('Use a separate cache directory for a different codec/profile')
    elif any(dest.glob('*.pt')):raise ValueError('Legacy cache has no codec contract; choose a new directory')
    else:contract_path.write_text(json.dumps(contract,indent=2))
    codec=load_codec_model(Path(a.checkpoint)/'codec.pth',a.device,getattr(torch,a.precision)).eval()
    for p in codec.parameters():p.requires_grad_(False)
    for row in rows:
        source=Path(row['audio_path']);sha=hashlib.sha256(source.read_bytes()).hexdigest()
        if sha!=row['sha256']:raise ValueError('Source recording changed: '+row['clip_id'])
        out=dest/(row['clip_id']+'.pt')
        if out.exists():
            cached=torch.load(out,map_location='cpu',weights_only=True)
            validate_cache(cached,sha,contract)
            continue
        with torch.no_grad():codes=encode_audio(source,codec,a.device).cpu()
        assert codes.shape[0]==10 and codes.shape[1]>0
        data={'codes':codes.long(),'source_sha256':sha,'codec_revision':MODEL_REV,'source_sample_rate':row['sample_rate'],
              'codec_profile_id':contract['codec_profile_id'],'normalization_applied':False,'silence_trimmed':False}
        validate_cache(data,sha,contract);torch.save(data,out)
        print(row['clip_id'],tuple(codes.shape),flush=True)


if __name__=='__main__':main()
