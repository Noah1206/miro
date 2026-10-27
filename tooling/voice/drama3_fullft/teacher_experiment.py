"""Matched real-data pilot on a reduced native Drama3; never claim35B voice quality."""
import copy,dataclasses,json,random,time
from pathlib import Path
import torch
from .core import construct,FullFT,export_name
from .data import read_rows,make_batch
from .codec_contract import validate_training_contract
from .korean_teacher import TEACHER_DIM,TEACHER_ID,TEACHER_REV,TEACHER_LAYER,build_training_stats


def reduced_config(original):
    from fish_speech.models.text2semantic.fish_omni.config import FishOmniConfig
    full=FishOmniConfig.from_dict(json.loads((Path(original)/'config.json').read_text()))
    text=dataclasses.replace(full.text,hidden_size=128,num_hidden_layers=4,
        layer_types=['linear_attention','full_attention','linear_attention','full_attention'],
        num_attention_heads=4,num_key_value_heads=2,head_dim=32,num_experts=4,num_experts_per_tok=2,
        moe_intermediate_size=128,shared_expert_intermediate_size=128,max_position_embeddings=2048,
        linear_conv_kernel_dim=4,linear_key_head_dim=16,linear_value_head_dim=16,
        linear_num_key_heads=2,linear_num_value_heads=4)
    audio=dataclasses.replace(full.audio_decoder,dim=128,intermediate_size=256,n_head=4,n_local_heads=2,head_dim=32)
    return dataclasses.replace(full,text=text,audio_decoder=audio,fp8_experts=False)


