#!/usr/bin/env bash
# Read-only: AI calls and estimated cost for the synthetic QA account only.
cd /Users/johyeon-ung/Desktop/Miro
URL=$(grep '^DIRECT_DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')
U=$(python3 -c "import json;print(json.load(open('output/conv-check/account.json'))['userId'])")
psql -X -q "$URL" <<SQL
begin read only;
select count(*) calls, round(coalesce(sum(estimated_cost),0)::numeric,4) est_usd, round(coalesce(sum(greatest(coalesce(estimated_cost,0),reserved_cost)),0)::numeric,4) conservative_usd
from ai_usage where user_id='$U' or session_id in (select id from roleplay_sessions where user_id='$U');
commit;
SQL
