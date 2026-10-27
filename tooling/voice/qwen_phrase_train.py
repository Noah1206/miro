# ICL input construction follows Qwen3-TTS, Apache-2.0, Alibaba Qwen team.
"""Factual phrase-plan SFT, retaining the Base reference-audio/text path."""
import argparse,collections,copy,hashlib,json,math,random,shutil,time
from pathlib import Path
import numpy as np
import torch
import torch.nn.functional as F
from safetensors.torch import save_file
from qwen_tts import Qwen3TTSModel
from qwen_phrase_data import instruction

def token_ids(qwen,text,ref=False):
    return qwen._tokenize_texts([(qwen._build_ref_text if ref else qwen._build_assistant_text)(text)])[0]

def prefill(qwen,row,ref,instruct):
    talker=qwen.model.talker;cfg=qwen.model.config;device=row['text_ids'].device
    project=lambda x:talker.text_projection(talker.get_text_embeddings()(x))
    bos,eos,pad=project(torch.tensor([[cfg.tts_bos_token_id,cfg.tts_eos_token_id,cfg.tts_pad_token_id]],device=device)).chunk(3,1)
    codec=torch.cat([talker.get_input_embeddings()(torch.tensor([[cfg.talker_config.codec_think_id,cfg.talker_config.codec_think_bos_id,cfg.talker_config.codec_language_id['korean'],cfg.talker_config.codec_think_eos_id]],device=device)),ref['speaker'].view(1,1,-1),talker.get_input_embeddings()(torch.tensor([[cfg.talker_config.codec_pad_id,cfg.talker_config.codec_bos_id]],device=device))],dim=1)
    role=project(row['text_ids'][:,:3]);head=torch.cat([pad.expand(-1,codec.shape[1]-2,-1),bos],1)+codec[:,:-1]
    icl,_=qwen.model.generate_icl_prompt(text_id=row['text_ids'][:,3:-5],ref_id=ref['text_ids'][:,3:-2],ref_code=ref['codes'],tts_pad_embed=pad,tts_eos_embed=eos,non_streaming_mode=True)
    parts=([project(qwen._tokenize_texts([qwen._build_instruct_text(instruct)])[0])] if instruct else [])+[role,head,icl]
    return torch.cat(parts,1),pad

def probe(qwen,row,ref,instruct):
    class Captured(Exception):pass
    original=qwen.model.talker.generate;seen={}
    def intercept(*a,**kw):seen['prefix']=kw['inputs_embeds'].detach().clone();raise Captured()
    qwen.model.talker.generate=intercept
    try:
        ins=qwen._tokenize_texts([qwen._build_instruct_text(instruct)])[0] if instruct else None
        prompt={'ref_code':[ref['codes']],'ref_spk_embedding':[ref['speaker']],'x_vector_only_mode':[False],'icl_mode':[True]}
        qwen.model.generate(input_ids=[row['text_ids']],ref_ids=[ref['text_ids']],instruct_ids=[ins],voice_clone_prompt=prompt,languages=['Korean'],non_streaming_mode=True,max_new_tokens=1)
    except Captured:pass
    finally:qwen.model.talker.generate=original
    own,_=prefill(qwen,row,ref,instruct);actual=seen['prefix'];assert own.shape==actual.shape
    error=float((own-actual).abs().max());assert error==0.,error
    return {'max_abs_error':error,'prefix_frames':own.shape[1],'reference_frames':len(ref['codes']),'instruction':instruct}

def objective(qwen,row,ref,instruct,audit=None,only_codec0=False):
    prefix,pad=prefill(qwen,row,ref,instruct)
    if audit is not None:prefix.retain_grad();audit['prefix']=prefix
    codes=row['codes'];n=len(codes);talker=qwen.model.talker
    audio=talker.get_input_embeddings()(codes[:,0])
    for k in range(1,16):audio=audio+talker.code_predictor.get_input_embeddings()[k-1](codes[:,k])
    embeds=torch.cat([prefix,audio.unsqueeze(0)+pad],1);start=prefix.shape[1]
    result=talker(inputs_embeds=embeds,attention_mask=torch.ones(embeds.shape[:2],device=embeds.device,dtype=torch.long),output_hidden_states=not only_codec0,use_cache=False)
    logits=result.logits[0,start-1:start+n];targets=torch.cat([codes[:,0],codes.new_tensor([qwen.model.config.talker_config.codec_eos_token_id])])
    losses=F.cross_entropy(logits.float(),targets,reduction='none');weights=row['frame_weights'];assert len(losses)==len(weights)==n+1
    ce=(losses*weights).sum()/weights.sum()
    if only_codec0:return ce,losses.mean(),ce.new_zeros(())
    h=result.hidden_states[0][-1][0,start-1:start+n-1];assert h.shape[0]==n
    residual_logits,_ignored_sdk_shifted_loss=talker.forward_sub_talker_finetune(codes,h)
    residual=F.cross_entropy(residual_logits.float().reshape(-1,residual_logits.shape[-1]),codes[:,1:].reshape(-1))
    return ce+.3*residual,losses.mean(),residual

