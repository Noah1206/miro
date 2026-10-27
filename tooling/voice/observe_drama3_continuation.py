"""Local progress ledger only. Does not launch or modify any cloud workload."""
import argparse
from datetime import datetime,timezone
import json
from pathlib import Path


def observe(folder):
    root=Path(folder);log=(root/'continuous-training.log').read_text(errors='replace')
    events=[]
    for line in log.splitlines():
        if line.startswith('AB_STEP korean_teacher '):
            events.append(json.loads(line.split(' ',2)[2]))
    step=events[-1]['step'] if events else 5
    phase='training' if events else ('resume_verified' if 'AB_EXACT_RESUME_VERIFIED' in log else 'loading_checkpoint')
    durable=5
    if 'AB_RESUME_CHECKPOINT ' in log:phase='saving_checkpoint'
    if 'CONTINUOUS_CHECKPOINT_DURABLE ' in log:
        durable=int(log.split('CONTINUOUS_CHECKPOINT_DURABLE ')[-1].splitlines()[0]);phase='checkpoint_committed_in_worker'
    if (root/'training_result.json').exists():phase='gpu_finished_needs_external_audit'
    elif 'Traceback (most recent call last)' in log:phase='worker_error_no_automatic_retry'
    if (root/'external_checkpoint_audit.json').exists():
        verified=json.loads((root/'external_checkpoint_audit.json').read_text())
        durable=verified['saved_step'];phase='checkpoint_externally_verified'
    if (root/'FINAL_BUDGET_SNAPSHOT.json').exists():
        budget=json.loads((root/'FINAL_BUDGET_SNAPSHOT.json').read_text())
        if not budget.get('running_containers') and durable>5:phase='finished_saved'
    deltas=[b['seconds']-a['seconds'] for a,b in zip(events,events[1:])]
    result={'phase':phase,'last_completed_update':step,'target_update':25,'new_updates_completed':step-5,
        'durable_checkpoint_step_confirmed_in_worker':durable,
        'last_update_seconds':round(deltas[-1],2) if deltas else None,
        'steady_update_mean_seconds':round(sum(deltas)/len(deltas),2) if deltas else None,
        'source_step5_preserved':True,'additional_total_cash_ceiling_usd':70,
        'updated_at_utc':datetime.now(timezone.utc).isoformat(),'automatic_paid_retry':False}
    (root/'status.json').write_text(json.dumps(result,indent=2))
    (root/'학습_진행상황.txt').write_text(f'현재 단계: {phase}\n계산 완료: {step}/25회\n이번 실행의 새 업데이트: {step-5}회\n작업 서버에서 확인된 안전 저장: {durable}회\n승인된 추가 총예산: $70\n원래 5회 저장본 보존\n갱신: '+result['updated_at_utc']+'\n')
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('folder');print(json.dumps(observe(p.parse_args().folder)))
