"""Continue the already authorized single run locally; never retry paid functions.

Only a completed 25-update run and independently reloaded first checkpoint may
trigger one final inference job. This is an active job controller, not a schedule.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT=Path('/Users/johyeon-ung/Desktop/Miro')
OUTPUT=ROOT/'output/voice-compare/drama3-fullsize-ko-007-20261024-budget44'
REMOTE='/voices/_drama3/fullsize-ko-007-20261024-budget44-v1'
PYTHON=Path('/Users/johyeon-ung/.miro/voice-venv/bin/python')
MODAL=PYTHON.parent/'modal'


def read_json(path):
    return json.loads(path.read_text())


def write_status(**changes):
    state=read_json(OUTPUT/'status.json');state.update(changes)
    temporary=OUTPUT/'status.json.tmp';temporary.write_text(json.dumps(state,ensure_ascii=False,indent=2));temporary.replace(OUTPUT/'status.json')


def board():
    subprocess.run([str(PYTHON),'tooling/voice/package_drama3_fullsize_ab.py',str(OUTPUT)],cwd=ROOT,check=True)


def main():
    import modal
    volume=modal.Volume.from_name('miro-voices')
    deadline=time.monotonic()+3*3600
    previous_step=-1
    while time.monotonic()<deadline:
        if (OUTPUT/'CANCEL_REQUESTED').exists():
            write_status(phase='cancelled',request_complete=False);return
        log=(OUTPUT/'modal-training.log').read_text(errors='replace')
        events=re.findall(r'AB_STEP korean_teacher (\{[^\n]+\})',log)
        if events:
            event=json.loads(events[-1]);step=event['step']
            if step!=previous_step:
                write_status(phase='training',teacher_steps_completed=step);previous_step=step;board()
                print('Observed completed update',step,flush=True)
        gates=re.findall(r'FIRST_SAVE_GATE (\{[^\n]+\})',log)
        if gates:
            decision=json.loads(gates[-1])
            if not (OUTPUT/'FIRST_SAVE_VERIFIED.json').exists():
                (OUTPUT/'FIRST_SAVE_VERIFIED.json').write_text(json.dumps(decision,indent=2))
                for name in ['report.json','neutral_s1234.wav']:
                    source=REMOTE+'/listening/first_snapshot_probe/'+name
                    local=OUTPUT/'first_snapshot_probe'/name;local.parent.mkdir(exist_ok=True)
                    local.write_bytes(b''.join(volume.read_file(source.removeprefix('/voices'))))
                write_status(first_save_independent_reload_verified=decision['verified'],intermediate_tts_weights_available=True)
                print('Independent step1 saved-weight inference verified',flush=True)
        if (OUTPUT/'training_comparison.json').exists():
            training=read_json(OUTPUT/'korean_teacher_training.json')
            assert training['steps_completed']==25 and training['trainable_tts_parameters']==35899643008
            assert gates and json.loads(gates[-1])['verified']
            break
        if 'Traceback' in log and ('App failed' in log or 'Stopping app - uncaught exception' in log):
            write_status(phase='stopped',request_complete=False,automatic_retry=False)
            board();print('Training stopped; no paid retry or final inference launched',flush=True);return
        time.sleep(20)
    else:
        write_status(phase='controller_wait_expired',request_complete=False)
        print('Controller wait expired; no extra paid function launched',flush=True);return
    write_status(phase='generating',teacher_steps_completed=25,trained_checkpoints_exported=True)
    board()
    # A controller restart must never cause a second paid inference attempt.
    with (OUTPUT/'FINAL_INFERENCE_STARTED.json').open('x') as marker:
        marker.write(json.dumps({'started_unix':time.time(),'automatic_retry':False}))
    with (OUTPUT/'modal-generation.log').open('w') as log:
        code=subprocess.run([str(MODAL),'run','tooling/voice/modal_drama3_fullsize_listen.py',
            '--folder',str(OUTPUT),'--arm','korean_teacher','--run-root',REMOTE],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT).returncode
    if code:
        write_status(phase='generation_failed',request_complete=False,automatic_retry=False)
        print('Final inference stopped; saved models preserved, no retry',flush=True);return
    report=read_json(OUTPUT/'korean_teacher_generation.json')
    assert report['status']=='complete' and len(report['items'])==16
    import hashlib
    destination=OUTPUT/'korean_teacher';destination.mkdir(exist_ok=True)
    for item in report['items']:
        name=item['file']
        if Path(name).name!=name:raise ValueError('Unsafe audio filename')
        contents=b''.join(volume.read_file((REMOTE+'/listening/korean_teacher/'+name).removeprefix('/voices')))
        if hashlib.sha256(contents).hexdigest()!=item['sha256']:raise ValueError('Downloaded audio checksum mismatch')
        (destination/name).write_bytes(contents)
    (destination/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    write_status(phase='complete',trained_model_audio_generated=True,request_complete=True,
                 quality_improvement_confirmed=False,listening_comparison_ready=True)
    (OUTPUT/'RESULTS.md').write_text('''# Miro 한국어 티처 Full FT 비교

실제 Drama 3 기반 35,899,643,008개 TTS 파라미터를 전체 학습한 25회 업데이트 실험입니다.
007번의 훈련 문장 400개를 사용했고, 별도 검증 문장으로 학습 전후 음성 손실을 측정했습니다.
한국어 HuBERT 보조 손실은 TTS 학습에 적용했으며 음성 코덱은 동결했습니다.
티처 없는 비교 모델은 학습하지 않았으므로 한국어 티처만의 효과는 분리할 수 없습니다.

1·10·20회와 최종 25회에 네이티브 추론 가중치를 저장했습니다.
1회 저장본은 별도 GPU 컨테이너에서 모든 가중치 파일의 해시를 검증하고,
해당 저장본으로 실제 음성을 생성한 후에 다음 학습으로 진행했습니다.
이 저장본은 추론용 전체 가중치이며 Adam 상태를 포함하는 정확한 학습 재개 파일은 아닙니다.

기존 원본 Drama 3 음성 16개를 재사용하고, 같은 대사·참조·시드로 새 모델 음성 16개를 생성했습니다.
속도·피치·강약 후처리는 하지 않았습니다. 길이 제한에 도달한 결과도 포함해 모두 공개합니다.
프로덕션 품질 및 사람 같은 연기 개선 여부는 아직 청취 평가하지 않았습니다.

결제는 사용량에 따른 후불입니다. 기존 미청구 약 $3.57를 포함한 추가 총예산 $44이며,
이번 달 청구 한도는 이미 납부한 $30까지 합친 $74로 설정했습니다.
실제 사용액은 Modal 청구 집계 후 확인해야 합니다.
''')
    board();print('COMPLETE: http://127.0.0.1:8806/compare.html',flush=True)


if __name__=='__main__':
    import fcntl
    lock=(OUTPUT/'controller.lock').open('w')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    try:main()
    except Exception as error:
        write_status(phase='controller_error',request_complete=False,controller_error=repr(error))
        raise
