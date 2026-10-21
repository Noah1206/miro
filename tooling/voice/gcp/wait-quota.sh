#!/bin/zsh
# GPU 쿼터 승인을 기다렸다가(10/21 케이스 5afb0e13) 자동으로 잇는다: Job 생성 → male-1 데이터셋으로 시험 학습 → 워커를 gcp 모드로 재시작.
#   nohup ./tooling/voice/gcp/wait-quota.sh > ~/.miro/gcp-wait.log 2>&1 &     (한 시간마다 시도, 성공하면 끝난다)
export PATH=/opt/homebrew/share/google-cloud-sdk/bin:$HOME/.nvm/versions/node/v24.18.0/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/../../.."
until SKIP_BUILD=1 ./tooling/voice/gcp/deploy-train-job.sh 2>&1 | tail -n 2 | grep -q '준비됨'; do date '+%m/%d %H:%M 아직 쿼터 없음'; sleep 3600; done
echo "$(date '+%m/%d %H:%M') Job 생성됨 — male-1 로 시험 학습"
gsutil -q cp ~/GPT-SoVITS/jobs/male-1.zip gs://miro-tts-voices-miro-508504/datasets/male-1.zip
if gcloud run jobs execute miro-train --args male-1 --region us-central1 --project miro-508504 --wait --quiet 2>&1 | tail -n 3; then
  gsutil ls gs://miro-tts-voices-miro-508504/weights/male-1/ && echo "시험 학습 OK — 워커 gcp 모드로 재시작"
  pkill -f 'tooling/voice/worker.ts'; sleep 1
  export $(grep -E '^DATABASE_URL=' .env); MIRO_TRAINER=gcp nohup pnpm -s voice:worker > ~/.miro/voice-worker.log 2>&1 &
  echo DONE
else echo "시험 학습 실패 — 로그: gcloud run jobs executions list --job miro-train --region us-central1"; fi
