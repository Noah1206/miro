"""Real backward/update/export checks on a small instance of the native architecture."""
import json
import torch
from .core import construct,FullFT,training_rows,export_name


def tiny_config():
    from fish_speech.models.text2semantic.fish_omni.config import FishOmniConfig,FishOmniTextConfig,AudioDecoderConfig
    text=FishOmniTextConfig(vocab_size=96,hidden_size=32,num_hidden_layers=4,
        layer_types=['linear_attention','full_attention','linear_attention','full_attention'],
        num_attention_heads=4,num_key_value_heads=2,head_dim=8,rope_theta=10000.,partial_rotary_factor=.5,
        rms_norm_eps=1e-6,max_position_embeddings=512,linear_conv_kernel_dim=4,
        linear_key_head_dim=8,linear_value_head_dim=8,linear_num_key_heads=2,linear_num_value_heads=4,
        num_experts=4,num_experts_per_tok=2,moe_intermediate_size=16,shared_expert_intermediate_size=16)
    audio=AudioDecoderConfig(dim=32,intermediate_size=64,n_head=4,n_local_heads=2,head_dim=8,
        norm_eps=1e-6,rope_base=10000.,rotary_percent=.5,vocab_size=16,num_codebooks=10,
        shared_enrichment_layers=4,vq_backbone_codebooks=1)
    return FishOmniConfig(text=text,audio_decoder=audio,semantic_start_token_id=64,semantic_end_token_id=79,eos_token_id=2,fp8_experts=False)


def run():
    torch.set_num_threads(2);torch.manual_seed(1234);cfg=tiny_config()
    model=construct(cfg,dtype=torch.float32,device='cpu')
    with torch.no_grad():
        for p in model.parameters():p.normal_(0,.08 if p.ndim>1 else .02)
    train=FullFT(model,checkpointing=True).train();optimizer=torch.optim.AdamW(train.parameters(),lr=1e-3)
    prompt=torch.zeros(12,11,dtype=torch.long);prompt[:,0]=torch.randint(4,60,(12,))
    # Include context audio frames; they must affect context but never receive a loss.
    prompt[2:6,1:]=torch.randint(0,16,(4,10));prompt[2:6,0]=prompt[2:6,1]+64
    codes=torch.randint(0,16,(10,75));batch=training_rows(prompt,codes,cfg)
    assert batch['assistant'].sum()==76 and not batch['assistant'][:11].any()
    assert batch['next_frames'][11,1]==codes[0,0]
    assert batch['next_frames'][-1,0]==cfg.eos_token_id
    before={n:p.detach().clone() for n,p in train.named_parameters()}
    first=train(**batch);assert torch.isfinite(first['loss']);first['loss'].backward()
    missing=[n for n,p in train.named_parameters() if p.grad is None]
    invalid=[n for n,p in train.named_parameters() if p.grad is not None and not torch.isfinite(p.grad).all()]
    assert not missing and not invalid,(missing,invalid)
    families={}
    for token in ['embed_tokens','linear_attn','self_attn','mlp.experts','mlp.gate','lm_head','shared_layers','residual_layers','codebook_heads','codebook_embeddings']:
        norm=sum(p.grad.float().norm().item() for n,p in train.named_parameters() if token in n)
        assert norm>0,token;families[token]=norm
    optimizer.step();updated=[n for n,p in train.named_parameters() if not torch.equal(before[n],p.detach())]
    train.eval()
    with torch.no_grad():expected=train(**batch)['loss']
    state={export_name(n):p.detach().clone() for n,p in train.named_parameters()}
    restored=construct(cfg,dtype=torch.float32,device='cpu')
    from fish_speech.models.text2semantic.fish_omni.backbone import load_backbone_weights
    from fish_speech.models.text2semantic.fish_omni.tower import load_audio_decoder_weights
    load_backbone_weights(restored.backbone,[(k,v) for k,v in state.items() if not k.startswith('audio_decoder')])
    load_audio_decoder_weights(restored.audio_decoder,[(k,v) for k,v in state.items() if k.startswith('audio_decoder')])
    new=FullFT(restored,router_aux_weight=0).eval()
    with torch.no_grad():actual=new(**batch)['loss']
    torch.testing.assert_close(actual,expected,rtol=1e-6,atol=1e-6)
    result={'status':'passed','torch':torch.__version__,'architecture':'native Drama3,4hybrid backbone layers+4shared+9residual tower layers,10codebooks',
        'scope':'Small random-weight architecture test only; no35B training, no trained Korean voice, no quality claim',
        'lora_used':False,'all_tts_parameters_trainable':all(p.requires_grad for p in train.parameters()),
        'trainable_parameters':sum(p.numel() for p in train.parameters()),'parameter_tensors':len(before),
        'parameter_tensors_updated':len(updated),'missing_gradients':missing,'nonfinite_gradients':invalid,
        'gradient_norm_by_family':families,'target_frames':first['supervised_frames'],'eos_supervised':first['supervised_eos'],
        'reference_loss_masked':True,'activation_checkpoint_backward_passed':True,
        'initial_loss':float(first['loss'].detach()),'updated_loss':float(expected),'native_export_reload_loss':float(actual),
        'native_export_roundtrip_passed':True}
    return result


if __name__=='__main__':print(json.dumps(run(),indent=2))
