"""All TTS parameters trainable; causal teacher forcing with context-only references.

Uses the pinned native Drama3 model, not a generic text-only Qwen trainer.
The separately loaded audio tokenizer remains frozen to keep code IDs stable.
"""
import dataclasses
import math
from contextlib import ExitStack
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

SOURCE_REV = '541566932abbaebcb0a40e562a1f846738383f38'
MODEL_REV = 'b2b5ee998034b2975720906c815e7fb0e9f007bd'


def training_rows(prompt, target_codes, config):
    """Label only assistant audio and its EOS; no context/reference loss."""
    assert target_codes.ndim == 2
    n = config.audio_decoder.num_codebooks
    assert target_codes.shape[0] == n and target_codes.shape[1] > 0
    assert not target_codes.dtype.is_floating_point
    assert 0 <= target_codes.min() and target_codes.max() < config.audio_decoder.vocab_size
    target_codes = target_codes.to(device=prompt.device, dtype=torch.long)
    target = torch.cat((target_codes[:1] + config.semantic_start_token_id, target_codes)).T
    eos = prompt.new_zeros((1, 1+n)); eos[0,0] = config.eos_token_id
    rows = torch.cat((prompt, target, eos))
    # Row i predicts row i+1. Last prompt row predicts first target frame.
    assistant = torch.arange(len(rows)-1,device=rows.device) >= len(prompt)-1
    return {'frames':rows[:-1], 'next_frames':rows[1:], 'assistant':assistant,
            'target_frames':len(target), 'prompt_rows':len(prompt)}


def enable_activation_checkpointing(model):
    from torch.utils.checkpoint import checkpoint
    for layer in [*model.backbone.model.layers,
                  *model.audio_decoder.shared_layers,*model.audio_decoder.residual_layers]:
        original=layer.forward
        def wrapped(*args,_original=original,**kwargs):
            return checkpoint(_original,*args,use_reentrant=False,**kwargs)
        layer.forward=wrapped


