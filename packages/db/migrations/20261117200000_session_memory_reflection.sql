-- 11/17 기억 페이지: 캐릭터가 기억을 보고 쓴 '나에 대한 생각'을 방마다 하나 저장한다(기억이 바뀌면 다시 쓴다).
alter table roleplay_sessions add column if not exists memory_reflection jsonb;
