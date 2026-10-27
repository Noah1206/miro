"""Native-path regression: teacher reaches TTS gradients, disappears at inference."""
import tempfile,json
from pathlib import Path
import torch
from .smoke import tiny_config
from .core import construct,FullFT,training_rows,export_name,CheckpointReader
from .export import save_shards
from .korean_teacher import TEACHER_DIM,teacher_loss


def run():
    torch.set_num_threads(2);torch.manual_seed(19);cfg=tiny_config()
    model=FullFT(construct(cfg,dtype=torch.float32,device='cpu'),teacher_dim=TEACHER_DIM,teacher_weight=.1)
    with torch.no_grad():
        for p in model.parameters():p.normal_(0,.08 if p.ndim>1 else .02)
    prompt=torch.zeros(8,11,dtype=torch.long);prompt[:,0]=torch.randint(4,60,(8,))
    b=training_rows(prompt,torch.randint(0,16,(10,20)),cfg);b['teacher_targets']=torch.randn(20,TEACHER_DIM)
    model.train();v=model(**b);v['loss'].backward()
    assert all(p.grad is not None and torch.isfinite(p.grad).all() for p in model.parameters())
    head_norm=float(model.korean_teacher_head.weight.grad.norm());assert head_norm>0
    opt=torch.optim.AdamW(model.parameters(),lr=1e-3);opt.step();model.eval()
    native=construct(cfg,dtype=torch.float32,device='cpu')
    from fish_speech.models.text2semantic.fish_omni.backbone import load_backbone_weights
    from fish_speech.models.text2semantic.fish_omni.tower import load_audio_decoder_weights
    exported={export_name(n):p.detach().clone() for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.')}
    load_backbone_weights(native.backbone,[(k,t) for k,t in exported.items() if not k.startswith('audio_decoder')])
    load_audio_decoder_weights(native.audio_decoder,[(k,t) for k,t in exported.items() if k.startswith('audio_decoder')])
    restored=FullFT(native,router_aux_weight=0).eval()
    with torch.no_grad():expected=model(**b)['speech_loss'];actual=restored(**b)['speech_loss']
    torch.testing.assert_close(expected,actual,rtol=1e-6,atol=1e-6)
    with tempfile.TemporaryDirectory() as d:
        save_shards(model.state_dict(),d);index=json.loads((Path(d)/'model.safetensors.index.json').read_text())
        assert len(index['weight_map'])==len(exported) and not any('teacher' in k for k in index['weight_map'])
        reader=CheckpointReader(d)
        for name,p in model.named_parameters():
            if name.startswith('korean_teacher_head.'):continue
            tensor=reader.parameter(name,p.shape,torch.float32)
            torch.testing.assert_close(tensor,p.detach().to(torch.bfloat16).float(),rtol=0,atol=0)
        reader.close()
    h=torch.randn(9,4,requires_grad=True);mask=torch.tensor([0,0,1,1,1,1,0,0,0],dtype=torch.bool)
    loss=teacher_loss(torch.nn.Linear(4,TEACHER_DIM,bias=False),h,mask,torch.randn(4,TEACHER_DIM));loss.backward()
    assert not h.grad[~mask].any() and h.grad[mask].abs().sum()>0
    return {'status':'passed','all_tts_and_head_gradients_finite':True,'head_gradient_norm':head_norm,
            'assistant_only_direct_supervision':True,'native_export_reload_speech_loss':float(actual),
            'native_export_without_teacher_passed':True,'teacher_required_at_inference':False,
            'streaming_checkpoint_reader_roundtrip_passed':True,
            'scope':'Small random-weight native structural regression; not actual35B or voice quality'}
