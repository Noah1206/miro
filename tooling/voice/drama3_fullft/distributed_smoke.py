"""Two-GPU ZeRO3 smoke on the tiny native architecture, not a35B training job."""
import json,os
from pathlib import Path
import torch
import deepspeed
from .core import construct,FullFT,training_rows
from .smoke import tiny_config


def main():
    deepspeed.init_distributed();rank=torch.distributed.get_rank();local=int(os.environ['LOCAL_RANK']);torch.cuda.set_device(local)
    config={'bf16':{'enabled':True},'train_micro_batch_size_per_gpu':1,'gradient_accumulation_steps':1,
            'zero_optimization':{'stage':3,'overlap_comm':False,'stage3_param_persistence_threshold':0,
                                 'reduce_bucket_size':100000,'stage3_prefetch_bucket_size':100000},
            'zero_allow_untested_optimizer':True,'steps_per_print':10}
    offload=os.environ.get('SMOKE_CPU_OFFLOAD')=='1'
    if offload:
        config['zero_optimization']['offload_optimizer']={'device':'cpu','pin_memory':True}
        config['optimizer']={'type':'AdamW','params':{'lr':.001,'betas':[.9,.95],'eps':1e-8,'weight_decay':.01}}
    cfg=tiny_config()
    variable=os.environ.get('SMOKE_VARIABLE_LENGTH')=='1'
    with deepspeed.zero.Init(config_dict_or_path=config,dtype=torch.bfloat16,remote_device='cuda'):
        native=construct(cfg,dtype=torch.bfloat16,device=torch.device('cuda',local))
        model=FullFT(native,checkpointing=True,teacher_dim=1024 if variable else None,teacher_weight=.1 if variable else 0.)
    torch.manual_seed(1234)
    for p in model.parameters():
        with deepspeed.zero.GatheredParameters([p],modifier_rank=0):
            if rank==0:
                with torch.no_grad():p.normal_(0,.08 if p.ndim>1 else .02)
    optimizer=None if offload else torch.optim.AdamW(model.parameters(),lr=.001)
    engine,_,_,_=deepspeed.initialize(model=model,optimizer=optimizer,config=config)
    torch.manual_seed(1234+rank);prompt=torch.zeros(12,11,dtype=torch.long);prompt[:,0]=torch.randint(4,60,(12,))
    prompt[2:6,1:]=torch.randint(0,16,(4,10));prompt[2:6,0]=prompt[2:6,1]+64
    target_frames=25+48*rank if variable else 25
    batch=training_rows(prompt,torch.randint(0,16,(10,target_frames)),cfg)
    if variable:batch['teacher_targets']=torch.randn(target_frames,1024)
    losses=[]
    for step in range(2):
        if os.environ.get('SMOKE_LIVE_EXPORT')=='1':model.teacher_weight=0. if step==0 else .1
        out=engine(**batch);assert torch.isfinite(out['loss']);losses.append(float(out['loss'].detach()));engine.backward(out['loss']);engine.step()
    root=Path(os.environ['SMOKE_OUTPUT']);engine.save_checkpoint(str(root/'tiny_zero'),tag='final')
    torch.distributed.barrier()
    live=os.environ.get('SMOKE_LIVE_EXPORT')=='1'
    if live:
        original=root/'tiny_original'
        if rank==0:original.mkdir(exist_ok=True);(original/'config.json').write_text('{}')
        torch.distributed.barrier()
        from .live_export import export_live
        export_live(engine.module,original,root/'live_export',{'codec_contract':{},'scope':'Synthetic tiny export regression'})
    if rank==0:
        from deepspeed.utils.zero_to_fp32 import get_fp32_state_dict_from_zero_checkpoint
        from .export import save_shards
        state=get_fp32_state_dict_from_zero_checkpoint(str(root/'tiny_zero'),tag='final',lazy_mode=True)
        size=save_shards(state,root/'tiny_export',max_bytes=100000)
        if live:
            from .core import CheckpointReader
            reader=CheckpointReader(root/'live_export')
            for name,param in state.items():
                if name.startswith('korean_teacher_head.'):continue
                actual=reader.parameter(name,param.shape,torch.bfloat16)
                torch.testing.assert_close(actual,param.contiguous().to(torch.bfloat16),rtol=0,atol=0)
            reader.close()
        result={'status':'passed','world_size':torch.distributed.get_world_size(),'zero_stage':3,'native_fullft':True,
                'lora':False,'activation_checkpointing':True,'steps':engine.global_steps,'losses_rank0':losses,
                'zero_checkpoint_and_lazy_export_passed':True,'exported_bytes':size,
                'cpu_optimizer_offload':offload,
                'variable_length_across_ranks':variable,'training_only_korean_teacher_head':variable,
                'live_partitioned_native_export_exact_parity':live,'zero_weight_teacher_head_control':live,
                'scope':'TwoGPU small architecture only; no35B weight load/training or voice quality validation',
                'torch':torch.__version__,'deepspeed':deepspeed.__version__}
        (root/'distributed_smoke.json').write_text(json.dumps(result,indent=2));print('DISTRIBUTED_SMOKE',json.dumps(result),flush=True)
    torch.distributed.barrier();torch.distributed.destroy_process_group()


if __name__=='__main__':main()
