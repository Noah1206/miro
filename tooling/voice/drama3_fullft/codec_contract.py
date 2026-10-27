"""Bind Miro training tokens to the exact frozen codec and numeric profile."""
import argparse,hashlib,json
from pathlib import Path
import torch
from .core import SOURCE_REV,MODEL_REV

VOCABULARIES=(4096,)+(1024,)*9


def file_sha256(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):digest.update(block)
    return digest.hexdigest()


def create_contract(checkpoint,precision):
    if precision not in ['float32','bfloat16']:raise ValueError('Unsupported codec precision')
    profile={'version':1,'source_revision':SOURCE_REV,'initial_model_revision':MODEL_REV,
             'codec_file_sha256':file_sha256(checkpoint),'precision':precision,
             'torch_version':torch.__version__,'sample_rate':44100,'frame_length':2048,
             'codebook_vocabularies':list(VOCABULARIES),'frozen_codec':True,
             'resampling':'official torchaudio path','normalization_applied':False,'silence_trimmed':False}
    return {**profile,'codec_profile_id':hashlib.sha256(json.dumps(profile,sort_keys=True).encode()).hexdigest()}


def read_contract(path):
    contract=json.loads(Path(path).read_text());profile={k:v for k,v in contract.items() if k!='codec_profile_id'}
    expected=hashlib.sha256(json.dumps(profile,sort_keys=True).encode()).hexdigest()
    if expected!=contract.get('codec_profile_id'):raise ValueError('Corrupt codec contract')
    if contract.get('codebook_vocabularies')!=list(VOCABULARIES) or not contract.get('frozen_codec'):
        raise ValueError('Miro Full FT requires the unchanged10-codebook token space')
    if contract.get('source_revision')!=SOURCE_REV or contract.get('initial_model_revision')!=MODEL_REV:
        raise ValueError('Different source/model revision needs a new compatibility audit')
    return contract


def validate_cache(data,source_sha256,contract):
    if data.get('source_sha256')!=source_sha256:raise ValueError('Stale source recording in codec cache')
    if data.get('codec_profile_id')!=contract['codec_profile_id']:
        raise ValueError('Mixed or legacy codec cache: use the selected experiment codec and precision')
    codes=data['codes']
    if codes.ndim!=2 or codes.shape[0]!=10 or codes.shape[1]==0 or codes.dtype!=torch.int64:
        raise ValueError('Expected all10integer codebooks; semantic-only targets are incompatible')
    for i,size in enumerate(VOCABULARIES):
        if int(codes[i].min())<0 or int(codes[i].max())>=size:raise ValueError('Code out of vocabulary at codebook '+str(i))
    return codes


def validate_training_contract(code_root,checkpoint):
    contract=read_contract(Path(code_root)/'codec_contract.json')
    if contract['codec_file_sha256']!=file_sha256(Path(checkpoint)/'codec.pth'):
        raise ValueError('Training checkpoint codec differs from cached targets; audit before changing it')
    # Keep one numeric profile for this pilot; FP32/BF16 do not inherently remap codebook meanings.
    # Native serving defaults to BF16; other profiles need an explicitly evaluated configuration.
    if contract['precision']!='bfloat16':
        raise ValueError('Current native serving codec uses BF16; align the serving profile before training on FP32 tokens')
    if contract['torch_version']!=torch.__version__:raise ValueError('Codec/train runtime version mismatch')
    return contract


def validate_serving_checkpoint(checkpoint):
    checkpoint=Path(checkpoint);contract=read_contract(checkpoint/'codec_contract.json')
    if contract['codec_file_sha256']!=file_sha256(checkpoint/'codec.pth'):raise ValueError('Serving codec weights changed')
    if contract['precision']!='bfloat16' or contract['torch_version']!=torch.__version__:
        raise ValueError('Serving codec precision/runtime differs from the training token profile')
    return contract


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--serving-checkpoint',required=True);args=ap.parse_args()
    checked=validate_serving_checkpoint(args.serving_checkpoint)
    print('Miro codec profile verified:',checked['codec_profile_id'])
