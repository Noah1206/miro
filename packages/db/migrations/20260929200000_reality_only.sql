-- 앱은 미로(reality) 캐릭터만 만든다(2026-09-29 결정). 새 행의 기본값만 바꾼다 — 기존 일반 캐릭터와 대화는 그대로 남는다.
ALTER TABLE characters ALTER COLUMN experience_type SET DEFAULT 'reality';
