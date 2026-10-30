"""One authorized budget stage; no paid retries and no automatic next stage."""
import fcntl,json,math,re,subprocess,time
from pathlib import Path

ROOT=Path('/Users/johyeon-ung/Desktop/Miro')
OUT=ROOT/'output/voice-compare/drama3-fullsize-ko-007-20261024-stage20'
MODAL='/Users/johyeon-ung/.miro/voice-venv/bin/modal'
REMOTE='/_drama3/fullsize-ko-007-20261024-stage20-v3'


def read(path):return json.loads(Path(path).read_text())


def update(**changes):
    state=read(OUT/'status.json');state.update(changes)
    temp=OUT/'status.json.tmp';temp.write_text(json.dumps(state,ensure_ascii=False,indent=2));temp.replace(OUT/'status.json')


def audit_saved_state(volume):
    import modal
    try:entries=list(volume.iterdir(REMOTE))
    except (FileNotFoundError,modal.exception.NotFoundError):return None
    sizes={x.path:x.size for x in entries}
    candidates=[p for p in sizes if '/training_checkpoints/step-' in p and p.endswith('/COMPLETE.json')]
    complete=[]
    for path in candidates:
        folder=path.rsplit('/',1)[0]
        if folder+'/VOLUME_COMMITTED.json' not in sizes:continue
        manifest=json.loads(b''.join(volume.read_file('/'+path)))
        if any(sizes.get(folder+'/'+name)!=n for name,n in manifest['files'].items()):continue
        complete.append((manifest,folder))
    if not complete:return None
    manifest,folder=max(complete,key=lambda x:x[0]['client']['step'])
    for name in ['COMPLETE.json','VOLUME_COMMITTED.json','ENGINE_RELOAD_VERIFIED.json']:
        if folder+'/'+name in sizes:(OUT/name).write_bytes(b''.join(volume.read_file('/'+folder+'/'+name)))
    proof=read(OUT/'ENGINE_RELOAD_VERIFIED.json') if (OUT/'ENGINE_RELOAD_VERIFIED.json').exists() else {}
    if proof and not (proof.get('verified') and len(proof.get('ranks',[]))==8):raise ValueError('Incomplete reload proof')
    return {'step':manifest['client']['step'],'path':'/voices/'+folder,'external_all_file_sizes_match':True,
            'optimizer_shards':sum(x.endswith('_optim_states.pt') for x in manifest['files']),
            'independent_engine_reload_verified':bool(proof.get('verified'))}


