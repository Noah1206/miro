#!/bin/zsh
# 관리자 실시간 현황(로컬, 11/18) — http://127.0.0.1:3300/live
#   운영 DB(루트 .env)를 읽고, 지금 접속 중인 사람은 이 맥의 운영 웹 서버(127.0.0.1:3100/api/presence, CRON_SECRET)에 묻는다.
#   127.0.0.1 에만 열어서 이 맥에서만 들어온다 — 그래서 콘솔 로그인 대신 운영자로 본다(ADMIN_TRUST_VERCEL_AUTH). 바깥에 열 땐 이 줄을 빼고 로그인을 쓸 것.
set -e
cd "${0:A:h}/../apps/admin"
set -a; source ../../.env; set +a
PROD_ENV=$HOME/miro-prod/apps/web/.env.production.local
# 운영자·테스터 계정은 집계에서 뺀다 — 이메일 목록만 운영 설정에서 가져온다.
for k in MIRO_OPERATOR_EMAILS MIRO_ADULT_TESTERS; do
  [[ -f $PROD_ENV ]] && export $k="$(grep "^$k=" $PROD_ENV | head -1 | cut -d= -f2- | tr -d '"')"
done
export ADMIN_TRUST_VERCEL_AUTH=1
exec ./node_modules/.bin/next dev -p ${PORT:-3300} -H 127.0.0.1
