SET LOCAL lock_timeout = '5s';

-- 11/3 사용자 결정: 일반·언베일을 한 방으로(인라인 미러링 기본 켜짐). 남아 있는 언베일 방을 정리한다.
-- ① 언베일 방에서 캐릭터 쪽이 쓴 답은 언베일 모델 것이므로 is_explicit 로 표시 — 상용 모델로 가는 기록에서는 줄거리로만 간다(fail closed).
UPDATE messages SET is_explicit = true
WHERE role IN ('character', 'narrator', 'npc') AND is_explicit IS DISTINCT FROM true
  AND session_id IN (SELECT id FROM roleplay_sessions WHERE adult_since IS NOT NULL AND deleted_at IS NULL);

-- ② 같은 캐릭터의 일반 방이 이미 있으면 언베일 방은 보관(대화 목록에서 빠짐, 지우지 않음).
UPDATE roleplay_sessions u SET status = 'archived'
WHERE u.adult_since IS NOT NULL AND u.deleted_at IS NULL AND u.status = 'active'
  AND EXISTS (SELECT 1 FROM roleplay_sessions n WHERE n.user_id = u.user_id AND n.character_id = u.character_id
    AND n.adult_since IS NULL AND n.deleted_at IS NULL AND n.status = 'active');

-- ③ 일반 방이 없으면 그 언베일 방이 그 캐릭터의 한 방이 된다.
UPDATE roleplay_sessions SET adult_since = NULL
WHERE adult_since IS NOT NULL AND deleted_at IS NULL AND status = 'active';