def main():
    import modal
    authorization=read(OUT/'authorization.json')
    if authorization['additional_total_cash_ceiling_usd']!=50 or authorization['new_stage_all_in_ceiling_usd']!=20:
        raise ValueError('Wrong authorization scope')
    expires=time.monotonic()+2000
    while not (OUT/'storage_preflight.json').exists():
        log=(OUT/'storage-preflight.log').read_text(errors='replace')
        values=re.findall(r'STORAGE_PREFLIGHT_BYTES (\d+)',log)
        if values:update(phase='cpu_storage_preflight',probe_bytes_written=int(values[-1]),training_started=False)
        if 'Traceback' in log or 'Error:' in log:
            update(phase='storage_preflight_failed',training_started=False,automatic_paid_retry=False);return
        if time.monotonic()>expires:
            update(phase='storage_preflight_wait_expired',training_started=False,automatic_paid_retry=False);return
        time.sleep(10)
    proof=read(OUT/'storage_preflight.json');volume=modal.Volume.from_name('miro-voices')
    path=proof['probe_root'].removeprefix('/voices')
    if path!='/_storage_probe/drama3-stage20-20261024':raise ValueError('Wrong disposable probe path')
    if not (proof.get('external_volume_file_sizes_verified') and proof.get('disposable_probe_files_removed')):
        entries=list(volume.iterdir(path));files={Path(x.path).name:x.size for x in entries}
        if not proof['verified_commit_returned'] or any(files.get(n)!=s for n,s in proof['files'].items()):
            raise ValueError('Full-size storage probe did not persist all eight files')
        proof['external_volume_file_sizes_verified']=True
        proof['root_statfs_is_placeholder']=proof['root_free_bytes_before']>4*1024**4
        # Only generated probe files are disposable. Retain both prior recovery roots.
        volume.remove_file(path,recursive=True);proof['disposable_probe_files_removed']=True
        (OUT/'storage_preflight.json').write_text(json.dumps(proof,indent=2))
    save_reserve=max(300.,175.1*1.25+proof['commit_seconds']+60.)
    if 300.+95.+save_reserve+300.>1500:
        update(phase='storage_verified_but_stage_too_short',save_reserve_seconds=save_reserve,training_started=False);return
    bill=read_billing();baseline=authorization['billed_cycle_at_stage_start_usd']
    cpu_bound=math.ceil((proof['seconds']+10)*(4*.0473+128*.008)/3600*100)/100+.05
    authorization.update(storage_preflight_completed_resource_bound_usd=cpu_bound,
        training_resource_ceiling_usd=18.89,startup_and_metering_reserve_usd=.75,
        save_reserve_seconds=save_reserve,verification_reserve_seconds=300)
    (OUT/'authorization.json').write_text(json.dumps(authorization,ensure_ascii=False,indent=2))
    conservative=max(float(bill['billed_cost']),baseline+cpu_bound)
    if conservative+18.89+.75>authorization['workspace_net_spend_limit_ui_verified_usd']+.000001:
        update(phase='stage_budget_hold',current_billed_cost=bill['billed_cost'],training_started=False);return
    try:existing=list(volume.iterdir(REMOTE))
    except (FileNotFoundError,modal.exception.NotFoundError):existing=[]
    if existing:
        raise FileExistsError('Remote stage root already exists; inspect before reusing it')
    with (OUT/'GPU_DISPATCHED.json').open('x') as f:f.write(json.dumps({'unix_time':time.time(),'automatic_retry':False}))
    update(phase='gpu_initializing',storage_full_size_commit_verified=True,training_started=False)
    logpath=OUT/'training.log'
    with logpath.open('w') as log:
        process=subprocess.Popen([MODAL,'run','--detach','tooling/voice/modal_drama3_budget_stage.py','--folder',str(OUT)],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        last=None
        while process.poll() is None:
            text=logpath.read_text(errors='replace');events=re.findall(r'AB_STEP korean_teacher (\{[^\n]+\})',text)
            if events:
                event=json.loads(events[-1])
                if event['step']!=last:update(phase='training',training_started=True,steps_completed=event['step']);last=event['step']
            if 'DURABLE_TRAINING_CHECKPOINT ' in text:update(phase='verifying_saved_checkpoint',checkpoint_committed=True)
            time.sleep(10)
    checkpoint=audit_saved_state(volume)
    bill=read_billing();(OUT/'billing_snapshot_after.json').write_text(json.dumps(bill,indent=2))
    result=read(OUT/'training_stage_result.json') if (OUT/'training_stage_result.json').exists() else None
    update(phase='budget_stage_saved' if checkpoint else 'training_stopped_no_new_complete_checkpoint',
        checkpoint=checkpoint,stage_result=result,automatic_paid_retry=False,further_spending_requires_user_decision=True,
        stage_billed_delta_snapshot_usd=round(float(bill['billed_cost'])-baseline,2),billing_may_lag=True,
        original_25_update_goal_complete=bool(result and result['training_goal_reached']))
    print('STAGE20_STOPPED',json.dumps({'checkpoint':checkpoint,'current_net_billed':bill['billed_cost'],'no_next_stage_launched':True}),flush=True)


def read_billing():return json.loads(subprocess.check_output([MODAL,'billing','summary','--json'],cwd=ROOT,text=True))


if __name__=='__main__':
    lock=(OUT/'pipeline.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    try:main()
    except Exception as error:
        update(phase='controller_stopped',error=repr(error),automatic_paid_retry=False)
        raise
