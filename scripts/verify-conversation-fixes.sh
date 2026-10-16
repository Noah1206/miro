#!/usr/bin/env bash
set -euo pipefail
MIRO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$MIRO_ROOT"
if [[ -d "$HOME/.nvm/versions/node/v24.18.0/bin" ]]; then
  export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
fi

case "${1:---help}" in
  --unit)
    pnpm exec vitest run packages/engine/src/__tests__/conversation-repetition.test.ts \
      packages/engine/src/__tests__/conversation-grounding.test.ts \
      packages/engine/src/agency/__tests__/conversation-review.test.ts \
      apps/web/lib/messenger/__tests__/reply-disposition.test.ts
    ;;
  --db-tests)
    # Never point ordinary fixtures at production, the stopped demo, or the long-run DB.
    export TEST_DATABASE_URL='postgresql://localhost/miro_reality_test'
    pnpm exec vitest run apps/web/lib/reality/__tests__/agency.integration.test.ts
    ;;
  --health)
    python3 - <<'PY'
import json,urllib.request
with urllib.request.urlopen('https://miroapp.app/api/health',timeout=20) as response:
    data=json.load(response)
print(json.dumps(data,ensure_ascii=False))
if data.get('ok') is not True or data.get('schema')!='ready':
    raise SystemExit('운영 상태 확인 필요')
PY
    ;;
  --audit-messenger)
    # Only aggregates; no message bodies, account identifiers, mutations or scheduler calls.
    python3 - <<'PY'
import os,pathlib,subprocess
env=os.environ.copy()
if not env.get('DIRECT_DATABASE_URL'):
    for line in pathlib.Path('.env').read_text().splitlines():
        if line.startswith('DIRECT_DATABASE_URL='):
            env['DIRECT_DATABASE_URL']=line.split('=',1)[1].strip().strip('"').strip("'")
if not env.get('DIRECT_DATABASE_URL'):
    raise SystemExit('DIRECT_DATABASE_URL을 배포 환경 또는 로컬 .env에 설정하세요. 키를 채팅에 보내지 마세요.')
env['PGDATABASE']=env['DIRECT_DATABASE_URL']
sql="""
BEGIN READ ONLY;
SELECT i.status, count(*) AS items,
       count(*) FILTER (WHERE i.status='read' AND i.next_review_at < now()-interval '30 minutes') AS overdue_read,
       count(*) FILTER (WHERE i.lease_until < now()) AS expired_leases,
       count(*) FILTER (WHERE i.status='left' AND i.attention_decision->'replyDisposition' IS NULL) AS legacy_left_without_disposition
FROM messenger_inbox i JOIN roleplay_sessions s ON s.id=i.session_id
WHERE s.status='active' AND s.deleted_at IS NULL AND s.restricted_at IS NULL
  AND (i.created_at > now()-interval '7 days' OR i.status IN ('read','unread'))
GROUP BY i.status ORDER BY i.status;
COMMIT;
"""
subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1'],input=sql,text=True,env=env,check=True)
PY
    ;;
  --help|-h)
    cat <<'HELP'
미로 후속 확인 (장기 실험·AI 호출·문자 재발송·운영 DB 쓰기 없음)

bash scripts/verify-conversation-fixes.sh --health
bash scripts/verify-conversation-fixes.sh --unit
bash scripts/verify-conversation-fixes.sh --db-tests
bash scripts/verify-conversation-fixes.sh --audit-messenger

후속 작업 지시서: docs/verification/conversation-fixes-next-steps.md
HELP
    ;;
  *)
    printf '%s\n' '지원하지 않는 옵션입니다. --help를 확인하세요.' >&2
    exit 2
    ;;
esac
