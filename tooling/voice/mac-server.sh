#!/bin/zsh
# 맥북을 임시 운영 음성 서버로 쓴다(10/20): gsv_server(8787) + ngrok 터널 + 잠자기 방지. GPU 호스트(GCP)로 옮기기 전까지.
#   시작:  ./tooling/voice/mac-server.sh            → 공개 주소를 찍는다. 이 주소를 Vercel MIRO_TTS_URL 에 넣고 재배포.
#   고정 주소: ngrok 대시보드(dashboard.ngrok.com/domains)에서 무료 고정 도메인을 하나 만들고 NGROK_DOMAIN=<도메인> 으로 실행하면 재시작해도 주소가 안 바뀐다.
#   멈춤:  pkill -f gsv_server.py; pkill -x ngrok; pkill -x caffeinate; pkill -f tooling/voice/worker.ts
set -e
export PATH=$HOME/.nvm/versions/node/v20.19.6/bin:/opt/homebrew/bin:$PATH
KEY=$(cat ~/.miro/voices/gsv/modal-tts-api-key.txt)        # Vercel MIRO_TTS_API_KEY 와 같은 키
VOICES=~/.miro/voices/gsv/voices
DEFAULT_VOICE=${MIRO_TTS_DEFAULT_VOICE:-08404decab9cbbb34eacfc63d20f2d6437d6570efeed9f029a0ae5d59e830b10}
pkill -f gsv_server.py 2>/dev/null || true; pkill -x ngrok 2>/dev/null || true; pkill -x caffeinate 2>/dev/null || true; sleep 1
cd ~/GPT-SoVITS
MIRO_TTS_API_KEY="$KEY" nohup ./venv/bin/python ~/Desktop/Miro/tooling/voice/gsv_server.py --voices-dir "$VOICES" --default-voice "$DEFAULT_VOICE" --port 8787 > output/gsv_server.log 2>&1 &
NGROK_DOMAIN=${NGROK_DOMAIN:-model-excited-goat.ngrok-free.app}  # 운영 Vercel MIRO_TTS_URL 이 이 주소 — 빠지면 임시 주소로 떠서 운영 음성이 끊긴다
if [ -n "${NGROK_DOMAIN:-}" ]; then nohup ngrok http 8787 --url="$NGROK_DOMAIN" --log=stdout --log-format=json > ~/.miro/ngrok.log 2>&1 &
else nohup ngrok http 8787 --log=stdout --log-format=json > ~/.miro/ngrok.log 2>&1 & fi
nohup caffeinate -is > /dev/null 2>&1 &
# 목소리 만들기 워커(관리자 콘솔 /voices 의 작업을 집어 간다) — 저장소 루트에서, 운영 DB 로
pkill -f 'tooling/voice/worker.ts' 2>/dev/null || true
(cd ~/Desktop/Miro && export $(grep -E '^DATABASE_URL=' .env) && export MIRO_TRAINER=${MIRO_TRAINER:-modal} && PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH nohup pnpm -s voice:worker > ~/.miro/voice-worker.log 2>&1 &)
for i in $(seq 1 40); do curl -s -m 3 http://127.0.0.1:8787/health | grep -q '"ok"' && break; sleep 5; done
URL=$(curl -s http://127.0.0.1:4040/api/tunnels | python3 -c "import json,sys; print(json.load(sys.stdin)['tunnels'][0]['public_url'])")
echo "공개 주소: $URL"; curl -s -m 60 "$URL/health"; echo
