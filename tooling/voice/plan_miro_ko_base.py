"""Offline common-Korean-base design and cost model. Never dispatches compute."""
import collections,hashlib,json,math,re,statistics
from pathlib import Path

ROOT=Path('/Users/johyeon-ung/Desktop/Miro')
OUT=ROOT/'output/voice-planning/miro-ko-base-20261024'
TRAIN_F=[];HELD_F=[]
# User scope: exactly two male training speakers and two launch voices.
# IDs are metadata candidates, not auditioned or selected product voices.
TRAIN_M=['001','011'];HELD_M=[]

def norm(text):return re.sub('[^가-힣0-9a-zA-Z]','',text).lower()

def main():
 inventory=json.loads((OUT/'data_inventory.json').read_text());female=[json.loads(l) for l in (OUT/'candidate_recordings.jsonl').read_text().splitlines()]
 male=[];metadata=collections.defaultdict(list)
 for p in Path('/Users/johyeon-ung/.miro/aihub/d71349/labels').glob('TL_대화체_*/*.json'):
  spk=p.parent.name.rsplit('_',1)[1]
  if spk not in TRAIN_M+HELD_M:continue
  for doc in json.loads(p.read_text(encoding='utf-8-sig')):
   assert doc['reciter']['gender']=='MALE'
   for row in doc['sentences']:
    vp=row['voice_piece'];votes=[v.get('likert_scale',0) for v in row.get('votes',[])];text=vp.get('tr','').strip()
    if not 2<=vp.get('duration',0)<=10 or len(re.findall('[가-힣]',text))<4:continue
    metadata[spk].append({'clip_id':Path(vp['filename']).stem,'speaker_id':'aihub'+spk,'audio_path':None,'source_label':str(p),'text':text,'phrase_marked_text':vp.get('ptr'),'gender_from_source_metadata':'MALE','age_from_source_metadata':doc['reciter']['age'],'emotion':row['style']['emotion'],'emotion_intensity':row['style'].get('intensity'),'duration_seconds_label_only':vp['duration'],'quality_label_mean':sum(votes)/max(1,len(votes)),'source_kind':'human_recording','original_audio_downloaded':False,'file_catalog_key_verified':False,'adult_training_eligible':False})
 for spk in TRAIN_M+HELD_M:
  for emotion,n in [('무감정',250),('기쁨',150),('슬픔',100),('분노',100)]:
   pool=sorted((r for r in metadata[spk] if r['emotion']==emotion),key=lambda r:(-r['quality_label_mean'],abs(r['duration_seconds_label_only']-5),r['clip_id']))
   assert len(pool)>=n,(spk,emotion,len(pool));male.extend(pool[:n])
 (OUT/'male_recording_candidates.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in male))
 male_summary=[{'speaker_id':'aihub'+spk,'age_group':inventory['label_only_speakers'][spk]['ages'],'gender':'MALE','planned_role':'train' if spk in TRAIN_M else 'heldout_speaker','selected_clips':sum(r['speaker_id']=='aihub'+spk for r in male),'original_audio_confirmed':False} for spk in TRAIN_M+HELD_M]
 old=json.loads((ROOT/'output/voice-compare/drama3-fullsize-ko-007-20261024-budget44-resumable/recovery_audit/remote_metadata/plan.json').read_text());seen_ids=set(old['targets'][:368]);seen_text={norm(r['text']) for r in female if r['clip_id'] in seen_ids}
 heldout_candidates=[]
 for row in female:
  spk=row['speaker_id'].removeprefix('aihub')
  if spk in HELD_F and norm(row['text']) not in seen_text:heldout_candidates.append({**row,'role':'heldout_voice_candidate','unseen_by_miro23_training':True})
 heldout_candidates.extend({**r,'role':'heldout_utterance_for_seen_male','unseen_by_miro23_training':True,'speaker_unseen_by_new_base':False} for r in male if r['speaker_id'].removeprefix('aihub') in TRAIN_M and norm(r['text']) not in seen_text)
 # Freeze shared text keys across ALL speakers: content leakage is not allowed.
 eval_rows=[];eval_texts=set();ref_ids=set();ref_texts=set()
 for spk in ['aihub'+x for x in HELD_F+TRAIN_M]:
  pool=sorted((r for r in heldout_candidates if r['speaker_id']==spk),key=lambda r:hashlib.sha256(r['clip_id'].encode()).hexdigest())
  refs=[]
  for r in pool:
   if r['emotion']=='무감정' and len(refs)<2:
    refs.append(r);ref_ids.add(r['clip_id']);ref_texts.add(norm(r['text']))
  assert len(refs)==2
  selected=[]
  for emotion in ['무감정','기쁨','슬픔','분노']:
   candidates=[r for r in pool if r['emotion']==emotion and r['clip_id'] not in ref_ids and norm(r['text']) not in ref_texts]
   assert len(candidates)>=2;selected.extend(candidates[:2])
  eval_rows.extend(selected);eval_texts.update(norm(r['text']) for r in selected)
 reserved=eval_texts|ref_texts
 train_candidates=[r for r in female+male if r['speaker_id'].removeprefix('aihub') in TRAIN_F+TRAIN_M and norm(r['text']) not in reserved]
 train_rows=[]
 for r in train_candidates:
  h=int(hashlib.sha256(('global-validation-v1:'+norm(r['text'])).encode()).hexdigest()[:8],16)
  train_rows.append({**r,'planned_split':'validation' if h%10==0 else 'train'})
 # This is a candidate manifest. Missing male WAVs block every launch.
 (OUT/'common_base_candidate_manifest.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in train_rows))
 (OUT/'heldout_evaluation_candidates.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in eval_rows))
 history=[]
 for line in (ROOT/'output/voice-compare/drama3-fullsize-ko-007-20261024-cost-optimized/continuous-training.log').read_text().splitlines():
  if line.startswith('AB_STEP korean_teacher '):history.append(json.loads(line.split('AB_STEP korean_teacher ',1)[1]))
 measured=statistics.mean((b['seconds']-a['seconds'])/(b['step']-a['step']) for a,b in zip(history,history[1:]))
 rates={'H100_gpu_hour':.001097*3600,'physical_cpu_core_hour':.0000131*3600,'GiB_RAM_hour':.00000222*3600,'volume_GiB_month':.09,'volume_free_GiB':1024}
 rate_low=8*rates['H100_gpu_hour']+16*rates['physical_cpu_core_hour']+640*rates['GiB_RAM_hour'];rate_high=8*rates['H100_gpu_hour']+16*rates['physical_cpu_core_hour']+896*rates['GiB_RAM_hour']
 def estimate(updates,save_count,prep_low=1.,prep_high=5.):
  # Step time is anchored to actual007 full-size training, not a validated multi-speaker throughput.
  low=(updates*70+300+save_count*500+150)*rate_low/3600+prep_low+.8+1.5
  high=(updates*110+600+save_count*750+450)*rate_high/3600+prep_high+1.6+4.
  central=(updates*measured+350+save_count*510+240)*((rate_low+rate_high)/2)/3600+(prep_low+prep_high)/2+1.2+2.5
  return {'updates':updates,'global_clip_presentations':updates*16,'durable_full_saves':save_count,'estimated_resource_usd_low':low,'estimated_resource_usd_high':high,'central_scenario_usd':central,'quality_guaranteed':False,'includes':['data codec/teacher precompute allowance','full TTS training','load','save and remote commit','validation','two CPU native exports: source23 and new checkpoint','new heldout listening generation allowance'],'excludes':['actor recording/AI training licence fees','long-term storage','unapproved failures or architecture changes','taxes/FX/card charges'],'not_a_hard_spending_authorization':True}
 training_counts=collections.Counter(r['speaker_id'] for r in train_rows if r['planned_split']=='train')
 coverage_updates=math.ceil(max(training_counts.values())*len(training_counts)/16)
 scenarios={'transfer_feasibility_only_32_updates':estimate(32,1),'two_male_two_female_one_coverage_pass':estimate(coverage_updates,math.ceil(coverage_updates/64)),'two_male_two_female_three_coverage_passes':estimate(coverage_updates*3,math.ceil(coverage_updates*3/64))}
 storage=json.loads((ROOT/'output/voice-compare/drama3-fullsize-ko-007-20261024-cost-optimized/storage_usage_after.json').read_text());checkpoint=json.loads((OUT/'checkpoint_reuse_audit.json').read_text());size_gib=checkpoint['bytes']/2**30;extra=max(0,storage['listed_gib']+size_gib-1024)
 plan={'status':'DESIGN_ONLY_NO_PAID_EXECUTION','paid_execution_enabled':False,'goal':'One reusable Korean multi-speaker full-FT base; later voice onboarding without repeating common Korean adaptation.','not_production_claim':True,'initialization':{'preferred_candidate':'preserved_step23_TTS_weights only after heldout male/female reuse gate; otherwise original Drama3','exact_old_007_resume':False,'reason':'New dataset/sampler/reference pool/teacher statistics and evaluation task. Preserve original complete checkpoint.','safe_stage_boundary':'CPU BF16 native export from existing23 FP32 masters, new run ID, fresh optimizer and teacher head explicitly recorded for new task; no source checkpoint mutation.','teacher_normalization':'Recompute mean/std only on new multi-speaker training split. Existing raw007 codec and HuBERT features may be reused if source/profile hashes match; old007 normalization stats are not reused.','source23_weight_hashes_must_be_retained':True,'original_Drama3_comparator':'Must fetch true original weights for new heldout voices; trained step1 is not a valid original comparator.','cross_speaker_transfer_unverified':True},'architecture':{'tts_parameters':35899643008,'all_tts_parameters_trainable':True,'lora':False,'codec_frozen':True,'teacher':'team-lucid/hubert-large-korean pinned revision; training-only auxiliary supervision','teacher_does_not_replace_codec_teacher':True,'speaker_slots':'Local role0..15, not persistent identity. Same-speaker disjoint references, shuffled slots; serve voices with reference cache.','context':'A director maps real dialogue context to delivery plan. It is a distinct input path, not report-only scene metadata.','acting_supervision':'Preserve source emotion/intensity/boundary labels; derive phrase timing/syllables-per-second/relative energy from actual aligned human audio with confidence masks, not fabricated text-only emotion captions.','nonverbal_whisper':'Only verified real recordings; absent capability labels remain unknown rather than invented.'},'data':{'current_female_original_speakers':12,'current_original_clips':7200,'current_wav_hours':inventory['selected_total_hours'],'minimum_train_female_ids':TRAIN_F,'minimum_train_male_ids_pending':TRAIN_M,'heldout_female_ids':HELD_F,'heldout_male_ids_pending':HELD_M,'seen_007_is_not_heldout':True,'male_candidates':male_summary,'train_validation_candidate_counts':dict(collections.Counter(r['planned_split'] for r in train_rows)),'per_speaker_candidates':dict(collections.Counter(r['speaker_id'] for r in train_rows)),'heldout_test_clips':len(eval_rows),'heldout_prompt_clips':8,'eval_texts_excluded_from_all_training_speakers':True,'eval_texts_exclude_prior007_presented_texts':True,'training_counts_by_speaker':dict(training_counts),'coverage_pass_updates':coverage_updates,'sampling':'Per-speaker shuffled decks without replacement until that speaker deck is exhausted; two examples per speaker per global16-example update; roles randomized.','gender_balanced_batches':True,'speaker_and_emotion_balancing':'Balanced across speakers and observed emotion labels; no synthetic gender or pitch conversion.','remaining_existing_female_speakers':'Retained for expansion/secondary heldout tests, not discarded.','all12_female_expansion':'Add12 male speakers, hold out2F+2M, train10F+10M; proposed only.','rights':'User-confirmed rights accepted; source registration limits adult use. General Korean-base training only, no adult source labels inferred.','male_voice_gender_verification':'Original reciter.gender metadata plus matching downloaded filenames; pitch is not used to infer gender.'},'evaluation':{'primary':'Speaker-held-out AND globally text-held-out Korean generalization','per_heldout_speaker':'Bank: two disjoint reference clips and eight evaluation lines across four emotions. First costed probe uses two fixed evaluation lines per4heldout speakers with two seeds and3checkpoints=48takes. Full bank and added parallel scenes require a separate expanded inference estimate.','costed_generation_optimization':'Load each checkpoint once for all heldout speakers, caching each original reference codec. Do not reload the35.9B model for every speaker.','comparators':['original_Drama3','step23_before_new_training','new_common_base'],'existing007_baselines':'Reuse only for007 same prompts; cannot reuse007 WAVs as male/other speaker baseline.','gates':['No catastrophic word omissions or long low-energy tail; EOS compliance','Heldout male and female results reported separately','Speaker identity across emotions remains stable; cosine is a proxy','Blind listening of naturalness and intended emotion; ASR gain alone is insufficient','Explicit voiced/unvoiced whisper verification before ASMR claim','No teacher-specific causal claim without matched teacher-free control'],'small_probe_does_not_certify_production':True},'checkpointing':{'old5_and23_preserved':True,'write_then_remote_commit_then_publish':True,'full_state_saves_include':['FP32 masters','Adam','teacher head','RNG','data cursor','new manifest and schedule hashes'],'interval':'64 new updates or time-budget boundary, plus final. Save/resume pilot must pass before long run.','retention':'At most latest2 NEW-run full checkpoints; remove previous NEW-run checkpoint only after newer one is externally verified; no deletion executed now.','export':'CPU-only streaming after GPU exit; reference/codec contracts maintained.'},'cost':{'currency':'USD','official_prices_source':'https://modal.com/pricing','historical_measured_update_seconds':measured,'quoted_step_seconds_assumption':[70,110],'rates':rates,'training_hour_low_high':[rate_low,rate_high],'reuse_gate_before_training':{'estimated_usd':[2,5],'new_training_updates':0,'models':['original_Drama3','saved_step23'],'heldout_voices':4,'takes_per_model':16,'includes':'CPU23 export, original checkpoint CPU fetch allowance, one GPU load per model, new listening WAVs','decision':'Reuse23 only if unseen male/female Korean completeness and identity do not regress; do not subtract23 updates from the new training requirement.','paid_execution_authorized':False},'scenarios':scenarios,'snapshot_storage':{'existing_GiB':storage['listed_gib'],'one_new_full_checkpoint_GiB':size_gib,'incremental_excess_GiB_if_retained':extra,'incremental_monthly_usd':extra*.09,'approx_daily_usd':extra*.09/30,'new_native_export_GiB':73691602460/2**30,'old_artifacts_not_deleted':True},'quality_target_minimum_cost':'Unknown until heldout learning curves; one pass is a scope estimate, not a production-quality promise.','unbenchmarked_cheaper_hardware':'4H100/A100/optimizer changes are hypotheses; no savings claimed without a bounded memory/throughput test. RTX2070 cannot host the actual35.9B fullFT.','no_new_paid_job_started':True},'launch_blockers':['Male source WAVs not downloaded/verified: official API returned502','Training and context-conditioning code must be generalized beyond the old007-specific plan','User has not authorized any new paid run','Need explicit cost ceiling and storage retention choice before a future run']}
 # Override the former eight-speaker proposal after the user's two-male limit.
 plan['product_scope']={'launch_male_voices':2,'male_training_speakers':2,'primary_product':'Unveil dialogue and cloud images; voices supplementary','female_base_training_speakers':0,'female_recordings_preserved_but_excluded':True,'male_ids_are_provisional_until_audio_audition':True}
 plan['data']['sampling']='Eight samples per male training speaker per global16-example update, shuffled decks without replacement until each speaker exhausts its own deck; roles randomized.'
 plan['data']['all12_female_expansion']='Out of current minimum-cost scope. All existing female recordings remain preserved.'
 plan['data']['heldout_male_generalization_verified']=False
 plan['data']['evaluation_male_ids_seen_in_new_training']=TRAIN_M
 plan['data']['heldout_prompt_clips']=4
 plan['data']['gender_balanced_batches']=False
 plan['evaluation']['primary']='Globally text-held-out evaluation for both trained male voices. No new female recordings or unseen-male generalization claim.'
 plan['evaluation']['male_generalization_limitation']='Exactly two male training voices. Neither is a heldout male after this new training, so the design cannot prove transfer to a third male voice. No extra male speaker is added automatically.'
 plan['cost']['reuse_gate_before_training']['heldout_voices']=2
 plan['cost']['reuse_gate_before_training']['takes_per_model']=8
 plan['cost']['reuse_gate_before_training']['decision']='Before new training, test23 on both candidate male voices. After new training, these males are seen speakers. Do not subtract23 old007 updates from the new task.'
 plan['cost']['scenarios']={'transfer_feasibility_only_32_updates':estimate(32,1),'two_male_only_one_coverage_pass':estimate(coverage_updates,math.ceil(coverage_updates/64)),'two_male_only_three_coverage_passes':estimate(coverage_updates*3,math.ceil(coverage_updates*3/64))}
 plan['evaluation']['per_heldout_speaker']='For each of two male voices: two reserved reference clips and eight text-held-out evaluation clips. These speakers become seen after the new stage; no third male is added.'
 plan['evaluation']['gates'][1]='Report each of the two trained male voices separately on heldout texts. Unseen-male transfer remains untested.'
 plan['launch_blockers'].append('The two male voices are provisional metadata candidates; actual source recordings and audition remain missing.')
 (OUT/'COMMON_KOREAN_BASE_PLAN.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2));print(json.dumps({'male_candidates':male_summary,'candidate_splits':plan['data']['train_validation_candidate_counts'],'cost':plan['cost']},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
