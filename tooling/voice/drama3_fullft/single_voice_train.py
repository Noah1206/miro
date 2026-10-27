"""New male FullFT stage from23 native weights, then exact stage-only resumes.

No Modal dispatch by import. GPU execution needs a separate numeric authorization,
the frozen schedule, original codec cache and new train-only teacher statistics.
This runner has CPU contract checks; the new GPU path is not yet exercised.
"""
import argparse,hashlib,json,math,os,random,time
from pathlib import Path
import numpy as np
import torch
from .single_voice_plan import build_plan,pair_at,require_frozen_plan,TTS_PARAMETERS
from .training_state import atomic_json,restore_training_state,save_training_state

def main():
    ap=argparse.ArgumentParser()
    for k in ['manifest','schedule','output','assets','codes','teacher-features','authorization']:
        ap.add_argument('--'+k,required=True)
    start=ap.add_mutually_exclusive_group(required=True)
    start.add_argument('--source23-native');start.add_argument('--resume-checkpoint')
    a=ap.parse_args();out=Path(a.output)
    auth=json.loads(Path(a.authorization).read_text())
    if auth.get('authorized_for_paid_training') is not True:raise ValueError('Missing user-approved paid-job authorization')
    cap=float(auth['new_job_cap_usd']);deadline=float(auth['training_deadline_unix'])
    if not math.isfinite(cap) or cap<=0 or not math.isfinite(deadline):raise ValueError('Invalid numeric budget/deadline')
    code_names=['single_voice_train.py','single_voice_plan.py','core.py','data.py','codec_contract.py','korean_teacher.py','training_state.py']
    code_hashes={name:hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in code_names}
    code_sha=hashlib.sha256(json.dumps(code_hashes,sort_keys=True).encode()).hexdigest()
    if auth.get('training_code_sha256')!=code_sha:raise ValueError('Training program differs from the authorized frozen code')
    reserve=max(600.,float(auth.get('checkpoint_reserve_seconds',600)))
    if deadline-time.time()<reserve+180:raise ValueError('Insufficient runtime to learn and save; do not allocate/train')
    from .data import audit,read_rows,make_batch
    from .codec_contract import validate_training_contract
    from .korean_teacher import TEACHER_DIM,TEACHER_ID,TEACHER_REV,load_teacher_targets
    from .core import FullFT,construct,CheckpointReader,SOURCE_REV,MODEL_REV
    rows=read_rows(a.manifest);lookup={r['clip_id']:r for r in rows}
    schedule=[json.loads(x) for x in Path(a.schedule).read_text().splitlines()]
    plan=json.loads((out/'plan.json').read_text())
    actual=build_plan(rows,schedule,source23_manifest_sha256=plan['source_checkpoint_manifest_sha256'],seed=plan['seed'])
    require_frozen_plan(plan,actual)
    if auth.get('plan_sha256')!=plan['sha256']:raise ValueError('Authorization is for a different data/label plan')
    contract=validate_training_contract(a.codes,a.assets)
    stats=Path(a.teacher_features)/'training_stats.pt'
    if not stats.exists():raise FileNotFoundError('New male train-only teacher statistics are required')
    profile=torch.load(stats,map_location='cpu',weights_only=True)
    expected_train={r['clip_id']:r['sha256'] for r in rows if r['split']=='train'}
    if profile.get('training_source_hashes')!=expected_train:raise ValueError('Teacher normalization was not fitted on this exact male training split')
    # Validate every required audio/teacher cache before constructing35.9B.
    from .codec_contract import validate_cache
    rank_hint=int(os.environ.get('RANK','0'))
    needed={item[key] for item in plan['schedule'] if item['rank']==rank_hint for key in ['target','reference']}
    print('MALE_STAGE_PHASE',rank_hint,'validate_assigned_cache',len(needed),flush=True)
    for row in rows:
        if row['clip_id'] not in needed:continue
        cached=torch.load(Path(a.codes)/(row['clip_id']+'.pt'),map_location='cpu',weights_only=True)
        codes=validate_cache(cached,row['sha256'],contract)
        if row['split']!='reference':load_teacher_targets(a.teacher_features,row,codes.shape[-1],contract)
    if a.source23_native:
        native=Path(a.source23_native)
        complete=json.loads((native/'EXPORT_COMPLETE.json').read_text())
        origin=json.loads((native/'MIRO_TRAINING.json').read_text())
        if complete['bytes']!=TTS_PARAMETERS*2 or origin['steps_completed']!=23:raise ValueError('Not the saved actual35.9B step23 weights')
        if origin.get('checkpoint')!=plan['source_checkpoint']:raise ValueError('Wrong step23 provenance')
        if not (native/'VOLUME_COMMITTED.json').exists():raise ValueError('Source23 native export is not committed')
        # Do not read70GB eight times while eight H100s idle. A CPU export/verify
        # task must publish this witness before any training container starts.
        proof=json.loads((native/'CPU_NATIVE_VERIFICATION.json').read_text())
        if proof.get('verified_parameter_bytes')!=TTS_PARAMETERS*2 or proof.get('verified_tensors')!=885:
            raise ValueError('Source23 native payload has no CPU verification witness')
        if proof.get('checksums_file_sha256')!=hashlib.sha256((native/'SHA256SUMS.json').read_bytes()).hexdigest():
            raise ValueError('Native verification witness belongs to a different shard manifest')
    import deepspeed
    from tokenizers import Tokenizer
    from fish_speech.models.text2semantic.fish_omni.config import FishOmniConfig
    deepspeed.init_distributed();rank=torch.distributed.get_rank();world=torch.distributed.get_world_size()
    if world!=plan['world']:raise ValueError('Eight-rank partition contract required')
    local=int(os.environ['LOCAL_RANK']);torch.cuda.set_device(local)
    settings=json.loads((out/'zero3.json').read_text())
    if settings['gradient_accumulation_steps']!=2 or settings['train_micro_batch_size_per_gpu']!=1:raise ValueError('Changed global batch')
    torch.manual_seed(plan['seed']);random.seed(plan['seed']);np.random.seed(plan['seed'])
    cfg=FishOmniConfig.from_dict(json.loads((Path(a.assets)/'config.json').read_text()))
    tokenizer=Tokenizer.from_file(str(Path(a.assets)/'tokenizer.json'))
    with deepspeed.zero.Init(config_dict_or_path=settings,dtype=torch.bfloat16,remote_device='cuda'):
        model=FullFT(construct(cfg,tokenizer,dtype=torch.bfloat16,device=torch.device('cuda',local)),
            checkpointing=True,teacher_dim=TEACHER_DIM,teacher_weight=plan['teacher_weight'])
    if a.source23_native:
        reader=CheckpointReader(a.source23_native) if rank==0 else None
        for index,(name,p) in enumerate(model.named_parameters()):
            if name.startswith('korean_teacher_head.'):continue
            with deepspeed.zero.GatheredParameters([p],modifier_rank=0):
                if rank==0:
                    value=reader.parameter(name,p.shape,p.dtype)
                    if not torch.isfinite(value).all():raise FloatingPointError('Nonfinite saved23 tensor')
                    p.data.copy_(value.to(p.device));del value
            if rank==0 and index%100==0:print('MALE_STAGE_LOAD23',index,name,flush=True)
        if reader is not None:reader.close()
    groups=[{'params':[p for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.')],'lr':plan['tts_learning_rate']},
        {'params':list(model.korean_teacher_head.parameters()),'lr':plan['head_learning_rate']}]
    engine,_,_,_=deepspeed.initialize(model=model,model_parameters=groups,config=settings)
    total=sum(getattr(p,'ds_numel',p.numel()) for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.'))
    if total!=TTS_PARAMETERS or not all(p.requires_grad for p in model.parameters()):raise ValueError('Actual full parameter FT is required')
    metadata={'source_commit':SOURCE_REV,'model_revision':MODEL_REV,'plan_sha256':plan['sha256'],
        'data':audit(a.manifest),'codec_contract':contract,'method':'full_parameter_finetuning','lora':False,
        'source_checkpoint_updates':23,'new_stage_updates_planned':10,'trainable_tts_parameters':total,
        'teacher':{'id':TEACHER_ID,'revision':TEACHER_REV,'training_only':True,'loss_weight':plan['teacher_weight']},
        'warm_start_optimizer_reset_once':True,'teacher_projection_reset_for_new_statistics_once':True,
        'checkpoint_policy':plan['checkpoint_policy'],'numeric_pause_supervision':False,
        'quality_approved':False,'gpu_runner_previously_validated':False}
    metadata['training_code_sha256']=code_sha
    if a.resume_checkpoint:
        saved_client=json.loads((Path(a.resume_checkpoint)/'COMPLETE.json').read_text())['client']
        if saved_client.get('training_code_sha256')!=code_sha:raise ValueError('Changed trainer code; refuse to call this an exact resume')
        state=restore_training_state(engine,a.resume_checkpoint,plan);micro=state['next_micro_batch']
        if micro!=int(engine.global_steps)*plan['accumulation']:raise ValueError('Resume cursor/optimizer position mismatch')
        metadata['resumed_from']=a.resume_checkpoint
    else:
        if int(engine.global_steps)!=0:raise ValueError('New task must start at new-stage update0, not pretend to resume007 optimizer')
        micro=0
    initial_step=int(engine.global_steps)
    if rank==0:atomic_json(out/'NEW_STAGE_METADATA.json',metadata)
    def batch(item):
        return make_batch(lookup[item['target']],lookup[item['reference']],item['speaker_slot'],engine.module,tokenizer,a.codes,contract,a.teacher_features)
    def handoff(folder,step):
        if rank==0:
            atomic_json(out/'CHECKPOINT_HANDOFF.json',{'path':str(folder),'new_stage_step':step,
                'historical_plus_new_updates_for_provenance_only':23+step,'ten_update_goal_complete':step==10,
                'full_state_committed':True,'independent_engine_reload_of_new_checkpoint_verified':False,
                'new_audio_generated':False,'voice_quality_validated':False})
    engine.train();start_time=time.monotonic();last_boundary=start_time;last_update=120.;local_sum=0.
    while int(engine.global_steps)<plan['steps']:
        if micro%plan['accumulation']==0:
            stop=torch.tensor([int(rank==0 and time.time()+max(95.,last_update*1.2)+reserve+30>=deadline)],device=engine.device)
            torch.distributed.broadcast(stop,src=0)
            if stop.item():
                step=int(engine.global_steps)
                if step==0:
                    if rank==0:atomic_json(out/'STOPPED_WITHOUT_NEW_UPDATES.json',{'source23_preserved':True,'reason':'Runtime reserve insufficient after loading'})
                elif a.resume_checkpoint and step==initial_step:
                    handoff(a.resume_checkpoint,step)
                else:
                    folder=save_training_state(engine,out,plan,micro,metadata);handoff(folder,step)
                break
        item=pair_at(plan,micro,rank);value=engine(**batch(item))
        finite=torch.tensor([int(torch.isfinite(value['loss']).item())],device=engine.device)
        torch.distributed.all_reduce(finite,op=torch.distributed.ReduceOp.MIN)
        if not finite.item():raise FloatingPointError('Nonfinite loss on at least one rank')
        engine.backward(value['loss']);boundary=engine.is_gradient_accumulation_boundary();engine.step();micro+=1;local_sum+=float(value['speech_loss'])
        if boundary:
            step=int(engine.global_steps);last_update=time.monotonic()-last_boundary;last_boundary=time.monotonic()
            norm=engine.get_global_grad_norm();norm=float(norm) if norm is not None else None
            if norm is None or not math.isfinite(norm) or norm<=0:raise FloatingPointError('Invalid FullFT gradient norm')
            metric=torch.tensor([local_sum/2,float(value['korean_teacher_loss'])],device=engine.device,dtype=torch.float64)
            torch.distributed.all_reduce(metric);metric/=world;local_sum=0.
            if rank==0:
                event={'new_stage_step':step,'source23_updates':23,'micro_cursor':micro,'speech_loss':float(metric[0]),
                    'teacher_loss':float(metric[1]),'global_gradient_norm':norm,'seconds':time.monotonic()-start_time}
                with (out/'history.jsonl').open('a') as f:f.write(json.dumps(event)+'\n')
                print('MALE_STAGE_UPDATE',json.dumps(event),flush=True)
            stop=torch.tensor([int(rank==0 and (step==plan['steps'] or time.time()+max(95.,last_update*1.2)+reserve+30>=deadline))],device=engine.device)
            torch.distributed.broadcast(stop,src=0)
            if stop.item():
                folder=save_training_state(engine,out,plan,micro,metadata)
                handoff(folder,step)
                break
    torch.distributed.barrier();torch.distributed.destroy_process_group()

if __name__=='__main__':main()
