"""Actual 35.9B Full FT: one-time native warm start, then exact ZeRO resumes."""
import argparse
import json
import math
import os
from pathlib import Path
import random
import time

import torch
from .core import construct,FullFT,CheckpointReader,SOURCE_REV,MODEL_REV
from .data import audit,read_rows,make_batch
from .codec_contract import validate_training_contract
from .korean_teacher import TEACHER_DIM,TEACHER_ID,TEACHER_REV
from .matched_fullsize import build_plan
from .training_state import atomic_json,capture_rng,restore_rng,save_training_state,restore_training_state,latest_committed_checkpoint


def budget_checkpoint_due(step,target,now,deadline,reserve,last_update_seconds):
    """Keep enough time to persist this completed update before the deadline."""
    return step>=target or bool(deadline and now+max(95.,last_update_seconds*1.15)+reserve>=deadline)


def main():
    ap=argparse.ArgumentParser()
    for name in ['root','original','output']:ap.add_argument('--'+name,required=True)
    ap.add_argument('--warm-start',default='');ap.add_argument('--resume-checkpoint',default='')
    ap.add_argument('--target-step',type=int,default=25)
    ap.add_argument('--handoff-step',type=int,default=0)
    ap.add_argument('--verify-resume-only',action='store_true')
    ap.add_argument('--deadline-unix',type=float,default=0.)
    ap.add_argument('--checkpoint-policy',choices=['every-five','budget'],default='every-five')
    ap.add_argument('--checkpoint-reserve-seconds',type=float,default=360.)
    a=ap.parse_args()
    if bool(a.warm_start)==bool(a.resume_checkpoint):raise ValueError('Choose saved native weights or a full training checkpoint; never silently load original weights')
    import deepspeed
    from tokenizers import Tokenizer
    from fish_speech.models.text2semantic.fish_omni.config import FishOmniConfig
    root=Path(a.root);out=Path(a.output);original=Path(a.original)
    rows=read_rows(root/'data/recordings.jsonl');lookup={x['clip_id']:x for x in rows}
    plan=json.loads((out/'plan.json').read_text());assert build_plan(rows)==plan
    contract=validate_training_contract(root/'codes',original)
    settings=json.loads((out/'zero3.json').read_text())
    deepspeed.init_distributed();rank=torch.distributed.get_rank();world=torch.distributed.get_world_size()
    assert world==plan['world'];local=int(os.environ['LOCAL_RANK']);torch.cuda.set_device(local)
    begin=time.monotonic();torch.manual_seed(plan['seed']);random.seed(plan['seed'])
    cfg=FishOmniConfig.from_dict(json.loads((original/'config.json').read_text()))
    tokenizer=Tokenizer.from_file(str(original/'tokenizer.json'))
    with deepspeed.zero.Init(config_dict_or_path=settings,dtype=torch.bfloat16,remote_device='cuda'):
        model=FullFT(construct(cfg,tokenizer,dtype=torch.bfloat16,device=torch.device('cuda',local)),checkpointing=True,teacher_dim=TEACHER_DIM,teacher_weight=.1)
    # A full resume skips the original AND the native-weight loader entirely.
    bootstrap=out/'bootstrap'
    if a.warm_start:
        warm=Path(a.warm_start);complete=json.loads((warm/'EXPORT_COMPLETE.json').read_text())
        if complete['bytes']!=35899643008*2:raise ValueError('Wrong saved model size')
        native_metadata=json.loads((warm/'MIRO_TRAINING.json').read_text())
        if native_metadata['steps_completed']!=1 or native_metadata['plan_sha256']!=plan['sha256']:
            raise ValueError('Wrong saved training origin')
        reader=CheckpointReader(warm) if rank==0 else None
        for index,(name,p) in enumerate(model.named_parameters()):
            if name.startswith('korean_teacher_head.'):continue
            with deepspeed.zero.GatheredParameters([p],modifier_rank=0):
                if rank==0:
                    value=reader.parameter(name,p.shape,p.dtype);p.data.copy_(value.to(p.device));del value
            if rank==0 and index%100==0:print('WARM_LOAD_SAVED_STEP1',index,name,flush=True)
        if reader is not None:reader.close()
        # A small bootstrap makes the newly initialized head and RNG reproducible
        # even if interruption occurs before the first full optimizer checkpoint.
        bootstrap.mkdir(exist_ok=True)
        head=next(model.korean_teacher_head.parameters())
        with deepspeed.zero.GatheredParameters([head],modifier_rank=0):
            if rank==0:
                if (bootstrap/'teacher_head.pt').exists():head.data.copy_(torch.load(bootstrap/'teacher_head.pt',weights_only=True).to(head.device))
                else:torch.save(head.detach().cpu(),bootstrap/'teacher_head.pt')
    groups=[{'params':[p for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.')],'lr':plan['tts_learning_rate']},
            {'params':list(model.korean_teacher_head.parameters()),'lr':plan['head_learning_rate']}]
    engine,_,_,_=deepspeed.initialize(model=model,model_parameters=groups,config=settings)
    total=sum(getattr(p,'ds_numel',p.numel()) for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.'))
    assert total==35899643008 and all(p.requires_grad for p in model.parameters())
    metadata={'arm':'korean_teacher','source_commit':SOURCE_REV,'model_revision':MODEL_REV,
        'data':audit(root/'data/recordings.jsonl'),'codec_contract':contract,'method':'full_parameter_finetuning',
        'lora':False,'trainable_tts_parameters':total,'all_tts_parameters_trainable':True,
        'target_language':'ko','codec_frozen':True,'plan_sha256':plan['sha256'],'steps_planned':plan['steps'],
        'current_budget_target_step':a.target_step,'checkpoint_interval':5 if a.checkpoint_policy=='every-five' else None,
        'checkpoint_policy':a.checkpoint_policy,'quality_approved':False,
        'teacher':{'id':TEACHER_ID,'revision':TEACHER_REV,'loss_weight':.1,'training_only':True},
        'warm_start_optimizer_reset_once':True,'original_weights_retrained_from_step_zero':False,
        'native_source_step':1,'optimizer_checkpoint_saved':False}
    if a.resume_checkpoint:
        state=restore_training_state(engine,a.resume_checkpoint,plan);micro=state['next_micro_batch']
        metadata['resumed_from_training_checkpoint']=a.resume_checkpoint
        metadata['independent_engine_reload_verified']=True
        if rank==0:print('AB_EXACT_RESUME_VERIFIED',json.dumps({'step':engine.global_steps,'next_micro_batch':micro,'path':a.resume_checkpoint}),flush=True)
    else:
        engine.global_steps=1;engine.micro_steps=plan['accumulation'];engine.global_samples=plan['world']*plan['accumulation'];micro=plan['accumulation']
        rng_file=bootstrap/f'rng-rank-{rank:02d}.pt'
        if rng_file.exists():restore_rng(torch.load(rng_file,map_location='cpu',weights_only=False))
        else:torch.save(capture_rng(),rng_file)
        torch.distributed.barrier()
        if rank==0:
            atomic_json(bootstrap/'BOOTSTRAP_COMPLETE.json',{'native_weights':a.warm_start,'step':1,'next_micro_batch':micro,
                'optimizer_is_fresh':True,'old_run_optimizer_not_recovered':True,'world_size':world,'plan_sha256':plan['sha256']})
            print('AB_BOOTSTRAP_READY',str(bootstrap),flush=True)
    ref=lookup[plan['reference']]
    def batch(clip,slot=0):return make_batch(lookup[clip],ref,slot,engine.module,tokenizer,root/'codes',contract,root/'teacher_features')
    def validate(step):
        engine.eval();items=[]
        with torch.no_grad():
            for index in range(rank,len(plan['validation']),world):
                clip=plan['validation'][index];value=engine(**batch(clip));items.append({'clip_id':clip,'speech_loss':float(value['speech_loss']),
                    'teacher_loss':float(value['korean_teacher_loss'])})
        gathered=[None]*world;torch.distributed.all_gather_object(gathered,items)
        if rank==0:
            flat=sorted([x for part in gathered for x in part],key=lambda x:x['clip_id'])
            result={'step':step,'items':flat,'speech_loss_mean':sum(x['speech_loss'] for x in flat)/len(flat),
                    'teacher_loss_mean':sum(x['teacher_loss'] for x in flat)/len(flat)}
            with (out/'validation.jsonl').open('a') as file:file.write(json.dumps(result)+'\n')
            print('AB_VALIDATION korean_teacher',step,result['speech_loss_mean'],flush=True)
        engine.train()
    if a.warm_start:validate(1)
    engine.train();local_sum=0.;paused=False
    def pause_at_saved_step(reason):
        if rank==0:
            atomic_json(out/'SEGMENT_PAUSED.json',{'status':'paused_budget','steps_completed':int(engine.global_steps),
                'target_step':a.target_step,'reason':reason,'independent_engine_reload_verified':bool(a.resume_checkpoint)})
            print('AB_PAUSED_AT_CHECKPOINT',engine.global_steps,reason,flush=True)
    if a.resume_checkpoint and a.verify_resume_only:
        validate(engine.global_steps);pause_at_saved_step('Independent full-state reload verified; no further updates in this verification process')
        torch.distributed.barrier();torch.distributed.destroy_process_group();return
    if a.resume_checkpoint and engine.global_steps<a.target_step:
        saved=json.loads((Path(a.resume_checkpoint)/'COMPLETE.json').read_text())
        next_work=(95.+a.checkpoint_reserve_seconds+30.) if a.checkpoint_policy=='budget' else (5*85+saved.get('save_seconds',180)+30)
        stop=torch.tensor([int(rank==0 and (a.verify_resume_only or
            (a.deadline_unix and time.time()+next_work>a.deadline_unix)))],device=engine.device)
        torch.distributed.broadcast(stop,src=0)
        if bool(stop.item()):
            validate(engine.global_steps);pause_at_saved_step('Resume verified; insufficient budget for another update and complete checkpoint')
            torch.distributed.barrier();torch.distributed.destroy_process_group();return
    last_boundary=time.monotonic()
    while engine.global_steps<a.target_step:
        index=micro*world+rank;value=engine(**batch(plan['targets'][index],(index*7)%16))
        if not torch.isfinite(value['loss']):raise FloatingPointError('Nonfinite loss')
        engine.backward(value['loss']);boundary=engine.is_gradient_accumulation_boundary();engine.step();micro+=1;local_sum+=float(value['speech_loss'])
        if boundary:
            update_seconds=time.monotonic()-last_boundary;last_boundary=time.monotonic()
            norm=engine.get_global_grad_norm();norm=float(norm) if norm is not None else None
            if norm is None or not math.isfinite(norm) or norm<=0:raise FloatingPointError('Invalid gradient norm')
            metric=torch.tensor([local_sum/plan['accumulation'],float(value['korean_teacher_loss'])],dtype=torch.float64,device=engine.device)
            torch.distributed.all_reduce(metric);metric/=world;local_sum=0.
            if rank==0:
                event={'step':engine.global_steps,'speech_loss':float(metric[0]),'teacher_loss':float(metric[1]),'global_gradient_norm':norm,'seconds':time.monotonic()-begin}
                with (out/'history.jsonl').open('a') as file:file.write(json.dumps(event)+'\n')
                print('AB_STEP korean_teacher',json.dumps(event),flush=True)
            budget_stop=torch.tensor([int(rank==0 and a.checkpoint_policy=='budget' and
                budget_checkpoint_due(engine.global_steps,a.target_step,time.time(),a.deadline_unix,
                                      a.checkpoint_reserve_seconds,update_seconds))],device=engine.device)
            torch.distributed.broadcast(budget_stop,src=0)
            save_now=(engine.global_steps%5==0) if a.checkpoint_policy=='every-five' else (bool(budget_stop.item()) or engine.global_steps==a.target_step)
            if save_now:
                if engine.global_steps in [10,25]:validate(engine.global_steps)
                save_started=time.monotonic();folder=save_training_state(engine,out,plan,micro,metadata)
                save_seconds=time.monotonic()-save_started
                if engine.global_steps==a.handoff_step or a.checkpoint_policy=='budget':
                    if rank==0:atomic_json(out/'CHECKPOINT_HANDOFF.json',{'path':str(folder),'step':engine.global_steps})
                    torch.distributed.barrier();torch.distributed.destroy_process_group();return
                remaining_steps=min(5,a.target_step-engine.global_steps)
                reserve=200 if remaining_steps==0 else remaining_steps*85+save_seconds+30
                stop=torch.tensor([int(rank==0 and a.deadline_unix and time.time()+reserve>a.deadline_unix)],device=engine.device)
                torch.distributed.broadcast(stop,src=0)
                if bool(stop.item()):paused=True;pause_at_saved_step('Operating budget guard after five-update checkpoint');break
    if paused:
        torch.distributed.barrier();torch.distributed.destroy_process_group();return
    # Fresh process, fresh ZeRO engine, restored Adam/RNG/data position, then a real
    # distributed validation forward before generating the native inference export.
    validate(engine.global_steps)
    latest=latest_committed_checkpoint(out/'training_checkpoints')
    if latest is None:raise RuntimeError('Do not finish without a committed optimizer checkpoint')
    metadata.update(steps_completed=int(engine.global_steps),optimizer_checkpoint_saved=True,
        clip_presentations_total=int(engine.global_steps)*plan['world']*plan['accumulation'],
        training_checkpoint=latest['path'],independent_engine_reload_verified=True,
        latest_checkpoint_independently_reloaded=latest['path']==a.resume_checkpoint)
    from .live_export import export_live
    exported=export_live(engine.module,original,out/'model',metadata)
    if rank==0:
        result={**metadata,'status':'complete','original_25_update_goal_complete':engine.global_steps==25,
                'native_export':exported,'seconds_this_process':time.monotonic()-begin,
                'voice_quality_validated':False,'production_ready':False}
        atomic_json(out/'result.json',result);print('AB_TRAIN_COMPLETE korean_teacher',flush=True)
    torch.distributed.barrier();torch.distributed.destroy_process_group()


if __name__=='__main__':main()
