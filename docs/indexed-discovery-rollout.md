# Indexed discovery rollout

`MIRO_FEATURE_INDEXED_DISCOVERY` is off unless set to `1`. Keep it off throughout preparation and backfill. The ordinary SQL migration refuses more than 10,000 characters or sessions; do not bypass that guard on a live database. The `online` files are deliberately outside the root `packages/db/migrations/*.sql` glob and must be run explicitly. Do not run `pnpm db:migrate:sql` against a large live database after this rollout; it will refuse the monolithic migration.

Use Node 24 and an explicitly selected `DATABASE_URL`. Rehearse every command on a production-sized clone before production. The commands below are **not** run automatically by deployment.

## Phase 1: install and backfill with old reads

1. Keep the feature flag unset. Check that the app's database role has access to `miro_perf`; the current Supabase pooler connection resolves to role `postgres`, which the migration grants explicitly. A different role needs equivalent grants before writes resume.
2. Create the two source-table indexes online, without `--single-transaction`:

   ```sh
   psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f packages/db/migrations/online/01_preflight_indexes.sql
   ```

   Also create the public-feed keyset index online. The normal migration file refuses a blocking build above 10,000 characters.

   ```sh
   psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f packages/db/migrations/online/04_public_feed_order.sql
   ```

3. Install schema and triggers in one short transaction. This mode skips the table-wide write lock, bulk backfill, and GIN/rank index builds. `lock_timeout=3s` makes the attempt fail rather than queue indefinitely behind traffic.

   ```sh
   psql -X -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL" \
     -c "SET LOCAL miro.online_phase='schema'" \
     -f packages/db/migrations/20260923110000_search_and_popular_indexes.sql
   ```

4. Run one backfill worker. Each batch commits independently; existing characters remain unready until their search documents and play counters have been reconciled under the same per-character advisory lock used by write triggers. New characters are ready on insert. Stop the worker if database CPU, lock waits, app errors, or p95 exceed the deployment's agreed limits. Resume with the last printed cursor; reprocessing a committed batch is safe.

   ```sh
   MIRO_ALLOW_INDEX_BACKFILL=1 MIRO_BACKFILL_BATCH_SIZE=100 MIRO_BACKFILL_PAUSE_MS=25 \
     DATABASE_URL="$DATABASE_URL" node tooling/backfill-indexed-discovery.mjs
   ```

   To resume, set `MIRO_BACKFILL_AFTER_ID` to the last printed `cursor`. Do not enable the feature while this worker is incomplete.

## Phase 2: index, verify, cut over

1. Build read indexes concurrently, without `--single-transaction`. Monitor DB I/O and application latency; a concurrent build permits writes but can still consume resources. If an index build fails, inspect `pg_index.indisvalid`, drop only the invalid index with `DROP INDEX CONCURRENTLY`, and retry.

   ```sh
   psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f packages/db/migrations/online/02_finish_indexes.sql
   psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f packages/db/migrations/online/03_validate.sql
   ```

2. Require all three mismatch counts to be zero and all five indexes to be valid. Check that every current character has a row in `miro_perf.character_backfill_state`. Rerun validation after a representative write/soft-delete/hard-delete sample in the clone, then measure search and cold popular p95 with the feature enabled in the clone. Do not infer 100k/1m performance from the 10k local benchmark.
3. Enable `MIRO_FEATURE_INDEXED_DISCOVERY=1` only after validation. Roll out to one app instance, watch errors, timeout/429 rate, database CPU and p95, then increase traffic. The old query branch remains in code for rollback.

## Stop and rollback

An aborted batch rolls back without advancing its printed cursor. On any validation mismatch or latency/error regression, keep or set `MIRO_FEATURE_INDEXED_DISCOVERY=0`; the old search and popular queries still work. Pause the worker and leave the derived tables in place while diagnosing. Do not rerun the monolithic migration to repair a large database: its bulk path takes a table-wide write lock. A failed schema transaction rolls back its triggers and tables. Remove the derived schema and triggers only in a separate reviewed maintenance change after the flag is off.
