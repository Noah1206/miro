#!/usr/bin/env bash
# Read-only state of ONE synthetic QA room: relationship, last messages, memories, inbox. Usage: state.sh <sessionId> [messages=4]
cd /Users/johyeon-ung/Desktop/Miro
URL=$(grep '^DIRECT_DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')
U=$(python3 -c "import json;print(json.load(open('output/conv-check3/account.json'))['userId'])")
S=$1; N=${2:-4}
psql -X -q "$URL" <<SQL
begin read only;
select r.version, r.trust, r.attraction, r.emotional_distance, r.attachment, r.stage from relationships r join roleplay_sessions s on s.id=r.session_id where s.id='$S' and s.user_id='$U';
select m.turn_index, m.role, m.kind, to_char(m.created_at at time zone 'Asia/Seoul','HH24:MI:SS') t, left(m.content, 1500) content from messages m join roleplay_sessions s on s.id=m.session_id
 where s.id='$S' and s.user_id='$U' order by m.created_at desc, m.id desc limit $N;
select i.status, i.attention_state, to_char(i.next_review_at at time zone 'Asia/Seoul','HH24:MI:SS') next_review, i.read_at is not null was_read, i.attention_decision->'replyDisposition'->>'disposition' disposition, i.attention_decision->>'action' attention from messenger_inbox i join roleplay_sessions s on s.id=i.session_id where s.id='$S' and s.user_id='$U' order by i.created_at;
commit;
SQL
