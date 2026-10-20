#!/bin/zsh
# 음성 합성 서버를 Cloud Run GPU(L4)에 배포한다 — 요청 없으면 0 으로 줄어 GCP 300달러 체험 크레딧 안에서 돈다.
#   준비(한 번): gcloud auth login → gcloud config set project <프로젝트>  (체험 계정은 '전체 계정으로 업그레이드' 해야 GPU 가 열린다)
#   실행:       MIRO_TTS_API_KEY=<키> ./tooling/voice/gcp/deploy.sh
#   목소리:     gsutil -m cp -r ~/.miro/voices/gsv/voices/<해시> gs://$BUCKET/<해시>   (버킷이 /voices 로 마운트된다)
#   앱 연결:    Vercel env MIRO_TTS_URL=<서비스 URL>, MIRO_TTS_API_KEY=<같은 키> → 재배포
set -euo pipefail
cd "$(dirname "$0")"
PROJECT=${PROJECT:-$(gcloud config get-value project 2>/dev/null)}
REGION=${REGION:-us-central1}            # Cloud Run GPU(L4) 지원 리전. 한국 리전은 아직 없어 us-central1 이 가장 재고가 많다.
SERVICE=${SERVICE:-miro-tts}
BUCKET=${BUCKET:-miro-tts-voices-$PROJECT}
DEFAULT_VOICE=${MIRO_TTS_DEFAULT_VOICE:-08404decab9cbbb34eacfc63d20f2d6437d6570efeed9f029a0ae5d59e830b10}
[ -n "${MIRO_TTS_API_KEY:-}" ] || { echo "MIRO_TTS_API_KEY 가 필요합니다(cat ~/.miro/voices/gsv/modal-tts-api-key.txt)"; exit 1; }

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com secretmanager.googleapis.com --project "$PROJECT"
gcloud artifacts repositories describe miro --location "$REGION" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud artifacts repositories create miro --repository-format docker --location "$REGION" --project "$PROJECT"
gsutil ls -b "gs://$BUCKET" >/dev/null 2>&1 || gsutil mb -l "$REGION" "gs://$BUCKET"

cp ../gsv_server.py ./gsv_server.py
IMAGE="$REGION-docker.pkg.dev/$PROJECT/miro/tts:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
gcloud builds submit --tag "$IMAGE" --project "$PROJECT" --machine-type e2-highcpu-8 --timeout 1800 .
rm -f ./gsv_server.py

# API 키는 Secret Manager 에(명령줄 노출 최소화)
printf '%s' "$MIRO_TTS_API_KEY" | gcloud secrets create miro-tts-api-key --data-file=- --project "$PROJECT" 2>/dev/null \
  || printf '%s' "$MIRO_TTS_API_KEY" | gcloud secrets versions add miro-tts-api-key --data-file=- --project "$PROJECT"

# ponytail: 인스턴스 하나·동시 4(gsv_server 의 lock 이 순서대로 처리). 유저가 늘면 --max-instances 만 올린다.
gcloud run deploy "$SERVICE" --image "$IMAGE" --project "$PROJECT" --region "$REGION" \
  --gpu 1 --gpu-type nvidia-l4 --no-gpu-zonal-redundancy --cpu 4 --memory 16Gi \
  --min-instances 0 --max-instances 1 --concurrency 4 --timeout 300 --port 8787 \
  --no-cpu-throttling --allow-unauthenticated \
  --add-volume name=voices,type=cloud-storage,bucket="$BUCKET",readonly=true --add-volume-mount volume=voices,mount-path=/voices \
  --set-env-vars MIRO_TTS_DEFAULT_VOICE="$DEFAULT_VOICE" --set-secrets MIRO_TTS_API_KEY=miro-tts-api-key:latest

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format 'value(status.url)')
echo "배포됨: $URL   (Vercel MIRO_TTS_URL 에 넣고 재배포)"
curl -s -m 300 "$URL/health"; echo