def run(root,original,steps=64,seed=31415):
    from tokenizers import Tokenizer
    root=Path(root);rows=read_rows(root/'data/recordings.jsonl');contract=validate_training_contract(root/'codes',original)
    if not (root/'teacher_features/training_stats.pt').exists():build_training_stats(root/'teacher_features',rows,contract)
    cfg=reduced_config(original);tokenizer=Tokenizer.from_file(str(Path(original)/'tokenizer.json'))
    rng=random.Random(2718);train=[];validation=[]
    for emotion in ['neutral','happy','sad','angry']:
        group=sorted([r for r in rows if r['split']=='train' and r['emotion']==emotion],key=lambda x:x['clip_id']);rng.shuffle(group);train.extend(group[:16])
        group=sorted([r for r in rows if r['split']=='validation' and r['emotion']==emotion],key=lambda x:x['clip_id']);rng.shuffle(group);validation.extend(group[:4])
    references={r['emotion']:r for r in rows if r['split']=='reference'}
    reference=references['neutral'];assert len(train)==64 and len(validation)==16
    assert not ({r['recording_id'] for r in train}&{r['recording_id'] for r in validation})
    out=root/('matched_pilot' if seed==31415 else f'matched_pilot_s{seed}');out.mkdir(exist_ok=True)
    torch.manual_seed(seed);native=construct(cfg,tokenizer,dtype=torch.float32,device='cpu')
    template=FullFT(native,teacher_dim=TEACHER_DIM,teacher_weight=.1)
    with torch.no_grad():
        for name,p in template.named_parameters():
            if p.ndim>1:p.normal_(0,.02)
            elif name.endswith('weight'):p.fill_(1.)
            else:p.zero_()
    initial={n:p.detach().cpu().clone() for n,p in template.state_dict().items()};del template,native
    selection={'train':[r['clip_id'] for r in train],'validation':[r['clip_id'] for r in validation],
               'reference':reference['clip_id'],'steps_per_arm':steps,'seed':seed,
               'learning_rate_tts':1e-4,'learning_rate_head':5e-4,'teacher_weight':.1,
               'scope':'Reduced random-initialized native architecture; real007 audio/tokens and pretrained Korean teacher. Not pretrained35B fine-tuning.'}
    (out/'selection.json').write_text(json.dumps(selection,indent=2))
    schedule=[train[i%len(train)] for i in range(steps)]
    random.Random(99).shuffle(schedule)
    result={'status':'running','seed':seed,'scope':selection['scope'],'teacher_id':TEACHER_ID,'teacher_revision':TEACHER_REV,'layer':TEACHER_LAYER,
            'codec_unchanged':True,'lora':False,'arms':{},'voice_quality_validated':False}
    for arm,weight in [('baseline',0.),('korean_teacher',.1),('shuffled_teacher',.1)]:
        torch.manual_seed(seed);model=FullFT(construct(cfg,tokenizer,dtype=torch.float32,device='cuda'),teacher_dim=TEACHER_DIM,teacher_weight=weight)
        model.load_state_dict(initial,strict=True)
        params=[p for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.')]
        optimizer=torch.optim.AdamW([{'params':params,'lr':1e-4},{'params':model.korean_teacher_head.parameters(),'lr':5e-4}],weight_decay=.01)
        def batch(row,slot=0):return make_batch(row,reference,slot,model,tokenizer,root/'codes',contract,root/'teacher_features')
        def evaluate():
            model.eval();items=[]
            with torch.no_grad():
                for row in validation:
                    v=model(**batch(row));items.append({'clip_id':row['clip_id'],'emotion':row['emotion'],
                        'speech_loss':float(v['speech_loss']),'semantic_loss':float(v['semantic_loss']),
                        'codebook_loss':float(v['codebook_loss']),'eos_loss':float(v['eos_loss']),
                        'teacher_loss':float(v['korean_teacher_loss']) if weight else None})
            return {'speech_loss_mean':sum(x['speech_loss'] for x in items)/len(items),
                    'semantic_loss_mean':sum(x['semantic_loss'] for x in items)/len(items),
                    'codebook_loss_mean':sum(x['codebook_loss'] for x in items)/len(items),'items':items}
        start=time.monotonic();before=evaluate();history=[];model.train()
        for step,row in enumerate(schedule,1):
            optimizer.zero_grad(set_to_none=True);b=batch(row,step%16)
            if arm=='shuffled_teacher':
                # Deliberately wrong utterance control; preserves dimensionality and target distribution.
                other=train[(train.index(row)+1)%len(train)];wrong=batch(other)['teacher_targets'].T[None]
                b['teacher_targets']=torch.nn.functional.interpolate(wrong,size=len(b['teacher_targets']),mode='linear',align_corners=False)[0].T
            v=model(**b);v['loss'].backward()
            if not all(p.grad is not None and torch.isfinite(p.grad).all() for p in params):raise ValueError('Missing/nonfinite TTS gradient')
            if weight and (model.korean_teacher_head.weight.grad is None or not torch.isfinite(model.korean_teacher_head.weight.grad).all()):raise ValueError('Missing/nonfinite teacher head gradient')
            torch.nn.utils.clip_grad_norm_(model.parameters(),1.);optimizer.step()
            history.append({'step':step,'speech_loss':float(v['speech_loss']),'teacher_loss':float(v['korean_teacher_loss'])})
            if step%8==0:print('MATCHED_PILOT',arm,step,history[-1],flush=True)
        after=evaluate();changed=sum(not torch.equal(initial[n],p.detach().cpu()) for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.'))
        # The native inference model has no teacher or training projection; prove exact reload parity.
        state={export_name(n):p.detach().cpu().clone() for n,p in model.named_parameters() if not n.startswith('korean_teacher_head.')}
        from fish_speech.models.text2semantic.fish_omni.backbone import load_backbone_weights
        from fish_speech.models.text2semantic.fish_omni.tower import load_audio_decoder_weights
        restored=construct(cfg,tokenizer,dtype=torch.float32,device='cuda')
        load_backbone_weights(restored.backbone,[(k,v) for k,v in state.items() if not k.startswith('audio_decoder')])
        load_audio_decoder_weights(restored.audio_decoder,[(k,v) for k,v in state.items() if k.startswith('audio_decoder')])
        native_check=FullFT(restored,router_aux_weight=0).eval()
        with torch.no_grad():
            b=batch(validation[0]);expected=model(**b)['speech_loss'];actual=native_check(**b)['speech_loss']
        torch.testing.assert_close(expected,actual,rtol=1e-5,atol=1e-5)
        result['arms'][arm]={'before':before,'after':after,'history':history,'tts_parameter_tensors':len(params),
            'tts_parameter_tensors_updated':changed,'tts_parameters':sum(p.numel() for p in params),
            'native_inference_reload_passed':True,'teacher_required_at_inference':False,'seconds':time.monotonic()-start}
        torch.save(model.state_dict(),out/(arm+'_pilot.pt'))
        (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        del model,restored,native_check,optimizer,state;torch.cuda.empty_cache()
    result['status']='complete';result['peak_gpu_gib']=torch.cuda.max_memory_allocated()/2**30
    (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));return result
