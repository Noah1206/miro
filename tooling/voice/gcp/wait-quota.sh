#!/bin/zsh
# GPU 쿼터 승인을 기다렸다가(10/21 케이스 5afb0e13) 자동으로 잇는다: Job 생성 → male-1 데이터셋으로 시험 학습 → 워커를 gcp 모드로 재시작.
#   nohup ./tooling/voice/gcp/wait-quota.sh > ~/.miro/gcp-wait.log 2>&1 &     (한 시간마다 시도, 성공하면 끝난다)
export PATH=/opt/homebrew/share/google-cloud-sdk/bin:$HOME/.nvm/versions/node/v24.18.0/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/../../.."
# 10/21 18:02 거부 메일: "새 프로젝트는 48시간 뒤 재요청" → 10/23 18:10 이후 gcloud 로 한 번 더 요청하고, 그 뒤 매시간 Job 생성을 시도
RETRY_AT=$(date -j -f '%Y-%m-%d %H:%M' '2026-10-23 18:10' +%s)
while [ "$(date +%s)" -lt "$RETRY_AT" ]; do sleep 1800; done
echo "$(date '+%m/%d %H:%M') 쿼터 재요청"
gcloud quotas preferences create --service=run.googleapis.com --quota-id=NvidiaL4GpuAllocNoZonalRedundancyPerProjectRegion --preferred-value=1 --dimensions=region=us-central1 --project=miro-508504 --email=ab40905045@gmail.com --justification="Resubmitting after the 48h waiting period (case 5afb0e13-e7f2-49ba-b919-56c242ba7276). GPT-SoVITS voice fine-tuning as a Cloud Run Job: 1x L4, ~10 min per voice, a few runs per day, no concurrency." --format='value(quotaConfig.grantedValue,quotaConfig.stateDetail)' 2>&1 | tail -n 2
until SKIP_BUILD=1 ./tooling/voice/gcp/deploy-train-job.sh 2>&1 | tail -n 2 | grep -q '준비됨'; do date '+%m/%d %H:%M 아직 쿼터 없음'; sleep 3600; done
echo "$(date '+%m/%d %H:%M') Job 생성됨 — male-1 로 시험 학습"
gsutil -q cp ~/GPT-SoVITS/jobs/male-1.zip gs://miro-tts-voices-miro-508504/datasets/male-1.zip
if gcloud run jobs execute miro-train --args male-1 --region us-central1 --project miro-508504 --wait --quiet 2>&1 | tail -n 3; then
  gsutil ls gs://miro-tts-voices-miro-508504/weights/male-1/ && echo "시험 학습 OK — 워커 gcp 모드로 재시작"
  pkill -f 'tooling/voice/worker.ts'; sleep 1
  export $(grep -E '^DATABASE_URL=' .env); MIRO_TRAINER=gcp nohup pnpm -s voice:worker > ~/.miro/voice-worker.log 2>&1 &
  echo DONE
else echo "시험 학습 실패 — 로그: gcloud run jobs executions list --job miro-train --region us-central1"; fi
