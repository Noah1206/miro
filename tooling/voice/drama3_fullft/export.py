"""Consolidate a ZeRO checkpoint into a native Fish-readable BF16 model directory."""
import argparse,json,math,shutil
from pathlib import Path
import torch
from safetensors.torch import save_file
from .core import export_name,SOURCE_REV,MODEL_REV
from .codec_contract import file_sha256,read_contract


def save_shards(state,output,max_bytes=2_000_000_000):
    output=Path(output);output.mkdir(parents=True,exist_ok=True);pending={};size=0;maps={};total=0;part=0
    def flush():
        nonlocal pending,size,part
        if not pending:return
        part+=1;name=f'model-{part:05d}.safetensors';save_file(pending,str(output/name))
        for key in pending:maps[key]=name
        pending={};size=0
    for key in sorted(state):
        if key.startswith('korean_teacher_head.'):continue
        if not key.startswith(('backbone.','audio_decoder.')):raise ValueError('Unexpected checkpoint parameter '+key)
        value=state[key].contiguous().to(torch.bfloat16).cpu().contiguous()
        count=value.numel()*value.element_size()
        if pending and size+count>max_bytes:flush()
        pending[export_name(key)]=value;size+=count;total+=count
    flush()
    (output/'model.safetensors.index.json').write_text(json.dumps({'metadata':{'total_size':total},'weight_map':maps},indent=2))
    return total


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--zero-checkpoint',required=True);ap.add_argument('--tag',default='final')
    ap.add_argument('--original',required=True);ap.add_argument('--output',required=True);a=ap.parse_args()
    metadata=json.loads((Path(a.zero_checkpoint).parent/'run_metadata.json').read_text())
    contract=metadata['codec_contract']
    if contract['codec_file_sha256']!=file_sha256(Path(a.original)/'codec.pth'):
        raise ValueError('Export codec differs from the training token space')
    from deepspeed.utils.zero_to_fp32 import get_fp32_state_dict_from_zero_checkpoint
    state=get_fp32_state_dict_from_zero_checkpoint(a.zero_checkpoint,tag=a.tag,lazy_mode=True)
    size=sum(math.prod(t.shape)*2 for k,t in state.items() if not k.startswith('korean_teacher_head.'));dest=Path(a.output)
    if dest.exists():raise FileExistsError('Choose a new model directory; never overwrite serving weights')
    dest.parent.mkdir(parents=True,exist_ok=True)
    if shutil.disk_usage(dest.parent).free<size*1.15:raise OSError(f'Need at least{size*1.15/2**30:.1f}GiB free for BF16 export')
    dest.mkdir();written=save_shards(state,dest)
    original=Path(a.original);config=json.loads((original/'config.json').read_text());config.pop('quantization_config',None)
    config['torch_dtype']='bfloat16';(dest/'config.json').write_text(json.dumps(config,indent=2))
    for file in ['tokenizer.json','tokenizer_config.json','special_tokens_map.json','chat_template.jinja','codec.pth','LICENSE']:
        if (original/file).exists():shutil.copy2(original/file,dest/file)
    (dest/'codec_contract.json').write_text(json.dumps(contract,indent=2));read_contract(dest/'codec_contract.json')
    (dest/'MIRO_TRAINING.json').write_text(json.dumps({'source':SOURCE_REV,'initial_model':MODEL_REV,
        'method':'full_parameter_finetuning','lora':False,'parameter_bytes':written,'format':'native FishOmni BF16 fused experts',
        'checkpoint':a.zero_checkpoint,'tag':a.tag,'target_language':'ko','preserve_other_languages':False,
        'training_teacher':metadata.get('korean_teacher'),'training_only_teacher_head_exported':False,
        'codec_profile_id':contract['codec_profile_id'],'production_approved':False},indent=2))
    print('Exported',dest,'Built with Fish Audio')


if __name__=='__main__':main()