class FullFT(nn.Module):
    def __init__(self, model, *, router_aux_weight=1e-3, checkpointing=False,teacher_dim=None,teacher_weight=0.):
        super().__init__()
        self.backbone=model.backbone;self.audio_decoder=model.audio_decoder
        self.config=model.config;self.router_aux_weight=router_aux_weight
        self.teacher_weight=float(teacher_weight)
        if teacher_dim is not None:
            self.korean_teacher_head=nn.Linear(self.config.text.hidden_size,teacher_dim,bias=False,
                device=self.backbone.lm_head.weight.device,dtype=self.backbone.lm_head.weight.dtype)
        elif self.teacher_weight:raise ValueError('Teacher weight requires a training-only projection')
        self._router_losses=[];self._router_handles=[]
        if any(layer.mlp.experts.fp8 for layer in self.backbone.model.layers):
            raise ValueError('Full FT requires dequantized trainable BF16/FP32 experts, not FP8 inference buffers')
        if self.backbone.max_seq_len:
            raise ValueError('Training must start with a fresh model and no inference KV caches')
        if any(layer.transformer_layer.attention.k_cache is not None
               for layer in [*self.audio_decoder.shared_layers,*self.audio_decoder.residual_layers]):
            raise ValueError('Tower inference caches are not a training path')
        for p in self.parameters():p.requires_grad_(True)
        # Never gather one huge expert tensor separately for every token/expert pair.
        # The native grouped expert loop is differentiable and keeps original weights.
        from fish_speech.models.text2semantic.fish_omni import moe
        moe.GATHERED_EXPERT_MAX_ROWS=0
        for layer in self.backbone.model.layers:
            self._router_handles.append(layer.mlp.gate.register_forward_hook(self._router_hook))
        if checkpointing:enable_activation_checkpointing(self)

    def _router_hook(self,module,args,logits):
        if not self.training or self.router_aux_weight==0:return
        probs=logits.float().softmax(-1)
        selected=probs.topk(self.config.text.num_experts_per_tok,dim=-1).indices
        frequency=F.one_hot(selected,num_classes=probs.shape[-1]).float().mean((0,1))
        self._router_losses.append(probs.shape[-1]*(frequency*probs.mean(0)).sum())

    def forward(self,frames,next_frames,assistant,teacher_targets=None,**unused):
        self._router_losses=[]
        tower=self.audio_decoder
        device=tower.device
        frames=frames.to(device);next_frames=next_frames.to(device);assistant=assistant.to(device)
        assert frames.shape==next_frames.shape and assistant.shape==(len(frames),)
        positions=torch.arange(len(frames),device=device)
        embeddings=tower.embed_backbone(frames,self.backbone.embed(frames[:,0]))
        hidden=self.backbone(inputs_embeds=embeddings[None],input_pos=positions)[0].to(device)
        semantic=tower.is_semantic(next_frames[:,0]);mask=assistant & semantic
        eos_mask=assistant & (next_frames[:,0]==self.config.eos_token_id)
        if not mask.any() or not eos_mask.any():raise ValueError('Need target audio frames and supervised EOS')
        # Chunk the large LM projection; every speech frame and EOS remains supervised.
        def main_ce(select):
            indices=select.nonzero().flatten();total=hidden.new_zeros((),dtype=torch.float32)
            count=torch.tensor(len(indices),device=device,dtype=torch.long)
            # ZeRO3 gathers the LM head on every call. Different audio lengths must
            # still make the same number of calls, including during backward.
            if torch.distributed.is_available() and torch.distributed.is_initialized():
                torch.distributed.all_reduce(count,op=torch.distributed.ReduceOp.MAX)
            for start in range(0,int(count),32):
                idx=indices[start:start+32];active=len(idx)>0
                if not active:idx=indices[:1]
                logits=self.backbone.compute_logits(hidden[idx]).float()
                total=total+F.cross_entropy(logits,next_frames[idx,0],reduction='sum')*(1. if active else 0.)
            return total/len(indices)
        sem_loss=main_ce(mask);eos_loss=main_ce(eos_mask)
        h=tower.run_shared(hidden,next_frames[:,1],semantic,positions,frames)
        cb_losses=[]
        for k,(layer,head) in enumerate(zip(tower.residual_layers,tower.codebook_heads),1):
            # At position i, inject next frame's code k-1 and predict its code k.
            h=layer(h,next_frames[:,k],semantic,positions)
            cb_losses.append(F.cross_entropy(head(h[mask]).float(),next_frames[mask,k+1]))
        cb_loss=torch.stack(cb_losses).mean()
        aux=torch.stack(self._router_losses).mean() if self._router_losses else sem_loss.new_zeros(())
        speech_loss=.5*sem_loss+.5*cb_loss+eos_loss+self.router_aux_weight*aux
        ko_loss=speech_loss.new_zeros(())
        if self.teacher_weight or (teacher_targets is not None and hasattr(self,'korean_teacher_head')):
            from .korean_teacher import teacher_loss
            ko_loss=teacher_loss(self.korean_teacher_head,hidden,mask,teacher_targets)
        loss=speech_loss+self.teacher_weight*ko_loss
        return {'loss':loss,'semantic_loss':sem_loss.detach(),'codebook_loss':cb_loss.detach(),
                'speech_loss':speech_loss.detach(),'korean_teacher_loss':ko_loss.detach(),
                'eos_loss':eos_loss.detach(),'router_aux':aux.detach(),'supervised_frames':int(mask.sum()),
                'supervised_eos':int(eos_mask.sum()),'codebook_losses':[x.detach() for x in cb_losses]}


def construct(config,tokenizer=None,*,dtype=torch.bfloat16,device=None):
    from fish_speech.models.text2semantic.fish_omni.backbone import FishOmniBackbone
    from fish_speech.models.text2semantic.fish_omni.tower import FishOmniAudioDecoder
    from fish_speech.models.text2semantic.fish_omni.model import FishOmniModel
    return FishOmniModel(config,
        FishOmniBackbone(config.text,fp8_experts=False,dtype=dtype,device=device),
        FishOmniAudioDecoder(config,dtype=dtype,device=device),tokenizer)


