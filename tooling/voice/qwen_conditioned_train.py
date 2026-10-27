# Portions of the prefill layout are adapted from Qwen3-TTS.
# Copyright 2026 The Alibaba Qwen team. SPDX-License-Identifier: Apache-2.0
"""Emotion-conditioned Qwen SFT with SDK-matched Korean prefill.

Uses the installed qwen-tts==0.1.1 inference layout. No new vocabulary or
speaker/codec architecture. Explicit next-frame CE avoids ambiguous HF shifts.
"""
import argparse,copy,hashlib,json,math,random,shutil,time
from pathlib import Path
import numpy as np
import torch
import torch.nn.functional as F
from safetensors.torch import save_file
from qwen_tts import Qwen3TTSModel


def tokens(qwen,text,instruct):
    ids=qwen._tokenize_texts([qwen._build_assistant_text(text)])[0]
    ins=qwen._tokenize_texts([qwen._build_instruct_text(instruct)])[0] if instruct else None
    return ids,ins


def prefill(qwen,ids,ins,speaker):
    """Exact non-streaming Korean custom-speaker prompt from SDK 0.1.1."""
    model=qwen.model;talker=model.talker;cfg=model.config
    project=lambda x:talker.text_projection(talker.get_text_embeddings()(x))
    device=ids.device
    specials=torch.tensor([[cfg.tts_bos_token_id,cfg.tts_eos_token_id,cfg.tts_pad_token_id]],device=device)
    bos,eos,pad=project(specials).chunk(3,dim=1)
    korean=cfg.talker_config.codec_language_id['korean']
    prefix_ids=torch.tensor([[cfg.talker_config.codec_think_id,cfg.talker_config.codec_think_bos_id,korean,cfg.talker_config.codec_think_eos_id]],device=device)
    tail_ids=torch.tensor([[cfg.talker_config.codec_pad_id,cfg.talker_config.codec_bos_id]],device=device)
    codec=torch.cat([talker.get_input_embeddings()(prefix_ids),speaker.view(1,1,-1),talker.get_input_embeddings()(tail_ids)],dim=1)
    role=project(ids[:,:3])
    head=torch.cat([pad.expand(-1,codec.shape[1]-2,-1),bos],dim=1)+codec[:,:-1]
    content=torch.cat([project(ids[:,3:-5]),eos],dim=1)+talker.get_input_embeddings()(torch.full((1,ids[:,3:-5].shape[1]+1),cfg.talker_config.codec_pad_id,device=device))
    parts=([project(ins)] if ins is not None else [])+[role,head,content,pad+codec[:,-1:]]
    return torch.cat(parts,dim=1),pad


def sdk_prefill_probe(qwen,ids,ins,speaker):
    """Independent oracle: intercept the SDK's actual talker.generate input."""
    class Captured(Exception):pass
    capture={};original=qwen.model.talker.generate
    def intercept(*args,**kw):
        capture['embeds']=kw['inputs_embeds'].detach().clone();raise Captured()
    with torch.no_grad():
        qwen.model.talker.get_input_embeddings().weight[3000].copy_(speaker)
    qwen.model.config.talker_config.spk_id={'miro007':3000}
    qwen.model.config.talker_config.spk_is_dialect={'miro007':False}
    qwen.model.talker.generate=intercept
    try:
        qwen.model.generate(input_ids=[ids],instruct_ids=[ins],languages=['Korean'],speakers=['miro007'],non_streaming_mode=True,max_new_tokens=1)
    except Captured:pass
    finally:qwen.model.talker.generate=original
    own,_=prefill(qwen,ids,ins,speaker)
    expected=capture['embeds']
    if own.shape!=expected.shape:raise AssertionError((own.shape,expected.shape))
    err=float((own-expected).abs().max())
    if err!=0:raise AssertionError(f'SDK prefill mismatch: {err}')
    return {'instruct_tokens':0 if ins is None else ins.numel(),'prefix_tokens':own.shape[1],'max_abs_error':err}


def objective(qwen,row,speaker,instruct_override=None,audit=None,only_codec0=False):
    ins=row['instruction_ids'] if instruct_override is None else instruct_override
    prefix,pad=prefill(qwen,row['text_ids'],ins,speaker)
    if audit is not None:
        prefix.retain_grad();audit['prefix']=prefix;audit['instruction_tokens']=0 if ins is None else ins.numel()
    codes=row['codes'];n=codes.shape[0];talker=qwen.model.talker
    audio=talker.get_input_embeddings()(codes[:,0])
    for k in range(1,16):audio=audio+talker.code_predictor.get_input_embeddings()[k-1](codes[:,k])
    embeds=torch.cat([prefix,audio.unsqueeze(0)+pad],dim=1)
    length=prefix.shape[1]
    result=talker(inputs_embeds=embeds,attention_mask=torch.ones(embeds.shape[:2],dtype=torch.long,device=embeds.device),output_hidden_states=not only_codec0,use_cache=False)
    # Position prefix[-1] predicts frame 0; final audio input predicts EOS.
    logits=result.logits[0,length-1:length+n]
    targets=torch.cat([codes[:,0],codes.new_tensor([qwen.model.config.talker_config.codec_eos_token_id])])
    if len(logits)!=len(targets) or int(targets[0])!=int(codes[0,0]) or int(targets[-1])!=qwen.model.config.talker_config.codec_eos_token_id:raise AssertionError('Bad next-frame alignment')
    ce=F.cross_entropy(logits.float(),targets)
    if only_codec0:return ce,ce,ce.new_zeros(())
    h=result.hidden_states[0][-1][0,length-1:length+n-1]
    if h.shape[0]!=n:raise AssertionError('Residual code alignment')
    sub_logits,_sdk_shifted_loss=talker.forward_sub_talker_finetune(codes,h)
    # Residual heads are ALREADY aligned to codebooks 1..15; generic causal loss
    # would shift them a second time. Use explicit aligned CE, just like codec0.
    residual=F.cross_entropy(sub_logits.float().reshape(-1,sub_logits.shape[-1]),codes[:,1:].reshape(-1))
    return ce+0.3*residual,ce,residual


