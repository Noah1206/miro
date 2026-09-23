SET lock_timeout = '3s';
SET search_path = pg_catalog, public, extensions;
CREATE INDEX CONCURRENTLY IF NOT EXISTS character_search_docs_trgm_idx
  ON miro_perf.character_search_docs USING gin (search_text gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS character_search_docs_short_idx
  ON miro_perf.character_search_docs USING gin (short_grams);
CREATE INDEX CONCURRENTLY IF NOT EXISTS character_play_counts_rank_idx
  ON miro_perf.character_play_counts (plays DESC, created_at DESC, character_id DESC);
ANALYZE miro_perf.character_search_docs;
ANALYZE miro_perf.character_play_counts;
