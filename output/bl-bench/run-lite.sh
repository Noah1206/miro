#!/usr/bin/env bash
# usage: run.sh <label> <cap_usd> [only_ids]
set -euo pipefail
cd /Users/johyeon-ung/Desktop/Miro
S=/private/tmp/claude-501/-Users-johyeon-ung-Desktop-Miro/e52a0114-cca3-4e0c-93c3-f25b8a803b0a/scratchpad
DB=postgresql://localhost/miro_blbench_test
export PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH
eval "$(python3 -c "import json,shlex;[print('export '+k+'='+shlex.quote(v)) for k,v in json.load(open('$S/bench-env-lite.json')).items()]")"
export DATABASE_URL=$DB TEST_DATABASE_URL=$DB NODE_ENV=production BENCH_OUT=/Users/johyeon-ung/Desktop/Miro/output/bl-bench BENCH_CANON=/Users/johyeon-ung/Desktop/Miro/output/bl-bench/canon.json
export BENCH_LABEL=$1 BENCH_CAP_USD=$2 BENCH_ONLY=${3:-}
export AI_DAILY_BUDGET=10 AI_DAILY_REQUEST_LIMIT=3000 AI_USER_DAILY_LIMIT=500 MIRO_REQUESTS_PER_MINUTE=120 MIRO_BUDGET_POLICY="{\"user_monthly\":{\"cost\":5,\"requests\":500}}"
pnpm exec vitest run --config ai/evals/agency/vitest.config.ts apps/web/lib/simulation/bl-bench.eval.ts 2>&1 | grep -v "trust settings" | grep -E "✓|×|Error|FAIL|Tests |BENCHDBG" | head -20
