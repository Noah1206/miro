"""Experimental ZeRO3 full-parameter trainer; one35B step validated, quality unvalidated.

Run with DeepSpeed, on a host containing the pinned Fish source and real codec cache.
No PEFT, LoRA, frozen TTS backbone, or per-speaker adapters are used.
"""
import argparse,hashlib,json,os,time,math
from pathlib import Path
import torch
from .core import construct,FullFT,CheckpointReader,SOURCE_REV,MODEL_REV
from .data import read_rows,audit,choose_pair,make_batch
from .codec_contract import validate_training_contract


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--checkpoint',required=True);ap.add_argument('--manifest',required=True)
    ap.add_argument('--codes',required=True);ap.add_argument('--output',required=True);ap.add_argument('--deepspeed-config',required=True)
    ap.add_argument('--max-steps',type=int,default=25);ap.add_argument('--validate-every',type=int,default=5)
    ap.add_argument('--seed',type=int,default=1234);ap.add_argument('--local_rank',type=int,default=-1)
    ap.add_argument('--teacher-features');ap.add_argument('--teacher-weight',type=float,default=0.)
    ap.add_argument('--preflight-only',action='store_true')
    args=ap.parse_args();data_audit=audit(args.manifest);rows=read_rows(args.manifest)
    codec_contract=validate_training_contract(args.codes,args.checkpoint)
    import deepspeed
    from tokenizers import Tokenizer
    from fish_speech.models.text2semantic.fish_omni.config import FishOmniConfig
    deepspeed.init_distributed();rank=torch.distributed.get_rank();world=torch.distributed.get_world_size()
    begin=time.monotonic()
    torch.cuda.set_device(int(os.environ['LOCAL_RANK']));device=torch.device('cuda',int(os.environ['LOCAL_RANK']))
    torch.manual_seed(args.seed);settings=json.loads(Path(args.deepspeed_config).read_text())
    raw=json.loads((Path(args.checkpoint)/'config.json').read_text());cfg=FishOmniConfig.from_dict(raw)
    tokenizer=Tokenizer.from_file(str(Path(args.checkpoint)/'tokenizer.json'))
    from .korean_teacher import TEACHER_DIM,TEACHER_ID,TEACHER_REV,TEACHER_LAYER
    if bool(args.teacher_features)!=bool(args.teacher_weight):raise ValueError('Teacher cache and positive weight must be provided together')
    # ZeRO partitions each parameter when it is constructed, not after loading70GB/rank.
    with deepspeed.zero.Init(config_dict_or_path=settings,dtype=torch.bfloat16,remote_device='cuda'):
        native=construct(cfg,tokenizer,dtype=torch.bfloat16,device=device)
        model=FullFT(native,checkpointing=True,teacher_dim=TEACHER_DIM if args.teacher_features else None,teacher_weight=args.teacher_weight)
    reader=CheckpointReader(args.checkpoint) if rank==0 else None
    if rank==0:print('FULLFT_PHASE','partitioned_model_constructed',flush=True)
    for index,(name,p) in enumerate(model.named_parameters()):
        if name.startswith('korean_teacher_head.'):continue
        with deepspeed.zero.GatheredParameters([p],modifier_rank=0):
            if rank==0:
                value=reader.parameter(name,p.shape,p.dtype)
                if not torch.isfinite(value).all():raise FloatingPointError('Nonfinite source '+name)
                p.data.copy_(value.to(p.device));del value
        if rank==0 and index%100==0:print('FULLFT_LOAD',index,name,flush=True)
    if rank==0:print('FULLFT_PHASE','released_weights_loaded',flush=True)
    if reader is not None:reader.close()
    engine,optimizer,_,scheduler=deepspeed.initialize(model=model,model_parameters=model.parameters(),config=settings)
    if rank==0:print('FULLFT_PHASE','optimizer_ready',flush=True)
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    total=sum(getattr(p,'ds_numel',p.numel()) for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.'))
    assert all(p.requires_grad for p in model.parameters())
    state={'source_commit':SOURCE_REV,'model_revision':MODEL_REV,'data':data_audit,'trainable_tts_parameters':total,
           'all_tts_parameters_trainable':True,'lora_used':False,'codec_frozen':True,
           'codec_contract':codec_contract,'target_language':'ko','preserve_other_languages':False,
           'korean_teacher':{'id':TEACHER_ID,'revision':TEACHER_REV,'layer':TEACHER_LAYER,'weight':args.teacher_weight,
                             'training_only':True,'codec_changed':False} if args.teacher_features else None,
           'initialization':'BF16 dequantization of released FP8 checkpoint; original prequantized weights not recovered',
           'quality_approved':False,'distributed35b_validation':'This run must supply evidence; preparation is not validation'}
    if rank==0:(output/'run_metadata.json').write_text(json.dumps(state,ensure_ascii=False,indent=2))
    micro=0;engine.train()
    while engine.global_steps<args.max_steps:
        target,ref,slot=choose_pair(rows,micro,rank,world,args.seed)
        batch=make_batch(target,ref,slot,engine.module,tokenizer,args.codes,codec_contract,args.teacher_features)
        if len(batch['frames'])>1024:raise ValueError('Pilot sequence limit1024 exceeded; reslice real recording safely')
        if args.preflight_only:print('FULLFT_PHASE',rank,'batch_ready',len(batch['frames']),flush=True)
        result=engine(**batch)
        if args.preflight_only:print('FULLFT_PHASE',rank,'forward_completed',flush=True)
        engine.backward(result['loss'])
        if args.preflight_only:print('FULLFT_PHASE',rank,'backward_completed',flush=True)
        boundary=engine.is_gradient_accumulation_boundary();engine.step();micro+=1
        if args.preflight_only:print('FULLFT_PHASE',rank,'optimizer_step_completed',flush=True)
        if boundary:
            if rank==0:
                row={'step':engine.global_steps,'loss':float(result['loss'].detach()),'speaker':target['speaker_id'],
                     'semantic_loss':float(result['semantic_loss']),'codebook_loss':float(result['codebook_loss']),
                     'eos_loss':float(result['eos_loss']),'router_aux':float(result['router_aux'])}
                row['speech_loss']=float(result['speech_loss']);row['korean_teacher_loss']=float(result['korean_teacher_loss'])
                with (output/'history.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
                print(row,flush=True)
            if args.preflight_only:
                norm=engine.get_global_grad_norm()
                norm=float(norm) if norm is not None else None
                if norm is None or not math.isfinite(norm) or norm<=0:raise FloatingPointError('Invalid full-size global gradient norm')
                if rank==0:
                    preflight={**state,'status':'passed','scope':'One actual35B optimizer step, real007 data; not voice-quality validation or a completed fine-tuning run',
                        'world_size':world,'step':engine.global_steps,'global_gradient_norm':norm,'losses':row,
                        'peak_gpu_gib_rank0':torch.cuda.max_memory_allocated()/2**30,'gpu':torch.cuda.get_device_name(),
                        'seconds':time.monotonic()-begin,'checkpoint_exported':False}
                    (output/'fullsize_preflight.json').write_text(json.dumps(preflight,ensure_ascii=False,indent=2))
                torch.distributed.barrier();return
            if engine.global_steps%args.validate_every==0:
                engine.eval()
                with torch.no_grad():
                    samples=[]
                    for i in range(len({r['speaker_id'] for r in rows if r['split']=='validation'})):
                        t,r,s=choose_pair(rows,i,0,1,args.seed,split='validation')
                        val=engine(**make_batch(t,r,s,engine.module,tokenizer,args.codes,codec_contract,args.teacher_features))
                        samples.append({'speaker':t['speaker_id'],'clip_id':t['clip_id'],'loss':float(val['loss']),
                                        'speech_loss':float(val['speech_loss']),'korean_teacher_loss':float(val['korean_teacher_loss'])})
                if rank==0:
                    with (output/'validation.jsonl').open('a') as f:f.write(json.dumps({'step':engine.global_steps,'items':samples},ensure_ascii=False)+'\n')
                engine.save_checkpoint(str(output/'checkpoints'),tag=f'step-{engine.global_steps}',client_state=state)
                engine.train()
    engine.save_checkpoint(str(output/'checkpoints'),tag='final',client_state=state)


if __name__=='__main__':main()
