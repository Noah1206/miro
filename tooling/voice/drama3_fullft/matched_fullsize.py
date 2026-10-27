"""Matched pretrained35B Full FT, deterministic real007 plan, live inference export."""
import argparse,json,os,time,math,hashlib,random
from pathlib import Path
import torch
from .core import construct,FullFT,CheckpointReader,SOURCE_REV,MODEL_REV
from .data import audit,read_rows,make_batch
from .codec_contract import validate_training_contract
from .korean_teacher import TEACHER_DIM,TEACHER_ID,TEACHER_REV
from .snapshots import snapshot_due,snapshot_destination,publish_snapshot


def build_plan(rows,seed=20261023,steps=25,accumulation=2,world=8):
    rng=random.Random(seed)
    pool=sorted([r['clip_id'] for r in rows if r['split']=='train']);rng.shuffle(pool)
    count=steps*accumulation*world
    targets=pool[:count]
    reference=next(r['clip_id'] for r in rows if r['split']=='reference' and r['emotion']=='neutral')
    validation=[]
    for emotion in ['neutral','happy','sad','angry']:
        group=sorted([r for r in rows if r['split']=='validation' and r['emotion']==emotion],key=lambda r:r['clip_id']);rng.shuffle(group);validation.extend(r['clip_id'] for r in group[:4])
    assert len(set(targets))==count and count==400 and len(validation)==16
    plan={'seed':seed,'steps':steps,'accumulation':accumulation,'world':world,'targets':targets,'validation':validation,'reference':reference,
          'tts_learning_rate':1e-6,'head_learning_rate':5e-4,'teacher_weight_treatment':.1,'clip_presentations':count,
          'note':'One matched pilot, not a fully converged production model; no sample selection by generated quality'}
    plan['sha256']=hashlib.sha256(json.dumps(plan,sort_keys=True).encode()).hexdigest();return plan


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',required=True);ap.add_argument('--original',required=True);ap.add_argument('--output',required=True)
    ap.add_argument('--arm',choices=['baseline','korean_teacher'],required=True);a=ap.parse_args()
    import deepspeed
    from tokenizers import Tokenizer
    from fish_speech.models.text2semantic.fish_omni.config import FishOmniConfig
    root=Path(a.root);out=Path(a.output);original=Path(a.original)
    rows=read_rows(root/'data/recordings.jsonl');data_audit=audit(root/'data/recordings.jsonl');lookup={r['clip_id']:r for r in rows}
    contract=validate_training_contract(root/'codes',original)
    settings=json.loads((out/'zero3.json').read_text());plan=json.loads((out/'plan.json').read_text())
    assert build_plan(rows)==plan
    deepspeed.init_distributed();rank=torch.distributed.get_rank();world=torch.distributed.get_world_size()
    assert world==plan['world'];local=int(os.environ['LOCAL_RANK']);torch.cuda.set_device(local);device=torch.device('cuda',local)
    begin=time.monotonic();torch.manual_seed(plan['seed']);random.seed(plan['seed'])
    cfg=FishOmniConfig.from_dict(json.loads((original/'config.json').read_text()));tokenizer=Tokenizer.from_file(str(original/'tokenizer.json'))
    weight=.1 if a.arm=='korean_teacher' else 0.
    with deepspeed.zero.Init(config_dict_or_path=settings,dtype=torch.bfloat16,remote_device='cuda'):
        model=FullFT(construct(cfg,tokenizer,dtype=torch.bfloat16,device=device),checkpointing=True,teacher_dim=TEACHER_DIM,teacher_weight=weight)
    reader=CheckpointReader(original) if rank==0 else None
    for i,(name,p) in enumerate(model.named_parameters()):
        if name.startswith('korean_teacher_head.'):continue
        with deepspeed.zero.GatheredParameters([p],modifier_rank=0):
            if rank==0:
                value=reader.parameter(name,p.shape,p.dtype);assert torch.isfinite(value).all();p.data.copy_(value.to(p.device));del value
        if rank==0 and i%100==0:print('AB_LOAD',a.arm,i,name,flush=True)
    if reader is not None:reader.close()
    groups=[{'params':[p for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.')],'lr':plan['tts_learning_rate']},
            {'params':list(model.korean_teacher_head.parameters()),'lr':plan['head_learning_rate']}]
    engine,_,_,_=deepspeed.initialize(model=model,model_parameters=groups,config=settings)
    total=sum(getattr(p,'ds_numel',p.numel()) for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.'))
    assert total==35899643008 and all(p.requires_grad for p in model.parameters())
    metadata={'arm':a.arm,'source_commit':SOURCE_REV,'model_revision':MODEL_REV,'data':data_audit,'codec_contract':contract,
        'method':'full_parameter_finetuning','lora':False,'trainable_tts_parameters':total,'all_tts_parameters_trainable':True,
        'target_language':'ko','codec_frozen':True,'plan_sha256':plan['sha256'],'steps_planned':plan['steps'],
        'teacher':{'id':TEACHER_ID,'revision':TEACHER_REV,'loss_weight':weight,'training_only':True},
        'same_random_head_constructed_in_both_arms':True,'head_learning_rate':plan['head_learning_rate'],'tts_learning_rate':plan['tts_learning_rate'],
        'optimizer_checkpoint_saved':False,'native_snapshot_interval':10,'quality_approved':False}
    if rank==0:(out/'run_metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
    ref=lookup[plan['reference']]
    def batch(clip,slot=0):return make_batch(lookup[clip],ref,slot,engine.module,tokenizer,root/'codes',contract,root/'teacher_features')
    def validate(step):
        engine.eval();items=[]
        with torch.no_grad():
            for index in range(rank,len(plan['validation']),world):
                clip=plan['validation'][index];value=engine(**batch(clip));items.append({'clip_id':clip,'speech_loss':float(value['speech_loss']),
                    'semantic_loss':float(value['semantic_loss']),'codebook_loss':float(value['codebook_loss']),'eos_loss':float(value['eos_loss']),
                    'teacher_loss':float(value['korean_teacher_loss'])})
        gathered=[None]*world;torch.distributed.all_gather_object(gathered,items)
        if rank==0:
            flat=sorted([x for part in gathered for x in part],key=lambda x:x['clip_id'])
            result={'step':step,'items':flat,'speech_loss_mean':sum(x['speech_loss'] for x in flat)/len(flat),
                    'teacher_loss_mean':sum(x['teacher_loss'] for x in flat)/len(flat)}
            with (out/'validation.jsonl').open('a') as file:file.write(json.dumps(result)+'\n')
            print('AB_VALIDATION',a.arm,step,result['speech_loss_mean'],flush=True)
        engine.train()
    validate(0);micro=0;local_sum=0.
    while engine.global_steps<plan['steps']:
        index=micro*world+rank;clip=plan['targets'][index];value=engine(**batch(clip,(index*7)%16))
        if not torch.isfinite(value['loss']):raise FloatingPointError('Nonfinite loss')
        engine.backward(value['loss']);boundary=engine.is_gradient_accumulation_boundary();engine.step();micro+=1;local_sum+=float(value['speech_loss'])
        if boundary:
            norm=engine.get_global_grad_norm();norm=float(norm) if norm is not None else None
            if norm is None or not math.isfinite(norm) or norm<=0:raise FloatingPointError('Invalid gradient norm')
            metric=torch.tensor([local_sum/plan['accumulation'],float(value['korean_teacher_loss'])],dtype=torch.float64,device=device)
            torch.distributed.all_reduce(metric);metric/=world;local_sum=0.
            if rank==0:
                event={'step':engine.global_steps,'speech_loss':float(metric[0]),'teacher_loss':float(metric[1]),'global_gradient_norm':norm,'seconds':time.monotonic()-begin}
                with (out/'history.jsonl').open('a') as file:file.write(json.dumps(event)+'\n')
                print('AB_STEP',a.arm,json.dumps(event),flush=True)
            if snapshot_due(engine.global_steps,plan['steps'],metadata['native_snapshot_interval']):
                from .live_export import export_live
                step=engine.global_steps
                snapshot_metadata={**metadata,'steps_completed':step,'snapshot_kind':'intermediate_native_weights',
                                   'exact_optimizer_resume_available':False}
                export_live(engine.module,original,snapshot_destination(out,step),snapshot_metadata)
                if rank==0:
                    snapshot=publish_snapshot(out,step)
                    print('AB_NATIVE_SNAPSHOT',a.arm,json.dumps(snapshot),flush=True)
                    if step==1:
                        # The parent commits this Volume then reloads it in a separate GPU container.
                        # No second optimizer update may run until independent native inference succeeds.
                        gate=out/'FIRST_SAVE_VERIFIED.json';deadline=time.monotonic()+300
                        while not gate.exists():
                            if time.monotonic()>deadline:raise TimeoutError('First saved model reload verification timed out')
                            time.sleep(1)
                        decision=json.loads(gate.read_text())
                        if not decision.get('verified'):raise RuntimeError('First saved model failed independent reload')
                        if not decision.get('continue_training'):raise RuntimeError('Budget projection stopped training after preserving verified step1 weights')
                torch.distributed.barrier()
            if engine.global_steps in [10,plan['steps']]:validate(engine.global_steps)
    metadata['steps_completed']=engine.global_steps;metadata['seconds_before_export']=time.monotonic()-begin
    from .live_export import export_live
    exported=export_live(engine.module,original,out/'model',metadata)
    if rank==0:
        result={**metadata,'status':'complete','native_export':exported,'seconds_total':time.monotonic()-begin,
                'peak_gpu_gib_rank0':torch.cuda.max_memory_allocated()/2**30,'voice_quality_validated':False}
        (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('AB_TRAIN_COMPLETE',a.arm,flush=True)
    torch.distributed.barrier();torch.distributed.destroy_process_group()


if __name__=='__main__':main()
