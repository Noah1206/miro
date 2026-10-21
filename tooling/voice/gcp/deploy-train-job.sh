#!/bin/zsh
# 학습용 Cloud Run Job(miro-train) 만들기·갱신 — 이미지는 Cloud Build 로(맥에 Docker 데몬 불필요). 10/21.
#   ./tooling/voice/gcp/deploy-train-job.sh            → 이미지 빌드(첫 회 15분) + Job 생성/갱신
#   실행 테스트: gcloud run jobs execute miro-train --args <voice_id> --region us-central1 --wait
set -euo pipefail
cd "$(dirname "$0")"
PROJECT=${PROJECT:-$(gcloud config get-value project 2>/dev/null)}
REGION=${REGION:-us-central1}
BUCKET=${BUCKET:-miro-tts-voices-$PROJECT}
cp ../gsv_server.py ../train_miro.py ./
IMAGE="$REGION-docker.pkg.dev/$PROJECT/miro/tts:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
gcloud builds submit --tag "$IMAGE" --project "$PROJECT" --machine-type e2-highcpu-8 --timeout 2400 . | grep -E 'SUCCESS|ERROR|FAILURE|Step #|IMAGE' | tail -n 5
rm -f ./gsv_server.py ./train_miro.py
echo "$IMAGE" > .last-image
# L4 GPU 1개, 4 vCPU·16GiB(GPU 최소 사양), 작업당 최대 1시간. 요청 없으면 비용 0.
if gcloud run jobs describe miro-train --region "$REGION" --project "$PROJECT" >/dev/null 2>&1; then CMD=update; else CMD=create; fi
gcloud run jobs $CMD miro-train --image "$IMAGE" --region "$REGION" --project "$PROJECT" \
  --gpu 1 --gpu-type nvidia-l4 --cpu 4 --memory 16Gi --task-timeout 3600 --max-retries 0 \
  --command python --args /gsv/train_job.py --set-env-vars BUCKET="$BUCKET"
echo "Job miro-train 준비됨 (이미지 $IMAGE)"