def export(qwen,base,path):
    path.mkdir(exist_ok=True,parents=True)
    shutil.copytree(base,path,dirs_exist_ok=True,ignore=lambda directory,names:[x for x in names if Path(directory)==Path(base) and x.startswith('model') and (x.endswith('.safetensors') or x.endswith('.safetensors.index.json'))])
    # This experiment changes weights only, not architecture. Keep the pinned
    # Base config verbatim: Transformers4.57.3 diff serialization of the nested
    # Qwen config can raise KeyError('dtype') after truncating config.json.
    config=json.loads((path/'config.json').read_text());assert config['tts_model_type']=='base'
    assert qwen.model.tts_model_type=='base' and qwen.model.speaker_encoder is not None
    state={k:v.detach().cpu().contiguous().clone() for k,v in qwen.model.state_dict().items()}
    save_file(state,str(path/'model.safetensors'))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--manifest',required=True);ap.add_argument('--prepared',required=True);ap.add_argument('--base',required=True);ap.add_argument('--output',required=True);args=ap.parse_args()
    m=json.loads(Path(args.manifest).read_text());data=json.loads(Path(args.prepared).read_text());out=Path(args.output);out.mkdir(parents=True,exist_ok=True);settings=m['settings']
    random.seed(1234);np.random.seed(1234);torch.manual_seed(1234);torch.cuda.manual_seed_all(1234)
    qwen=Qwen3TTSModel.from_pretrained(args.base,device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa');qwen.model.eval()
    for p in qwen.model.parameters():p.requires_grad_(False)
    talker=qwen.model.talker
    for module in [talker.text_projection,talker.codec_head,talker.model.norm,*talker.model.layers[-settings['last_trainable_layers']:]]:
        for p in module.parameters():p.requires_grad_(True)
    trainable=[p for p in talker.parameters() if p.requires_grad]
    code_rows={Path(r['audio']).name:r for r in [json.loads(x) for x in Path('/voices/_qwen_ft/007-20261023-pilot1/train_codes.jsonl').read_text().splitlines()]}
    prepared={}
    for split in ['train','validation']:
        rows=[]
        for meta in data[split]:
            codes=torch.tensor(code_rows[meta['file']]['audio_codes'],device='cuda',dtype=torch.long);weights=torch.ones(len(codes)+1,device='cuda')
            for phrase in meta['alignment']['phrases'][:-1]:
                if phrase['pause_seconds']>=.06:
                    a=max(0,int(phrase['pause_start']*12.5)-1);b=min(len(codes),int(math.ceil(phrase['pause_end']*12.5))+1);weights[a:b]=settings['boundary_frame_weight']
            rows.append({**meta,'codes':codes,'text_ids':token_ids(qwen,meta['text']),'frame_weights':weights})
        prepared[split]=rows
    # Reference pool contains training-only utterances; no target/self reference.
    pools={};ref_specs=[]
    for mode in m['instructions']:
        candidates=sorted([x for x in prepared['train'] if x['mode']==mode],key=lambda x:hashlib.sha256(x['file'].encode()).hexdigest())[:8]
        pools[mode]=[x['file'] for x in candidates];ref_specs+=candidates
    bank={}
    for spec in ref_specs:
        path=Path('/voices/_qwen_ft/007-20261023-pilot1/data')/spec['file'];prompt=qwen.create_voice_clone_prompt(ref_audio=str(path),ref_text=spec['text'])[0]
        bank[spec['file']]={'file':spec['file'],'text':spec['text'],'mode':spec['mode'],'text_ids':token_ids(qwen,spec['text'],ref=True),'codes':prompt.ref_code.detach().clone().to('cuda'),'speaker':prompt.ref_spk_embedding.detach().clone().to('cuda',torch.bfloat16)}
    def choose_ref(row,rng,mixed=False):
        mode=rng.choice([x for x in pools if x!=row['mode']]) if mixed and rng.random()<settings['reference_mismatch_fraction'] else row['mode']
        candidates=[key for key in pools[mode] if key!=row['file'] and bank[key]['text']!=row['text']]
        return bank[rng.choice(candidates)]
    example=prepared['train'][0];ref=choose_ref(example,random.Random(1234));probes=[]
    with torch.no_grad():
        for variant in range(3):probes.append(probe(qwen,example,ref,instruction(example['mode'],example['plan'],variant)))
        probes.append(probe(qwen,example,ref,''))
        vocab=talker.code_predictor.config.vocab_size;target=(torch.arange(15,device='cuda')+100).view(1,15);perfect=torch.full((1,15,vocab),-30.,device='cuda');perfect.scatter_(2,target.unsqueeze(-1),30.);assert float(F.cross_entropy(perfect.reshape(-1,vocab),target.reshape(-1)))<1e-5
    (out/'alignment_checks.json').write_text(json.dumps(probes,ensure_ascii=False,indent=2))
    print('SDK_ICL_PREFIX_VERIFIED',probes,flush=True)
    preflight=out/'checkpoint-initial';export(qwen,args.base,preflight)
    loaded=Qwen3TTSModel.from_pretrained(str(preflight),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
    with torch.no_grad():
        assert torch.equal(loaded.model.talker.codec_head.weight,qwen.model.talker.codec_head.weight)
        roundtrip_probe=probe(loaded,example,ref,instruction(example['mode'],example['plan'],0))
    del loaded
    import gc
    gc.collect();torch.cuda.empty_cache();print('EXPORT_RELOAD_PREFLIGHT_PASSED',roundtrip_probe,flush=True)
    def validate():
        qwen.model.eval();scores=[]
        with torch.no_grad():
            for row in prepared['validation']:
                ref=choose_ref(row,random.Random(row['file']));loss,ce,res=objective(qwen,row,ref,instruction(row['mode'],row['plan'],0));scores.append({'file':row['file'],'mode':row['mode'],'reference':ref['file'],'loss':float(loss),'unweighted_codec0_ce':float(ce),'residual_ce':float(res)})
        return {'macro_loss':float(np.mean([np.mean([r['loss'] for r in scores if r['mode']==mode]) for mode in pools])),'items':scores}
    history={'settings':settings,'train_count':len(prepared['train']),'validation_count':len(prepared['validation']),'trainable_parameters':sum(p.numel() for p in trainable),'total_talker_parameters':sum(p.numel() for p in talker.parameters()),'reference_pool':pools,'initial_validation':validate(),'epochs':[]}
    (out/'training_history.json').write_text(json.dumps(history,ensure_ascii=False,indent=2));print('INITIAL_VALIDATION',history['initial_validation']['macro_loss'],flush=True)
    optimizer=torch.optim.AdamW(trainable,lr=settings['lr'],weight_decay=.01);counts=collections.Counter(x['mode'] for x in prepared['train']);best=math.inf
    for epoch in range(settings['epochs']):
        qwen.model.eval()
        for module in [talker.text_projection,talker.codec_head,talker.model.norm,*talker.model.layers[-settings['last_trainable_layers']:]]:module.train()
        order=list(range(len(prepared['train'])));rng=random.Random(1234+epoch);rng.shuffle(order);optimizer.zero_grad(set_to_none=True);running=[];start=time.monotonic()
        for step,index in enumerate(order):
            row=prepared['train'][index];ref=choose_ref(row,rng,mixed=True);plan=row['continuation_plan'] if row.get('continuation_plan') and rng.random()<settings['continuation_view_probability'] else row['plan'];variant=rng.randrange(3);instruct='' if rng.random()<settings['instruction_dropout'] else instruction(row['mode'],plan,variant);audit={} if step==0 and epoch==0 else None
            loss,ce,res=objective(qwen,row,ref,instruct,audit)
            rank=settings.get('plan_ranking')
            if rank and instruct:
                wrong=copy.deepcopy(plan);axis='speed' if step%2==0 or len(plan['phrases'])==1 else 'pause'
                if axis=='speed':
                    wrong['tempo']=rng.choice([x for x in ['slow','normal','fast'] if x!=plan['tempo']])
                    for segment in wrong['phrases']:segment['tempo']=rng.choice([x for x in ['slow','normal','fast'] if x!=segment['tempo']])
                else:
                    for segment in wrong['phrases'][:-1]:segment['pause']=rng.choice([x for x in ['none','short','long'] if x!=segment['pause']])
                _,negative_ce,_=objective(qwen,row,ref,instruction(row['mode'],wrong,variant),only_codec0=True)
                loss=loss+rank['weight']*F.softplus((ce-negative_ce)/rank['temperature']+rank['margin'])
            balanced=loss*len(order)/(4*counts[row['mode']]);acc=settings['gradient_accumulation'];group_size=min(acc,len(order)-(step//acc)*acc)
            if not torch.isfinite(loss):raise RuntimeError('Nonfinite objective')
            (balanced/group_size).backward();running.append(float(loss.detach()))
            if audit is not None:
                gradient=float(audit['prefix'].grad.norm());assert gradient>0;history['prefix_gradient_norm']=gradient;print('PREFIX_GRADIENT',gradient,flush=True)
            if (step+1)%acc==0 or step+1==len(order):
                grad=torch.nn.utils.clip_grad_norm_(trainable,1.);assert torch.isfinite(grad);optimizer.step();optimizer.zero_grad(set_to_none=True)
            if step%20==0:print('EPOCH',epoch+1,'STEP',step,'/',len(order),'LOSS',float(loss),flush=True)
        validation=validate();path=out/f'checkpoint-epoch-{epoch+1}';export(qwen,args.base,path)
        record={'epoch':epoch+1,'train_mean_loss':float(np.mean(running)),'seconds':time.monotonic()-start,'validation':validation,'checkpoint':path.name};history['epochs'].append(record)
        if validation['macro_loss']<best:best=validation['macro_loss'];history['best_epoch']=epoch+1;history['best_checkpoint']=path.name
        (out/'training_history.json').write_text(json.dumps(history,ensure_ascii=False,indent=2));print('EPOCH_SAVED',epoch+1,'VALIDATION',validation['macro_loss'],flush=True)
    print('TRAINING_COMPLETE',history['best_checkpoint'],flush=True)

if __name__=='__main__':main()
