WITH expected AS (
  SELECT c.id AS character_id, w.id AS world_id, miro_perf.character_search_text(c, w.genre) AS search_text
  FROM public.characters c LEFT JOIN public.worlds w ON w.character_id = c.id
)
SELECT 'search_docs' AS check_name, count(*) AS mismatches
FROM expected e FULL JOIN miro_perf.character_search_docs d
  ON d.character_id = e.character_id AND d.world_id IS NOT DISTINCT FROM e.world_id
WHERE e.character_id IS NULL OR d.character_id IS NULL OR e.search_text IS DISTINCT FROM d.search_text
UNION ALL
SELECT 'play_users', count(*) FROM (
  SELECT character_id, user_id, count(*)::integer AS active_sessions
  FROM public.roleplay_sessions WHERE deleted_at IS NULL GROUP BY character_id, user_id
) expected FULL JOIN miro_perf.character_play_users actual
  ON actual.character_id = expected.character_id AND actual.user_id = expected.user_id
WHERE expected.active_sessions IS DISTINCT FROM actual.active_sessions
UNION ALL
SELECT 'play_counts', count(*) FROM (
  SELECT character_id, count(DISTINCT user_id)::integer AS plays
  FROM public.roleplay_sessions WHERE deleted_at IS NULL GROUP BY character_id
) expected FULL JOIN miro_perf.character_play_counts actual
  ON actual.character_id = expected.character_id
WHERE expected.plays IS DISTINCT FROM actual.plays;

SELECT 'backfill_state' AS check_name, count(*) AS missing_characters
FROM public.characters c LEFT JOIN miro_perf.character_backfill_state state
  ON state.character_id = c.id
WHERE state.character_id IS NULL;

SELECT indexrelid::regclass AS index_name, indisvalid
FROM pg_index WHERE indexrelid::regclass::text IN (
  'worlds_character_order_idx', 'sessions_active_character_user_idx',
  'miro_perf.character_search_docs_trgm_idx', 'miro_perf.character_search_docs_short_idx',
  'miro_perf.character_play_counts_rank_idx'
) ORDER BY 1;