def source_keys(native_name,index,normalized=None):
    """Map native TTS parameters back to the released checkpoint namespace."""
    from fish_speech.models.text2semantic.fish_omni.backbone import backbone_name
    from fish_speech.models.text2semantic.fish_omni.tower import TOWER_CHECKPOINT_PREFIXES
    if native_name.startswith('backbone.'):
        if normalized is None:normalized={backbone_name(k):k for k in index if not k.startswith('audio_decoder')}
        name=native_name[len('backbone.'):]
        if name=='lm_head.weight':return [(normalized[name],None)]
        import re
        match=re.fullmatch(r'model.layers.(\d+).mlp.experts.(w13_weight|w2_weight)',name)
        if match:
            layer,kind=match.groups();parts=['gate_proj','up_proj'] if kind=='w13_weight' else ['down_proj']
            # Checkpoint may be fused or per-expert FP8; reject silent guessing.
            fused=f'model.layers.{layer}.mlp.experts.'+('gate_up_proj' if kind=='w13_weight' else 'down_proj')
            if fused in normalized:return [(normalized[fused],None)]
            keys=[]
            for expert in range(max(int(x.split('.')[5]) for x in normalized if x.startswith(f'model.layers.{layer}.mlp.experts.') and x.split('.')[5].isdigit())+1):
                for part in parts:
                    base=f'model.layers.{layer}.mlp.experts.{expert}.{part}'
                    keys.append((normalized[base+'.weight'],(expert,part)))
            return keys
        if name in normalized:return [(normalized[name],None)]
        raise KeyError(native_name)
    name=native_name[len('audio_decoder.'):]
    for released,native in TOWER_CHECKPOINT_PREFIXES.items():
        if name.startswith(native):return [(released+name[len(native):],None)]
    raise KeyError(native_name)


class CheckpointReader:
    """Materialize one parameter at a time; FP8 release weights dequantized, not recovered originals."""
    def __init__(self,folder):
        import json
        self.folder=Path(folder)
        self.index=json.loads((self.folder/'model.safetensors.index.json').read_text())['weight_map']
        from fish_speech.models.text2semantic.fish_omni.backbone import backbone_name
        self.normalized={backbone_name(k):k for k in self.index if not k.startswith('audio_decoder')}
        self._contexts=ExitStack();self._handles={}

    def read(self,key):
        from safetensors import safe_open
        shard=self.index[key]
        if shard not in self._handles:
            self._handles[shard]=self._contexts.enter_context(safe_open(self.folder/shard,framework='pt',device='cpu'))
        return self._handles[shard].get_tensor(key)

    def close(self):
        self._handles.clear();self._contexts.close()

    def parameter(self,name,shape,dtype):
        from fish_speech.models.text2semantic.fish_omni.moe import dequantize_fp8_blocks
        from fish_speech.models.text2semantic.fish_omni.fp8_moe import FP8_DTYPE
        keys=source_keys(name,self.index,self.normalized)
        if len(keys)==1 and keys[0][1] is None:
            t=self.read(keys[0][0]);assert tuple(t.shape)==tuple(shape);return t.to(dtype)
        result=torch.empty(shape,dtype=dtype)
        for key,(expert,part) in keys:
            t=self.read(key)
            if t.dtype==FP8_DTYPE:t=dequantize_fp8_blocks(t,self.read(key.replace('.weight','.weight_scale_inv')),torch.float32)
            if part=='down_proj':target=result[expert]
            else:
                half=shape[1]//2;target=result[expert,:half] if part=='gate_proj' else result[expert,half:]
            assert target.shape==t.shape;target.copy_(t)
        return result


def export_name(name):
    from fish_speech.models.text2semantic.fish_omni.tower import TOWER_CHECKPOINT_PREFIXES
    import re
    if name.startswith('backbone.'):
        key=name[len('backbone.'):]
        key=re.sub(r'\.experts\.w13_weight$','.experts.gate_up_proj',key)
        return re.sub(r'\.experts\.w2_weight$','.experts.down_proj',key)
    key=name[len('audio_decoder.'):]
    for released,native in TOWER_CHECKPOINT_PREFIXES.items():
        if key.startswith(native):return released+key[len(native):]
    raise KeyError(name)
