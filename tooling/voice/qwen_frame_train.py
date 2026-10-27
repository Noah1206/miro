"""Train actual frame-aligned duration/rate/energy conditioning, not prompt tags."""
import argparse,collections,gc,json,random,time
import copy,re,hashlib
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
import torch.nn.functional as F
from qwen_tts import Qwen3TTSModel
from qwen_phrase_train import token_ids,prefill,export,probe
from qwen_phrase_data import instruction
from qwen_frame_control import FrameAdapter,observed_features,FEATURES


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--folder',required=True);a=ap.parse_args()
    out=Path(a.folder);m=json.loads((out/'manifest.json').read_text());data=json.loads((out/'prepared.json').read_text());cfg=m['settings']
    random.seed(1234);np.random.seed(1234);torch.manual_seed(1234);torch.cuda.manual_seed_all(1234)
    q=Qwen3TTSModel.from_pretrained(m['initial_checkpoint'],device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa');q.model.eval();talker=q.model.talker
    for p in q.model.parameters():p.requires_grad_(False)
    modules=[talker.model.norm,*talker.model.layers[-2:]]
    if cfg.get('train_residual'):
        modules += [talker.code_predictor.model.norm,*talker.code_predictor.model.layers[-2:],talker.code_predictor.small_to_mtp_projection]
    for module in modules:
        for p in module.parameters():p.requires_grad_(True)
    adapter=FrameAdapter(talker.config.hidden_size).to('cuda',torch.float32)
    if m.get('initial_adapter'):adapter.load_state_dict(torch.load(m['initial_adapter'],weights_only=True))
    codes={Path(r['audio']).name:r for r in map(json.loads,Path('/voices/_qwen_ft/007-20261023-pilot1/train_codes.jsonl').read_text().splitlines())}
    speech_levels=[];rates=[]
    for row in data['train']:
        y,sr=sf.read(Path('/voices/_qwen_ft/007-20261023-pilot1/data')/row['file']);frame=round(sr*.02);n=len(y)//frame
        db=20*np.log10(np.sqrt(np.mean(y[:n*frame].reshape(n,frame)**2,axis=1))+1e-10)
        speech_levels.append(float(np.median(db[db>np.percentile(db,95)-30])))
        rates.append(row['alignment']['syllables_per_second'])
    speaker_db=float(np.median(speech_levels));base_rate=float(np.median(rates));rows={}
    for split in ['train','validation']:
        rows[split]=[]
        for meta in data[split]:
            c=torch.tensor(codes[meta['file']]['audio_codes'],device='cuda',dtype=torch.long)
            y,sr=sf.read(Path('/voices/_qwen_ft/007-20261023-pilot1/data')/meta['file'])
            features=torch.tensor(observed_features(y,sr,meta,len(c),speaker_db),device='cuda')
            rows[split].append({**meta,'codes':c,'text_ids':token_ids(q,meta['text']),'features':features})
    crop_records=[]
    if cfg.get('real_phrase_crops'):
        for split in ['train','validation']:
            extra=[]
            for row in list(rows[split]):
                if len(row['alignment']['phrases'])<2:continue
                candidates=[p for p in row['alignment']['phrases'] if .55<=p['end']-p['start']<=3.2 and 3<=len(re.sub('[^가-힣]','',p['text']))<=20]
                if not candidates:continue
                p=min(candidates,key=lambda p:abs(len(re.sub('[^가-힣]','',p['text']))-9))
                y,sr=sf.read(Path('/voices/_qwen_ft/007-20261023-pilot1/data')/row['file']);begin=max(0,p['start']-.08);end=min(len(y)/sr,p['end']+.08);crop=y[round(begin*sr):round(end*sr)]
                with torch.no_grad():encoded=q.model.speech_tokenizer.encode(crop,sr=sr)
                c=encoded.audio_codes[0].detach().to('cuda',torch.long)
                meta={k:v for k,v in row.items() if k not in ['codes','text_ids','features']};part=copy.deepcopy(p);part['start']-=begin;part['end']-=begin
                meta['alignment']={**meta['alignment'],'phrases':[part]};meta['text']=p['text'];meta['file']=row['file']+'#real_phrase'
                original=next(z for z in row['plan']['phrases'] if re.sub(r'\W','',z['text'])==re.sub(r'\W','',p['text']))
                meta['plan']={'tempo':original['tempo'],'phrases':[{**original,'pause':'end'}]}
                features=torch.tensor(observed_features(crop,sr,meta,len(c),speaker_db),device='cuda')
                extra.append({**meta,'codes':c,'text_ids':token_ids(q,meta['text']),'features':features})
                crop_records.append({'source':row['file'],'split':split,'text':p['text'],'start_seconds':begin,'end_seconds':end,'codec_frames':len(c),'reencoded':True})
            if split=='validation':
                normalize=lambda t:re.sub(r'\W','',t)
                train_texts={normalize(r['text']) for r in rows['train']}
                extra=[r for r in extra if normalize(r['text']) not in train_texts]
            rows[split]+=extra
            print('REAL_PHRASE_CROPS',split,len(extra),flush=True)
        (out/'phrase_crops.json').write_text(json.dumps(crop_records,ensure_ascii=False,indent=2))
    if cfg.get('paired_gain_calibration'):
        # This is a gain-control calibration task, NOT new acted/emotion data.
        # Decode targets are genuinely re-encoded at their specified level.
        # Inference WAVs are never gain-corrected to pass the test.
        calibration=[];crop_lookup={(r['split'],r['source']+'#real_phrase'):r for r in crop_records}
        for split in ['train','validation']:
            originals=[r for r in rows[split] if '#real_phrase' not in r['file']]
            crops=[r for r in rows[split] if '#real_phrase' in r['file']]
            stable_key=lambda r:hashlib.sha256(r['file'].encode()).hexdigest()
            crops=sorted(crops,key=stable_key)[:(160 if split=='train' else 21)]
            if split=='train':originals=sorted(originals,key=stable_key)[:96]
            calibrated=list(originals)
            for row in crops:
                record=crop_lookup[(split,row['file'])]
                y,sr=sf.read(Path('/voices/_qwen_ft/007-20261023-pilot1/data')/record['source']);crop=y[round(record['start_seconds']*sr):round(record['end_seconds']*sr)]
                for gain_db in [-4.,0.,3.]:
                    if gain_db==0:calibrated.append(row);continue
                    view=crop*10**(gain_db/20)
                    if np.max(np.abs(view))>=1:continue
                    with torch.no_grad():encoded=q.model.speech_tokenizer.encode(view,sr=sr)
                    codes_view=encoded.audio_codes[0].detach().to('cuda',torch.long).clone()
                    features=torch.tensor(observed_features(view,sr,row,len(codes_view),speaker_db),device='cuda')
                    calibrated.append({**row,'file':row['file']+f'#gain{gain_db:g}','codes':codes_view,'features':features})
                    calibration.append({**record,'gain_db':gain_db,'synthetic_gain_only_not_new_acting':True})
            rows[split]=calibrated;print('PAIRED_GAIN_CALIBRATION',split,len(calibrated),flush=True)
        (out/'gain_calibration.json').write_text(json.dumps(calibration,ensure_ascii=False,indent=2))
    ref_spec=m['references']['normal'];prompt=q.create_voice_clone_prompt(ref_audio=m['reference_path'],ref_text=ref_spec['text'])[0]
    ref={'codes':prompt.ref_code.to('cuda'),'speaker':prompt.ref_spk_embedding.to('cuda',torch.bfloat16),'text_ids':token_ids(q,ref_spec['text'],ref=True)}
    with torch.no_grad():checks=probe(q,rows['train'][0],ref,instruction(rows['train'][0]['mode'],rows['train'][0]['plan']))
    (out/'prefix_check.json').write_text(json.dumps(checks))
    def loss(row,features,need_residual=True,components=False):
        prefix,pad=prefill(q,row,ref,instruction(row['mode'],row['plan']));start=prefix.shape[1];c=row['codes'];n=len(c)
        audio=talker.get_input_embeddings()(c[:,0])
        for k in range(1,16):audio=audio+talker.code_predictor.get_input_embeddings()[k-1](c[:,k])
        embeds=torch.cat([prefix,audio[None]+pad],1)
        if features is not None:
            delta=adapter(features).to(embeds.dtype);embeds=torch.cat([embeds[:,:start-1],embeds[:,start-1:]+delta[None]],1)
        result=talker(inputs_embeds=embeds,attention_mask=torch.ones(embeds.shape[:2],device='cuda',dtype=torch.long),output_hidden_states=need_residual,use_cache=False)
        logits=result.logits[0,start-1:start+n];targets=torch.cat([c[:,0],c.new_tensor([q.model.config.talker_config.codec_eos_token_id])]);ce=F.cross_entropy(logits.float(),targets)
        if not need_residual:return ce
        h=result.hidden_states[0][-1][0,start-1:start+n-1];assert len(h)==n
        residual,_=talker.forward_sub_talker_finetune(c,h)
        residual_ce=F.cross_entropy(residual.float().reshape(-1,residual.shape[-1]),c[:,1:].reshape(-1))
        if components:return ce,residual_ce
        return ce+cfg.get('residual_weight',.3)*residual_ce
    # Initial zero adapter must exactly preserve the aligned objective.
    with torch.no_grad():
        zero=float((loss(rows['validation'][0],rows['validation'][0]['features'])-loss(rows['validation'][0],None)).abs())
        if not m.get('initial_adapter'):assert zero==0,zero
    trainable=[p for p in talker.parameters() if p.requires_grad]
    opt=torch.optim.AdamW([{'params':adapter.parameters(),'lr':cfg['adapter_lr']},{'params':trainable,'lr':cfg['backbone_lr']}],weight_decay=.01)
    def validation():
        q.model.eval();adapter.eval();correct=[];wrong=[];energy_wrong=[]
        with torch.no_grad():
            for row in rows['validation']:
                correct.append(float(loss(row,row['features'])))
                changed=row['features'].clone();changed[:,4]=-changed[:,4];changed[:,1]*=1.3;changed[:,2]*=1.3
                wrong.append(float(loss(row,changed)))
                if cfg.get('train_residual'):
                    changed=row['features'].clone();changed[:,4]+=.25
                    energy_wrong.append(float(loss(row,changed)))
        return {'loss':float(np.mean(correct)),'wrong_controls_loss':float(np.mean(wrong)), 'correct_control_advantage':float(np.mean(wrong)-np.mean(correct)), 'energy_only_wrong_loss':float(np.mean(energy_wrong)) if energy_wrong else None}
    history={'settings':cfg,'initial_validation':validation(),'epochs':[],'initial_adapter_objective_difference':zero,'features':FEATURES,'speaker_speech_dbfs':speaker_db,'base_rate':base_rate,'train_count':len(rows['train']),'validation_count':len(rows['validation']),'trainable_backbone_parameters':sum(p.numel() for p in trainable),'adapter_parameters':sum(p.numel() for p in adapter.parameters()),'reference_fixed':True}
    best=float('inf')
    for epoch in range(cfg['epochs']):
        q.model.eval();adapter.train()
        for module in modules:module.train()
        order=list(range(len(rows['train'])));rng=random.Random(1234+epoch);rng.shuffle(order);opt.zero_grad(set_to_none=True);values=[];started=time.monotonic()
        for step,index in enumerate(order):
            row=rows['train'][index];ce,res=loss(row,row['features'],components=True);good=ce+cfg.get('residual_weight',.3)*res;total=good
            if step%2==0:
                wrong=row['features'].clone()
                if step%4==0:
                    wrong[:,4]=torch.clamp(wrong[:,4]+rng.choice([-1.,1.])*.25,-2,1)
                    if cfg.get('train_residual'):
                        _,negative=loss(row,wrong,components=True);total=total+.3*F.softplus((res-negative)/.2+.2)
                    else:
                        negative=loss(row,wrong,False);total=total+.1*F.softplus((ce-negative)/.1+.2)
                else:
                    wrong[:,1:3]*=rng.choice([.75,1.3]);negative=loss(row,wrong,False);total=total+.1*F.softplus((ce-negative)/.1+.2)
            acc=cfg['gradient_accumulation'];group=min(acc,len(order)-(step//acc)*acc)
            if not torch.isfinite(total):raise RuntimeError('Nonfinite loss')
            (total/group).backward();values.append(float(total.detach()))
            if (step+1)%acc==0 or step+1==len(order):
                grad=torch.nn.utils.clip_grad_norm_([*trainable,*adapter.parameters()],1.)
                if not torch.isfinite(grad):raise RuntimeError('Nonfinite gradient')
                opt.step();opt.zero_grad(set_to_none=True)
            if step%40==0:print('FRAME_EPOCH',epoch+1,'STEP',step,'LOSS',values[-1],flush=True)
        val=validation();record={'epoch':epoch+1,'seconds':time.monotonic()-started,'train_loss':float(np.mean(values)),'validation':val};history['epochs'].append(record)
        if val['loss']<best:
            best=val['loss'];history['best_epoch']=epoch+1
            # One retained best checkpoint bounds volume storage.
            export(q,m['initial_checkpoint'],out/'checkpoint-best')
            torch.save(adapter.state_dict(),out/'adapter.pt')
        (out/'training_history.json').write_text(json.dumps(history,indent=2));print('FRAME_EPOCH_SAVED',record,flush=True)
    print('FRAME_TRAINING_COMPLETE',history['best_epoch'],flush=True)


if __name__=='__main__':main()
