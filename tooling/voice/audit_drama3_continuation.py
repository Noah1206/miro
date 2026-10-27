"""External Volume verification and resume receipt. No GPU or training calls."""
import argparse
from datetime import datetime,timezone
import json
from pathlib import Path
import modal

REMOTE='/_drama3/fullsize-ko-007-20261024-continuous-v4'
SOURCE='/_drama3/fullsize-ko-007-20261024-stage20-v3/arms/korean_teacher/training_checkpoints/step-000005'
ASSETS='/voices/_drama3/fullsize-ko-007-20261024-budget44-v1/arms/korean_teacher/snapshots/step-000001'


def audit(folder):
    out=Path(folder);volume=modal.Volume.from_name('miro-voices')
    sizes={x.path:x.size for x in volume.iterdir(REMOTE)}
    def read(path):return json.loads(b''.join(volume.read_file('/'+path.lstrip('/'))))
    found=[]
    for file in sizes:
        if not file.endswith('/COMPLETE.json') or '/training_checkpoints/step-' not in file:continue
        parent=file.rsplit('/',1)[0]
        if parent+'/VOLUME_COMMITTED.json' not in sizes:continue
        manifest=read(file);ack=read(parent+'/VOLUME_COMMITTED.json')
        if manifest['client']['step']!=ack['step']:continue
        if any(sizes.get(parent+'/'+name)!=size for name,size in manifest['files'].items()):continue
        found.append((manifest,parent))
    if not found:raise RuntimeError('No complete externally visible committed checkpoint; preserve step5 pointer')
    manifest,parent=max(found,key=lambda value:value[0]['client']['step']);client=manifest['client'];step=client['step']
    if step<=5 or client['world_size']!=8 or client['next_micro_batch']!=step*2:raise ValueError('Unexpected training position')
    optimizers=[n for n in manifest['files'] if n.endswith('_optim_states.pt')]
    models=[n for n in manifest['files'] if n.endswith('_model_states.pt')]
    rngs=[n for n in manifest['files'] if n.startswith('rng-rank-')]
    if len(optimizers)!=8 or len(models)!=8 or len(rngs)!=8 or len(manifest['ranks'])!=8:raise ValueError('Missing per-rank state')
    if any(r['optimizer_samples']['sampled_tensors']<3 for r in manifest['ranks']):raise ValueError('Empty optimizer witness')
    old=read(SOURCE+'/COMPLETE.json');old_sizes={Path(x.path).name:x.size for x in volume.iterdir(SOURCE)}
    if any(old_sizes.get(n)!=size for n,size in old['files'].items()):raise ValueError('Original recovery checkpoint changed size')
    result_path=REMOTE.lstrip('/')+'/RESULT.json'
    worker=read(result_path) if result_path in sizes else None
    if worker and worker['steps_completed']!=step:raise ValueError('Worker/checkpoint step mismatch')
    proof={'recorded_at_utc':datetime.now(timezone.utc).isoformat(),'saved_step':step,'next_update':step+1,
        'next_micro_batch':client['next_micro_batch'],'new_updates':step-5,'goal_step':25,'goal_reached':step==25,
        'all_checkpoint_file_sizes_match_external_volume_listing':True,'optimizer_shards':len(optimizers),
        'model_state_shards':len(models),'rng_files':len(rngs),'checkpoint_file_count':len(manifest['files']),
        'checkpoint_file_bytes':sum(manifest['files'].values()),'original_step5_preserved':True,
        'worker_result_available':worker is not None,'new_checkpoint_independent_engine_reload_verified':False,
        'optimizer_full_payload_sha256_performed':False,'native_inference_export_generated':False,
        'quality_improvement_confirmed':False,'resume_checkpoint':'/voices/'+parent}
    (out/'external_checkpoint_audit.json').write_text(json.dumps(proof,indent=2))
    (out/'COMPLETE.json').write_text(json.dumps(manifest,indent=2))
    (out/'VOLUME_COMMITTED.json').write_text(json.dumps(read(parent+'/VOLUME_COMMITTED.json'),indent=2))
    if worker:(out/'training_result.json').write_text(json.dumps(worker,indent=2))
    canonical={'recorded_at_utc':proof['recorded_at_utc'],'resume_checkpoint':proof['resume_checkpoint'],
        'resume_kind':'complete_DeepSpeed_ZeRO3_training_state','saved_optimizer_step':step,'next_update':step+1,
        'next_micro_batch':client['next_micro_batch'],'planned_goal_steps':25,'plan_sha256':client['plan_sha256'],
        'world_size':8,'trainable_tts_parameters':35899643008,'configuration_assets':ASSETS,
        'data_root':'/voices/_drama3/korean-teacher-007-20261023','source_step5_preserved':True,
        'external_volume_commit_and_file_sizes_verified':True,'all_rank_optimizer_rng_data_position_saved':True,
        'new_checkpoint_independent_engine_reload_verified':False,'initial_step5_full_state_restore_witnesses_checked':True,
        'required_loader':'training_state.prepare_low_peak_checkpoint_load: MAP_PRIVATE mmap; clear disposable fresh Adam states only',
        'do_not_reinitialize_learned_optimizer_or_teacher_head':True,'resumption_must_use_full_checkpoint':True,
        'original_weights_restart_allowed':False,'no_inference_export_yet':True,'production_voice_quality_approved':False,
        'additional_total_cash_ceiling_usd':70,'workspace_net_spend_limit_usd':100,'ephemeral_disk_request_mib_required':2097152}
    (out/'CANONICAL_RESUME.json').write_text(json.dumps(canonical,indent=2))
    # Update the cross-run pointer only after external all-file verification.
    pointer=Path('/Users/johyeon-ung/Desktop/Miro/output/voice-maintenance/cleanup-20261024/CANONICAL_RESUME.json')
    temporary=pointer.with_suffix('.json.tmp');temporary.write_text(json.dumps(canonical,indent=2));temporary.replace(pointer)
    return proof


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('folder');print(json.dumps(audit(p.parse_args().folder),indent=2))