def export(qwen,speaker,base,destination):
    destination.mkdir(exist_ok=True,parents=True)
    # Retain model assets but avoid copying the original large weight file.
    shutil.copytree(base,destination,dirs_exist_ok=True,ignore=lambda directory,names:[name for name in names if Path(directory)==Path(base) and name.startswith('model') and (name.endswith('.safetensors') or name.endswith('.safetensors.index.json'))])
    config=json.loads((Path(base)/'config.json').read_text());config['tts_model_type']='custom_voice';config['talker_config']['spk_id']={'miro007':3000};config['talker_config']['spk_is_dialect']={'miro007':False}
    (destination/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2))
    state={'talker.'+k:v.detach().cpu().contiguous() for k,v in qwen.model.talker.state_dict().items()}
    state['talker.model.codec_embedding.weight'][3000].copy_(speaker.detach().cpu())
    save_file(state,str(destination/'model.safetensors'))


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--manifest',required=True);ap.add_argument('--codes',required=True);ap.add_argument('--base',required=True);ap.add_argument('--output',required=True);args=ap.parse_args()
    m=json.loads(Path(args.manifest).read_text());out=Path(args.output);out.mkdir(exist_ok=True,parents=True)
    random.seed(1234);np.random.seed(1234);torch.manual_seed(1234);torch.cuda.manual_seed_all(1234)
    qwen=Qwen3TTSModel.from_pretrained(args.base,device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
    qwen.model.eval()
    if qwen.model.speaker_encoder is not None:
        for param in qwen.model.speaker_encoder.parameters():param.requires_grad_(False)
        import soundfile as sf
        from qwen_tts.core.models.modeling_qwen3_tts import mel_spectrogram
        y,sr=sf.read(m['remote_reference']);assert sr==24000
        mel=mel_spectrogram(torch.tensor(y,dtype=torch.float32).unsqueeze(0),n_fft=1024,num_mels=128,sampling_rate=24000,hop_size=256,win_size=1024,fmin=0,fmax=12000).transpose(1,2)
        with torch.no_grad():speaker=qwen.model.speaker_encoder(mel.to('cuda',torch.bfloat16))[0].detach()
    else:
        speaker=qwen.model.talker.get_input_embeddings().weight[3000].detach().clone()
    code_rows={Path(r['audio']).name:r for r in [json.loads(s) for s in Path(args.codes).read_text().splitlines()]}
    all_rows=[]
    for split in ['train','validation']:
        rows=[]
        for meta in m[split]:
            source=code_rows[meta['file']];ids,ins=tokens(qwen,meta['text'],m['instructions'][meta['mode']]);codes=torch.tensor(source['audio_codes'],dtype=torch.long,device='cuda')
            rows.append({**meta,'text_ids':ids,'instruction_ids':ins,'codes':codes})
        all_rows.append(rows)
    train,validation=all_rows
    # An independent synthetic oracle detects accidental generic causal shifting
    # even when tensor shapes are legal and training loss appears to decrease.
    vocab=qwen.model.talker.code_predictor.config.vocab_size
    targets=(torch.arange(15,device='cuda')+100).view(1,15)
    perfect=torch.full((1,15,vocab),-30.,device='cuda');perfect.scatter_(2,targets.unsqueeze(-1),30.)
    exact=F.cross_entropy(perfect.reshape(-1,vocab),targets.reshape(-1))
    shifted=qwen.model.talker.code_predictor.loss_function(logits=perfect,labels=targets,vocab_size=vocab)
    if not float(exact)<1e-5 or not float(shifted)>10:raise AssertionError('Residual alignment oracle failed')
    loss_oracle={'explicit_aligned_ce':float(exact),'sdk_generic_shifted_ce':float(shifted),'loss_type':qwen.model.talker.code_predictor.loss_type,'token_pairs':15}
    print('RESIDUAL_LOSS_ORACLE',loss_oracle,flush=True)
    probes=[]
    with torch.no_grad():
        for mode in m['instructions']:
            ids,ins=tokens(qwen,'왔어? 오늘은 좀 늦었네.',m['instructions'][mode]);probes.append({'mode':mode,**sdk_prefill_probe(qwen,ids,ins,speaker)})
        probes.append({'mode':'no_instruction',**sdk_prefill_probe(qwen,ids,None,speaker)})
    (out/'alignment_checks.json').write_text(json.dumps({'sdk':'qwen-tts==0.1.1','language':'Korean','prefill_probes':probes,'residual_loss_oracle':loss_oracle,'target_alignment':'explicit frame0..frameN-1, EOS; residual states predict same frame'},ensure_ascii=False,indent=2))
    print('SDK_PREFILL_MATCH',probes,flush=True)
    def validate(margin=False):
        qwen.model.talker.eval();scores=[];contrast=[]
        with torch.no_grad():
            for i,row in enumerate(validation):
                loss,ce,res=objective(qwen,row,speaker);scores.append({'file':row['file'],'mode':row['mode'],'loss':float(loss),'codec0':float(ce),'residual':float(res)})
                if margin and i%4==0:
                    wrong_mode=list(m['instructions'])[(list(m['instructions']).index(row['mode'])+1)%4];_,wrong=tokens(qwen,row['text'],m['instructions'][wrong_mode]);wl,_,_=objective(qwen,row,speaker,wrong)
                    contrast.append({'file':row['file'],'true_mode':row['mode'],'wrong_mode':wrong_mode,'wrong_minus_correct_nll':float(wl-loss)})
        macro=float(np.mean([np.mean([r['loss'] for r in scores if r['mode']==mode]) for mode in m['instructions']]))
        return {'macro_loss':macro,'items':scores,'instruction_contrast':contrast}
    history={'settings':m['settings'],'residual_loss_oracle':loss_oracle,'alignment_checks':probes,'initial_validation':validate(margin=True),'epochs':[]}
    (out/'training_history.json').write_text(json.dumps(history,ensure_ascii=False,indent=2))
    print('INITIAL_VALIDATION',history['initial_validation']['macro_loss'],flush=True)
    rank=m['settings'].get('instruction_ranking')
    optimizer=torch.optim.AdamW(qwen.model.talker.parameters(),lr=m['settings']['lr'],weight_decay=.01)
    best=math.inf
    for epoch in range(m['settings']['epochs']):
        qwen.model.talker.train();order=list(range(len(train)));random.Random(1234+epoch).shuffle(order);optimizer.zero_grad(set_to_none=True);running=[];start=time.monotonic()
        for step,index in enumerate(order):
            gradient_audit={} if epoch==0 and step==0 else None
            loss,ce,res=objective(qwen,train[index],speaker,audit=gradient_audit)
            if rank:
                row=train[index];modes=list(m['instructions']);wrong_mode=modes[(modes.index(row['mode'])+1+(step%3))%4]
                _,wrong_ids=tokens(qwen,row['text'],m['instructions'][wrong_mode])
                _,wrong_ce,_=objective(qwen,row,speaker,instruct_override=wrong_ids,only_codec0=True)
                ranking_loss=F.softplus((ce-wrong_ce)/rank['temperature']+rank['margin'])
                loss=loss+rank['weight']*ranking_loss
            if not torch.isfinite(loss):raise RuntimeError('Non-finite training loss')
            (loss/m['settings']['gradient_accumulation']).backward();running.append(float(loss.detach()))
            if gradient_audit is not None:
                count=gradient_audit['instruction_tokens'];norm=float(gradient_audit['prefix'].grad[:,:count].norm())
                if count<1 or not norm>0:raise AssertionError('Instruction has no learning gradient')
                history['instruction_gradient_check']={'tokens':count,'prefix_gradient_norm':norm}
                print('INSTRUCTION_GRADIENT',norm,flush=True)
            if (step+1)%m['settings']['gradient_accumulation']==0 or step+1==len(order):
                grad=torch.nn.utils.clip_grad_norm_(qwen.model.talker.parameters(),1.0)
                if not torch.isfinite(grad):raise RuntimeError('Non-finite gradient')
                optimizer.step();optimizer.zero_grad(set_to_none=True)
            if step%20==0:print(f'EPOCH {epoch+1} STEP {step}/{len(train)} LOSS {float(loss):.4f}',flush=True)
        val=validate(margin=True);path=out/f'checkpoint-epoch-{epoch+1}';export(qwen,speaker,args.base,path)
        entry={'epoch':epoch+1,'train_mean_loss':float(np.mean(running)),'seconds':time.monotonic()-start,'validation':val,'checkpoint':path.name};history['epochs'].append(entry)
        if val['macro_loss']<best:best=val['macro_loss'];history['best_epoch']=epoch+1;history['best_checkpoint']=path.name
        (out/'training_history.json').write_text(json.dumps(history,ensure_ascii=False,indent=2));print('EPOCH_SAVED',epoch+1,'VALIDATION',val['macro_loss'],'BEST',history['best_epoch'],flush=True)
    print('TRAINING_COMPLETE',history['best_checkpoint'],flush=True)
if __name__=='__main__':main()
