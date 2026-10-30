"""One active local pipeline. Every paid stage runs at most once; never restarts base weights."""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time

ROOT=Path('/Users/johyeon-ung/Desktop/Miro')
OUT=ROOT/'output/voice-compare/drama3-fullsize-ko-007-20261024-budget44-resumable'
PREVIOUS=ROOT/'output/voice-compare/drama3-fullsize-ko-007-20261024-budget44'
REMOTE='/voices/_drama3/fullsize-ko-007-20261024-budget44-resumable-v2'
PYTHON='/Users/johyeon-ung/.miro/voice-venv/bin/python'
MODAL='/Users/johyeon-ung/.miro/voice-venv/bin/modal'


def read(path):return json.loads(Path(path).read_text())


def status(**changes):
    value=read(OUT/'status.json');value.update(changes)
    temporary=OUT/'status.json.tmp';temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2));temporary.replace(OUT/'status.json')
    subprocess.run([PYTHON,'tooling/voice/package_drama3_fullsize_ab.py',str(OUT)],cwd=ROOT,check=True)


def billed():
    data=json.loads(subprocess.check_output([MODAL,'billing','summary','--json'],cwd=ROOT,text=True))
    return max(46.46,float(data['billed_cost']))


def paid_stage(marker_name,arguments,log_name):
    with (OUT/marker_name).open('x') as marker:marker.write(json.dumps({'unix_time':time.time(),'automatic_retry':False}))
    with (OUT/log_name).open('w') as log:
        process=subprocess.Popen(arguments,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        previous=None
        while process.poll() is None:
            if (OUT/'CANCEL_REQUESTED').exists():
                # Local cancellation stops new stages; an already detached remote
                # function must also be stopped explicitly using its recorded app ID.
                status(phase='cancel_requested',request_complete=False);return False
            text=(OUT/log_name).read_text(errors='replace')
            events=re.findall(r'AB_STEP korean_teacher (\{[^\n]+\})',text)
            if events:
                event=json.loads(events[-1]);step=event['step']
                if step!=previous:status(phase='training',teacher_steps_completed=step);previous=step
            if 'DURABLE_TRAINING_CHECKPOINT' in text and not read(OUT/'status.json').get('training_state_checkpoint_saved'):status(training_state_checkpoint_saved=True)
            if 'AB_EXACT_RESUME_VERIFIED ' in text and not read(OUT/'status.json').get('exact_training_resume_verified'):status(exact_training_resume_verified=True)
            time.sleep(15)
        return process.returncode==0


def main():
    import modal
    deadline=time.monotonic()+1200
    audit_file=PREVIOUS/'native_integrity_cpu_audit.json'
    while not audit_file.exists():
        if time.monotonic()>deadline:
            status(phase='native_audit_wait_expired',request_complete=False);return
        time.sleep(10)
    audit=read(audit_file)
    if not audit.get('verified'):raise ValueError('Saved native checkpoint failed CPU verification')
    estimate=19.4;current=billed()
    if current+estimate>66:
        status(phase='operating_budget_hold',current_billed_cost=current,request_complete=False);return
    authorization=read(OUT/'authorization.json');authorization.update(current_billed_cost_usd=current,
        additional_cash_already_used_usd=current-30,native_cpu_integrity_verified=True,
        workspace_spend_limit_ui_verified=66,new_stage_estimate_ceiling_usd=estimate)
    (OUT/'authorization.json').write_text(json.dumps(authorization,ensure_ascii=False,indent=2))
    status(phase='training',stage='continuing_saved_step1',current_billed_cost=current)
    okay=paid_stage('TRAINING_STAGE_STARTED.json',[MODAL,'run','--detach','tooling/voice/modal_drama3_resumable_train.py',
        '--folder',str(OUT)],'modal-training.log')
    if not okay:
        status(phase='training_stopped',request_complete=False,automatic_paid_retry=False);return
    result=read(OUT/'korean_teacher_training.json')
    if result['status']!='complete':
        volume=modal.Volume.from_name('miro-voices');checkpoint=result['training_checkpoint'].removeprefix('/voices')
        for name in ['COMPLETE.json','VOLUME_COMMITTED.json']:
            (OUT/name).write_bytes(b''.join(volume.read_file(checkpoint+'/'+name)))
        if result.get('independent_engine_reload_verified'):
            (OUT/'ENGINE_RELOAD_VERIFIED.json').write_bytes(b''.join(volume.read_file(checkpoint+'/ENGINE_RELOAD_VERIFIED.json')))
        if result.get('earlier_training_checkpoint_reload_verified'):
            (OUT/'FIRST_ENGINE_RELOAD_VERIFIED.json').write_bytes(b''.join(volume.read_file((REMOTE+'/arms/korean_teacher/FIRST_ENGINE_RELOAD_VERIFIED.json').removeprefix('/voices'))))
        status(phase='checkpoint_saved_budget_stop',teacher_steps_completed=result['steps_completed'],
            planned_target_step=25,training_state_checkpoint_saved=True,request_complete=False,
            exact_training_resume_verified=result.get('independent_engine_reload_verified',False) or result.get('earlier_training_checkpoint_reload_verified',False),
            latest_checkpoint_independently_reloaded=result.get('independent_engine_reload_verified',False),
            earlier_training_checkpoint_reload_verified=result.get('earlier_training_checkpoint_reload_verified',False),
            automatic_paid_retry=False);return
    if not result.get('independent_engine_reload_verified') or not result['optimizer_checkpoint_saved']:
        raise ValueError('Do not claim resume verification without actual full-engine reload')
    volume=modal.Volume.from_name('miro-voices');checkpoint=result['training_checkpoint'].removeprefix('/voices')
    for name in ['COMPLETE.json','VOLUME_COMMITTED.json']:
        (OUT/name).write_bytes(b''.join(volume.read_file(checkpoint+'/'+name)))
    (OUT/'FIRST_ENGINE_RELOAD_VERIFIED.json').write_bytes(b''.join(volume.read_file((REMOTE+'/arms/korean_teacher/FIRST_ENGINE_RELOAD_VERIFIED.json').removeprefix('/voices'))))
    status(phase='saved_model_ready',teacher_steps_completed=result['steps_completed'],
        exact_training_resume_verified=True,training_state_checkpoint_saved=True,trained_checkpoints_exported=True)
    current=max(billed(),authorization['current_billed_cost_usd']+result['function_seconds_total']*39.5248/3600+1.2)
    if current+1.6>66:
        status(phase='saved_model_ready_audio_budget_hold',request_complete=False,conservative_billed_bound=current);return
    okay=paid_stage('FINAL_INFERENCE_STARTED.json',[MODAL,'run','tooling/voice/modal_drama3_fullsize_listen.py',
        '--folder',str(OUT),'--arm','korean_teacher','--run-root',REMOTE],'modal-generation.log')
    if not okay:
        status(phase='generation_stopped',request_complete=False,automatic_paid_retry=False);return
    report=read(OUT/'korean_teacher_generation.json')
    if report['status']!='complete' or len(report['items'])!=16:raise ValueError('Incomplete comparison audio')
    destination=OUT/'korean_teacher';destination.mkdir(exist_ok=True)
    for item in report['items']:
        name=item['file']
        if Path(name).name!=name:raise ValueError('Unsafe generated filename')
        content=b''.join(volume.read_file((REMOTE+'/listening/korean_teacher/'+name).removeprefix('/voices')))
        if hashlib.sha256(content).hexdigest()!=item['sha256']:raise ValueError('Downloaded audio checksum mismatch')
        (destination/name).write_bytes(content)
    (destination/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    final_billed=billed()
    (OUT/'RESULTS.md').write_text(f'''# Miro 학습 재개 검증

실제 Drama 3 기반 35,899,643,008개 TTS 파라미터 전체 학습입니다. LoRA나 축소 모델이 아닙니다.
기존 1회 학습 가중치를 이어받아 총 {result['steps_completed']}회까지 진행했습니다. 원본 가중치부터 다시 학습하지 않았습니다.
첫 1회 저장본에는 옵티마이저와 학습용 티처 헤드가 없어, 이번 전환 때만 두 상태를 새로 구성했습니다.
그 이후 ZeRO-3의 FP32 마스터 가중치·Adam 모멘트·티처 헤드·난수·다음 데이터 위치를 함께 저장했습니다.

새 학습 프로세스와 새 ZeRO 엔진으로 실제 저장 상태를 불러왔습니다.
8개 GPU 모두에서 FP32 마스터 및 옵티마이저의 표본 값·난수·데이터 위치가 맞는지 확인했고 실제 검증 계산을 통과했습니다.
이는 전체 옵티마이저 파일의 별도 해시 검사를 의미하지 않습니다. 파일 크기와 PyTorch 저장 구조도 검사했습니다.

재개용 파일은 COMPLETE.json의 경로에 보존되어 있습니다. 부분 저장본은 최신 재개 지점으로 등록하지 않습니다.
고정 학습 계획과 GPU 8개 구성이 유지되어야 같은 상태로 재개할 수 있습니다.
마지막 저장 이후 진행분은 중단 시 다시 계산할 수 있습니다. 프로덕션 품질 완료를 뜻하지 않습니다.

기존 Drama 3의 비교 음성 16개를 재사용했고, 같은 대사·참조·시드로 새 음성 16개를 생성했습니다.
속도·피치·강약 후처리는 없습니다. 청취 선호 및 사람 같은 연기 개선은 아직 평가하지 않았습니다.
한국어 HuBERT는 TTS 보조 손실이며 음성 코덱은 동결했습니다.

운영 지출 상한은 기존 납부 $30을 합친 순청구 $66, 즉 이번 추가 총 $36으로 낮췄습니다.
절대 승인 상한 $44보다 $8 낮습니다. 마지막 청구 집계는 순청구 ${final_billed:.2f}이며 집계 지연이 있을 수 있습니다.
''')
    status(phase='complete',request_complete=True,trained_model_audio_generated=True,
        quality_improvement_confirmed=False,original_25_update_goal_complete=result['steps_completed']==25,
        last_metered_billed_cost=final_billed,additional_cash_used=max(0,final_billed-30))
    print('RESUME_AND_COMPARISON_READY http://127.0.0.1:8807/compare.html',flush=True)


if __name__=='__main__':
    lock=(OUT/'controller.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    try:main()
    except Exception as error:
        status(phase='controller_error',controller_error=repr(error),request_complete=False)
        raise
