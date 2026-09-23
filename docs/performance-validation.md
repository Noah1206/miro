# Reproducible local performance validation

This is a **local read-only HTTP workload** against synthetic fixtures. It is not a production capacity claim. Never point it at Supabase or `localhost:3000`: the repository's root `.env` may contain a production `DATABASE_URL`, and port 3000 is the developer's active server.

## Safety and setup

Use Node 24, a separate local PostgreSQL database named `miro_perf_test`, and a separate production-mode Next server on port 3100. The harness requires `TEST_DATABASE_URL` and calls `tooling/test-database.ts` before any fixture SQL. It ignores `DATABASE_URL` for fixture operations, rejects remote DB hosts and non-`_test` names, rejects HTTP targets other than loopback port 3100, and verifies a run-specific character through the target API before load. It never truncates shared tables, changes migration metadata or `ops_cron_config`, calls paid AI providers, or sends chat turns. Each run uses one owner, public characters, 100 worlds, and distinct authenticated users with one token and one play session, world state, relationship, and message each; `cleanup` removes only that run's users and their cascading character rows.

```sh
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
export TEST_DATABASE_URL='postgres://localhost/miro_perf_test'
node -e "import('./tooling/test-database.ts').then(({ testDatabaseUrl }) => testDatabaseUrl(process.env.TEST_DATABASE_URL))"
createdb miro_perf_test                 # once, only if absent
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate:sql
```

Build an **isolated copy** of the current checkout, not the original `.next` directory. For example, after source changes settle:

```sh
SOURCE="$PWD"
PERF_COPY="$(mktemp -d /tmp/miro-perf.XXXXXX)"
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' "$SOURCE/" "$PERF_COPY/"
ln -s "$SOURCE/node_modules" "$PERF_COPY/node_modules"
for module_path in apps/web packages/db packages/config packages/domain packages/engine packages/providers; do
  if test -d "$SOURCE/$module_path/node_modules"; then
    mkdir -p "$PERF_COPY/$module_path"
    ln -s "$SOURCE/$module_path/node_modules" "$PERF_COPY/$module_path/node_modules"
  fi
done
(
  cd "$PERF_COPY"
  DATABASE_URL="$TEST_DATABASE_URL" PERF_SAMPLE_RATE=1 pnpm --filter @miro/web build
  DATABASE_URL="$TEST_DATABASE_URL" PERF_SAMPLE_RATE=1 pnpm --filter @miro/web start --port 3100
)
```

Confirm the port is 3100 and the server uses the test DB before running. Do not run a production build in the original checkout while `localhost:3000` is live. Stop only the 3100 process after validation; keep 3000 running. Delete the temporary copy only after collecting logs and results.

## Stages

Run each matrix cell explicitly, recording the generated UUID. `seed` grows only its own fixture to the chosen character and user count; it never shrinks data. For a clean before/after comparison, use the **same** character count, user count, workload, server mode, DB, machine, and warmup settings for both revisions. A separate run ID can prevent cache and row-history contamination. Record `git rev-parse HEAD`, `git status --short`, Node version, server environment, DB size, available disk, and whether the server and DB were colocated.

```sh
node tooling/perf-load.mjs seed --characters=10000 --users=100
# Copy runId from the JSON line:
RUN_ID='<uuid>'
node tooling/perf-load.mjs run --run-id="$RUN_ID" --characters=10000 --users=100 \
  --duration-seconds=30 --warmup-seconds=5 --think-ms=100 > "perf-${RUN_ID}-10k-100.json"
node tooling/perf-browser.mjs --run-id="$RUN_ID" --samples=30 > "perf-${RUN_ID}-browser.json"
node tooling/perf-load.mjs cleanup --run-id="$RUN_ID"
```

For a targeted browser investigation, `--routes=homeToCreate --modes=warmNoPrefetch` selects only that route and mode. The allowlists reject unknown names; omitting both flags runs all five routes and all three modes. Do not interpret a targeted result as a full navigation verdict.

Supported stages are **10k, 100k, 1m public characters** crossed with **100, 500, 1000 distinct authenticated virtual users**. Test 10k/100 first; inspect it and resource headroom before increasing either dimension. The harness enforces sequential growth on both axes. Never automatically sweep all nine cells. Unrun cells must be labeled **not run**, not inferred from smaller stages. The fixture contains half `chat`, half `reality`, 100 worlds, one play session/world state/relationship/message per virtual user, no images/additional events/outbox, and a name marker shared by all fixture characters. Thus these stages validate feed/search read pressure, popular aggregation, archive summaries, and authenticated session lookup, **not** hot-item contention, historical row growth, media delivery, AI inference, or production DB/network behavior. Validate those separately.

Each virtual user issues sequential requests with fixed 100 ms think time by default (closed-loop). The mix is approximately 4 home : 3 Miro : 2 matching search : 1 nonexistent-term search : 1 popular; no user sends concurrent requests. The one-time `popularFirstRequest` probe runs after fingerprint verification but before virtual-user warmup. It is a **cold candidate**, not proof of an empty server cache; restart the isolated server for a defensible cold measurement. Nonexistent-term search expects zero items and reports `expectedEmpty` separately from unexpected empty feed responses. It measures HTTP JSON API completion, not browser click-to-content or image bytes. A closed-loop workload self-throttles when latency rises, so offered RPS is not an externally maintained arrival rate or open-loop capacity figure. `aggregate` and each route report offered/completed RPS, p50/p95/p99 latency, non-2xx errors, 429s, timeouts, empty successful item arrays, and peak total client inflight. Warmup requests are excluded. `offered - completed` can reflect requests canceled at an early stop; disclose it.

The run aborts early if, after 100 measured completions, aggregate p95 exceeds 3 seconds or non-success exceeds 5%; it also stops above 80 connections to the local test DB or below 2 GiB free disk. Seeding stops below 2 GiB free disk or above 80 DB connections, leaving a partial run for explicit cleanup. Each request times out at 10 seconds. These are conservative **local** stop rules, not production SLOs. Override with `--max-p95-ms`, `--max-db-connections`, or `--timeout-ms` only after documenting why. An early stop is a failed stage, even if its partial p95 looks acceptable. Inspect DB CPU/IO, queue and pool saturation, app CPU/RSS, and server logs separately; this script does not measure them.

For server-side timed spans, run the existing `node tooling/perf-report.mjs <server-log>` with `PERF_SAMPLE_RATE=1`. Keep server logs private; they may contain unrelated application messages. Compare warm and cold cache states separately. Report offered and completed load, rather than just latency, and do not claim a 1m/1000 pass from a 10k/100 result.

Browser navigation requires the separate `tooling/perf-browser.mjs` Playwright click-to-real-content run. Record home→Miro, Miro→home, home→search, home→create, and home→archive. The destination must have a character card, editable name field, or session row as appropriate—not merely a changed URL or loading shell. Use at least 30 successful samples **per route per mode** for a p95 verdict. Report p95 for a fresh browser context with prefetch blocked, a warm context with prefetch blocked, and the normal prefetch-enabled context separately. Fresh browser context does **not** guarantee cold server cache. The production-mode local build and actual link `prefetch` value must be stated. `fallbackCount` identifies samples whose click event mark was lost: those use a pre-click wall-clock mark and are upper-bound approximations, not precise click timing. The browser run stops after three failures, p95 above 3 seconds after 20 samples, less than 2 GiB free disk, or 900 seconds by default. An early stop or fewer than 30 samples is **not a p95 pass**. The application logs sample only 5% by default; set `PERF_SAMPLE_RATE=1` on the isolated server for comparable server-span counts, or disclose the 5% caveat. Rotate or timestamp-scope the server log for each HTTP or browser stage; a combined log cannot be directly compared to one stage's JSON.

Deployment: the resolved-event, archive-preview, and any future search indexes in SQL migrations may use `CREATE INDEX IF NOT EXISTS`, while `db:migrate:sql` runs each file inside `--single-transaction`. On already-large production tables, plan `CREATE INDEX CONCURRENTLY` **outside** that transactional runner, with a reviewed schema/journal reconciliation and post-rollout query-plan check. Do not replay a blocking index build blindly. Validation applies DDL only to guarded local test DBs; it does not migrate production.

## Verified local result, 2026-09-23

Both runs used Node 24.18.0, one local production-mode Next instance on port 3100, `miro_perf_test` on the same host, 10,000 fixture characters (5,000 of each type), 100 distinct auth sessions, 100 play sessions/world states/relationships/messages, zero fixture events, and 100 ms think time. Both ran 5 seconds warmup and 30 seconds measured. No paid AI or production traffic was generated. The baseline's DB was 14 MB; the candidate's indexed DB was 30 MB. The 100 play sessions are too few to call this a high-cardinality popular aggregation test. The baseline source and candidate source differ beyond a single feature flag, so the before/after comparison does **not** isolate causality.

| Source snapshot | Flag | Offered/completed | Offered/completed RPS | p50/p95/p99 (ms) | Errors/429/timeouts/unexpected empty | Expected empty search | Peak inflight |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| Baseline | 0 | 12,743/12,743 | 419.8/419.8 | 113.6/291.0/417.5 | 0/0/0/0 | 1,152 | 100 |
| Candidate | 1 | 18,144/18,144 | 601.9/601.9 | 52.8/141.9/273.3 | 0/0/0/0 | 1,642 | 100 |

Route p95 (ms), baseline→candidate: home 259.2→135.5; Miro 328.0→160.2; matching search 369.6→147.2; nonexistent-term search 256.0→101.4; popular 135.0→102.6. The one-time popular first request was 20.3→9.5 ms for six cards, **n=1** each, not a cold-query p95 or a meaningful stress result. The nonexistent-term path returned the expected empty array on all 1,152/1,642 measured requests. Both runs completed without early stop. Raw HTTP JSON: `/tmp/miro-perf-baseline-final-http.json` and `/tmp/miro-perf-candidate-final-http.json`.

Playwright p95 (ms) below uses **30 successful samples per route per mode** and waits for the destination card, form name field, or session row plus the next animation frame. Browser cold means a new browser context, not a cold server cache.

| Route | Fresh context, prefetch blocked | Warm context, prefetch blocked | Prefetch enabled |
| --- | ---: | ---: | ---: |
| Home→Miro | 76.7→64.2 | 47.4→33.0 | 44.5→41.5 |
| Miro→home | 81.8→79.1 | 51.1→50.0 | 47.9→47.4 |
| Home→search | 213.0→87.0 | 100.0→174.0 | 98.0→98.1 |
| Home→create | 130.9→100.1 | 164.8→349.3 | 77.1→106.8 |
| Home→archive | 86.4→80.1 | 44.4→48.8 | 46.9→46.6 |

The home→search prefetch-blocked samples used wall-clock fallback in **30/30 baseline and 30/30 candidate samples** in each of the two blocked modes; those values are pre-click upper-bound approximations, not exact click latency. The create path regressed in the warm and prefetch-enabled modes; do not describe all browser navigation as improved. All other browser modes had no fallback and no errors. Raw browser JSON: `/tmp/miro-perf-baseline-browser-30.json` and `/tmp/miro-perf-candidate-browser-30.json`. The server logs include HTTP, fingerprint, warmup, and browser traffic, so their aggregate `perf-report` output is **not** paired with either 30-second HTTP JSON stage.

Both snapshots had Git HEAD `4091521466de34ec8b3ece6321d7e0e9a9b778b1` plus uncommitted changes. Frozen baseline: `/tmp/miro-perf-baseline.xHmBKX`, `MIRO_FEATURE_INDEXED_DISCOVERY=0`, no `miro_perf` indexed schema applied during the baseline; SHA-256 `home.ts` `0d4155707e37a7f7faca71eb16f70d27f1fa209a69aa2f11cc8245c88dc739ba`, `search-index.ts` `21367ef9c82ec7c9c2769cdd5e0b212f10e25e50d0fb77bd278afd7d22a4e11c` (not wired), migration file `dbed7fd23a3c32ce13e91f6e6c29799522d56f9d64c064b269d292e6dafd996d`. Frozen candidate: `/tmp/miro-perf-candidate.73oIcg`, `MIRO_FEATURE_INDEXED_DISCOVERY=1`, exact migration SHA-256 `4bd34dfd35a0227c333c082d4ce4189a89ea0e266d713007f476caf5759d29d4` applied to guarded test DB, backfill verified at 10,000 search docs and 100 play counts/users; SHA-256 `home.ts` `09013ba388d982e3eebfbdf61ea53694c86af0d299ddccfe0d4937eb8ad182be`, `search-index.ts` `4de13b39969a3ed4f0895e75af55bd9a1a6d8f7a2ace3b80a2bd72f97d095806`. Both had the same cards route SHA-256 `2ac689db8553bca0f4dbe22028ef2373a7e02fe733c8832843610638fb68b0ad` and visual component SHA-256 `77a21307a4ccf8ce1b500b079ca356bcd0b8ee1e7291c6ee86187f830a8ad0e3`.

An earlier candidate run used a different migration revision and is **preliminary**: `/tmp/miro-perf-candidate-10k-100.json`. The earlier 10k/100 baseline before world-state/message seeding (`/tmp/miro-perf-baseline-10k-100.json`) is also **not comparable** to the verified pair. Do not substitute either for the table above.

| Additional combination | Status |
| --- | --- |
| 10k/500 and 10k/1000 | Not run; the only 500-user run used 100k characters |
| 100k/100 | Candidate-only before/after-index HTTP runs below; no matched baseline or 30-sample browser verdict |
| 100k/500 | Candidate-only after-index HTTP run below; no matched baseline or 30-sample browser verdict |
| 100k/1000 | Not run; fixture briefly seeded to 1000 users, but no HTTP stage due swap/disk headroom risk and explicit stop |
| 1m/100, 1m/500, 1m/1000 | Not run; only about 4.1 GiB free after 100k/index with a 2 GiB hard stop; no demonstrated higher-stage capacity |

### 100k/100 staged ramp

After the full regression completed, a new guarded run grew from 10k to 100k characters in 5k chunks in 18.6 seconds. `miro_perf_test` then had 100,000 characters, 100,000 indexed search docs, 100,000 backfill-state rows, 100 authenticated users and play sessions, and 100 world states/relationships/messages. DB size was 142 MB; filesystem free space fell from about 4.6 to 4.2 GiB, above the 2 GiB stop. No monolithic migration was run above 10k rows. The same frozen candidate build ran with `MIRO_FEATURE_INDEXED_DISCOVERY=1` on port 3100.

The **pre-index candidate-only** 100k/100 HTTP stage completed 2,802/2,802 requests at 90.5 offered/completed RPS, p50/p95/p99 **987.2/1,353.9/1,468.4 ms**, peak inflight 100, zero non-2xx errors/429s/timeouts/unexpected empty arrays, and 261 expected empty nonexistent-term searches. It did not hit the script's 3-second p95/5% failure stop. Nonetheless, relative to the candidate 10k/100 run, throughput fell about 85% and p95 grew 9.5×. That is a scalability warning, **not a 100k capacity pass**. The popular first-request probe was 6.4 ms for six cards with only 100 play sessions, not a high-cardinality stress test.

Server-span diagnostics read from `/tmp/miro-perf-100k-http.log` **before the later resource probe** (completed HTTP stage plus fingerprint/warmup, no browser run) showed p50 `auth.session_db` about 373 ms, home data about 870 ms, matching-search data about 691 ms, and popular data about 715 ms under concurrency. The file later gained partial resource-probe traffic and must not be re-aggregated as one stage. These spans include pool acquisition and do not by themselves identify the bottleneck. Standalone local `EXPLAIN (ANALYZE, BUFFERS)` showed home scanning 100,000 characters and top-N sorting in 60.1 ms/2,782 shared buffer hits; Miro using its type index but scanning/sorting 50,000 rows in 19.6 ms/2,567 hits; matching search scanning/sorting 50,000 characters then probing the search-doc key index in 20.4 ms/2,900 hits; nonexistent-term search using `character_search_docs_trgm_idx` in 0.28 ms/93 hits; and popular rank using `character_play_counts_rank_idx` in 0.025 ms/27 hits. The auth lookup itself took 0.19 ms/5 hits at rest, versus about 373 ms p50 for the app's under-load `auth.session_db` span. That gap is consistent with queueing or DB contention, **not proof of which**; postgres.js exposes no supported acquisition-wait metric here.

A short resource probe was interrupted and is **not a completed performance stage**. Its samples in `/tmp/miro-perf-100k-resource.txt` showed app CPU about 15–30% of one core, app RSS roughly 164–235 MB, 10–16 active test-DB connections, and up to nine active sessions with a wait event. The load-generator CPU and DB host CPU/IO were not captured, so the resource bottleneck remains unproven. Raw completed pre-index 30-second result: `/tmp/miro-perf-candidate-100k-100.json`; seed record: `/tmp/miro-perf-ramp-seed100k.json`.

### 100k/100 local index retest

Only the guarded `miro_perf_test` database received `packages/db/migrations/online/04_public_feed_order.sql` (SHA-256 `700246eb92edd07c690e77243a6698aa18b7d62dfa6af286238c6be4d6ff16b5`) via nontransactional `psql`, followed by `ANALYZE public.characters`. The new partial `characters_visible_recent_idx` was verified valid and ready, occupying 3,992 kB. The DB held 100,000 characters, search docs, and backfill-state rows, 100 play-count rows, and was 146 MB after the index; free disk was about 4.1 GiB. The run ID and 100 authenticated fixture users were unchanged. The already-running port-3100 build was **not rebuilt**: it retained `MIRO_FEATURE_INDEXED_DISCOVERY=1`, frozen `home.ts` SHA-256 `09013ba388d982e3eebfbdf61ea53694c86af0d299ddccfe0d4937eb8ad182be`, `search-index.ts` SHA-256 `4de13b39969a3ed4f0895e75af55bd9a1a6d8f7a2ace3b80a2bd72f97d095806`, and applied indexed-discovery migration SHA-256 `4bd34dfd35a0227c333c082d4ce4189a89ea0e266d713007f476caf5759d29d4`. This isolates the added index and `ANALYZE` on this local fixture, not arbitrary source changes or production behavior.

Standalone `EXPLAIN (ANALYZE, BUFFERS)` after the index used `characters_visible_recent_idx` for home (**0.724 ms execution, 71 shared hits**, versus 60.1 ms/2,782 hits before), Miro (**0.635 ms, 78 hits**, versus 19.6 ms/2,567), and matching search (**1.003 ms, 136 hits**, versus 20.4 ms/2,900). The first home and matching-search plans had about 99 and 94 ms **planning** time respectively, so these isolated execution figures are not end-to-end HTTP latency. Nonexistent-term search still used `character_search_docs_trgm_idx` (24.0 ms/96 hits in this single after sample versus 0.28 ms/93 before); popular still used `character_play_counts_rank_idx` (0.210 ms/27 hits versus 0.025 ms/27). Single EXPLAIN samples do not establish a p95 or explain every under-load wait. Plans: `/tmp/miro-perf-100k-index-explain.txt`.

With the same 100 users, 100 ms think time, 5-second warmup, and 30-second requested measurement, the **post-index candidate-only** HTTP stage completed **21,426/21,426 offered/completed** requests in 30.155 measured seconds, **710.53/710.53 offered/completed RPS**, p50/p95/p99 **30.30/99.87/235.32 ms**, and peak inflight 100. Non-2xx errors, 429s, timeouts, and unexpected empty arrays were all zero; nonexistent-term search had 1,959 expected empty results. Route p95: home 85.27, Miro 112.00, matching search 107.04, nonexistent-term search 104.27, popular 67.99 ms. The one-time popular first request was 21.43 ms for six cards (n=1). No early stop occurred. Compared only with the same frozen candidate before the index, RPS increased 7.85× and aggregate p95 fell 13.56×. This is **one local matched retest**, not a production capacity guarantee or proof of 100k/1000 or 1m performance. There is no matched baseline source at 100k or 30-sample browser verdict. Raw result: `/tmp/miro-perf-candidate-100k-100-after-index.json`; its server-span window was separately byte-scoped in `/tmp/miro-perf-100k-after-index-spans.log`, not combined with earlier load/browser logs.

The 100k fixture (run ID `c19bb018-ff5b-4a27-b9c4-0eaf1ee896ac`) and port-3100 server were **intentionally retained** for coordinated follow-up. Port 3000 was untouched. The later 500-user stage is recorded below.

An isolated post-index **home→create, warmNoPrefetch** Playwright check on that same 100k fixture and frozen candidate returned 30/30 successful samples, no fallback marks, no errors or early stop, p50/p95/p99 **63.5/347.2/348.1 ms**, with 279 prefetch requests blocked. Most samples were about 47–81 ms; two were 347.2 and 348.1 ms. The earlier 10k candidate's same-route/mode p95 was 349.3 ms, so the roughly 350 ms tail recurred; the fixture cardinality differs and this is **not** a matched baseline comparison or proof that `create/loading.tsx` causes it. Raw result: `/tmp/miro-perf-candidate-100k-create-warm-30.json`.

### 100k/500 local staged run

The same guarded fixture grew **only** from 100 to 500 users, auth tokens, play sessions, world states, relationships, and messages; characters, search docs, and backfill-state rows remained at 100,000. The seed record is `/tmp/miro-perf-ramp-seed100k-500.json`. The test DB was 147 MB afterward, and `characters_visible_recent_idx` remained valid and ready. The port-3100 frozen candidate source, `MIRO_FEATURE_INDEXED_DISCOVERY=1`, and indexed schema fingerprints above were unchanged. There was no concurrent browser run or build.

The 5-second warmup and 30-second requested measurement yielded **35,887/35,887 offered/completed** requests over 30.199 measured seconds, **1,188.35/1,188.35 offered/completed RPS**, p50/p95/p99 **303.28/444.46/494.24 ms**, peak client inflight 500, zero non-2xx errors/429s/timeouts/unexpected empty arrays, and 3,255 expected empty nonexistent-term searches. Route p95: home 326.13, Miro 464.89, matching search 466.94, nonexistent-term search 329.50, popular 327.73 ms. The one-time popular first-request probe was 12.14 ms for six cards (n=1); 500 play sessions remain an insufficient high-cardinality popular stress test. The harness did not stop early. Raw result: `/tmp/miro-perf-candidate-100k-500-after-index.json`.

Before→after this run, free disk was 4,313,436→4,299,296 KiB; test-DB connections were 11→11; macOS system-wide memory free was 42%→32%. These endpoint samples do **not** capture peak DB connections, CPU, or memory pressure. The harness checked disk below 2 GiB, DB connections above 80, p95 above 3 seconds, and non-success above 5% during the run; none triggered. Compared with 100k/100 after-index, throughput was higher but p95 was 4.45×, reflecting the increased closed-loop concurrency—not a 1000-user extrapolation. The 100k/500 fixture and server were preserved for subsequent validation, then cleaned up as recorded below. The 100k/1000 and every 1m combination were not run.

Before considering 100k/1000, one preflight found 4,295,420 KiB free disk and 11 test-DB connections, but macOS swap was **8,763.19/9,216 MiB used (452.81 MiB free)**, with 34% system-wide memory free. After the isolated rebuild, a later five-second idle sample found 3,216,280 KiB free disk, 6 test-DB connections, 39% memory free, and swap 8,898.44/10,240 MiB used (1,341.56 MiB free), with no increase in swapouts. The fixture was briefly grown from 500 to 1000 users/sessions/world states/relationships/messages under the DB guard; seed record: `/tmp/miro-perf-ramp-seed100k-1000.json`. **No 1000-user HTTP stage was started**, following the explicit stop due to cumulative swap use and only about 3.1 GiB free disk with a 2 GiB hard stop. These are point-in-time resource readings, not a measured 1000-user failure.

With no concurrent load or build after the 500-user stage, a second targeted home→create warmNoPrefetch Playwright run on the same frozen server and now-500-user fixture produced 30/30 successful samples, p50/p95/p99 **63.4/67.6/116.6 ms**, no fallback marks/errors/early stop, and 279 blocked prefetch requests. Raw result: `/tmp/miro-perf-candidate-100k-500-create-warm-30.json`. The earlier roughly 350 ms tail did **not** recur in this run; its appearance is intermittent.

After `apps/web/app/(main)/create/loading.tsx` was removed in the main checkout, the isolated copy was refreshed from the then-current source and rebuilt **without touching main `.next`**. Its root `.env` and `.env.local` were removed; build/start set both DB URLs to guarded localhost `miro_perf_test`, `MIRO_FEATURE_INDEXED_DISCOVERY=1`, and `PERF_SAMPLE_RATE=1`. Next build ID was `5BlzjHiBxN1QGSm_6bLph`; `home.ts` and `search-index.ts` hashes remained `09013ba388d982e3eebfbdf61ea53694c86af0d299ddccfe0d4937eb8ad182be` and `4de13b39969a3ed4f0895e75af55bd9a1a6d8f7a2ace3b80a2bd72f97d095806`, respectively. The refreshed create `page.tsx` and `character-form.tsx` hashes were `77d7fb43f28ccb04c5ff915172d00e8f2567fed9be56903b8113526761a321aa` and `8ac7354fe1663ed797691a89283618e4afd2064a89e1049a8e144271ba3ee2b5`. The create loading file was absent. No DB fixture, index, or port-3000 server was changed.

Two sequential no-load **home→create, warmNoPrefetch** runs on the rebuilt port-3100 server each completed 30/30 samples without fallback/error/early stop and with 279 blocked prefetch requests. Run 1 p50/p95/p99 was **48.2/67.9/100.6 ms**; run 2 was **47.5/63.8/78.2 ms**. Neither had a 350 ms outlier. Raw JSON: `/tmp/miro-perf-no-create-loading-create-warm-30-run1.json` and `/tmp/miro-perf-no-create-loading-create-warm-30-run2.json`. This is consistent with improvement but **does not establish causality**: the prior build also had one n30 run without the tail, so the regression was intermittent. After the rebuild, free disk was 3,219,248 KiB; swap was 9,058.50/10,240 MiB used (the system grew swap). The 100k/1000 HTTP stage remained not run. The fixture and port-3100 server remained intact until coordinated cleanup.

### Final cleanup

After the explicit stop, `TEST_DATABASE_URL=postgres://localhost/miro_perf_test` passed `tooling/test-database.ts` plus an exact localhost/database-name check. `node tooling/perf-load.mjs cleanup --run-id=c19bb018-ff5b-4a27-b9c4-0eaf1ee896ac` removed exactly that run's 100,000 characters, 100 worlds, and 1,000 users/auth sessions/play sessions/world states/relationships/messages; its owner count became zero. A read-only residue check found zero run-prefix users/characters and zero indexed search-doc, backfill-state, and play-count rows. Raw cleanup record: `/tmp/miro-perf-ramp-cleanup.json`. No shared-table truncation, production DB operation, or 1000-user HTTP load occurred.

Only the port-3100 Next server was stopped and its listener verified absent; port 3000 remained listening. The two task-owned isolated build copies (`/tmp/miro-perf-baseline.xHmBKX` and `/tmp/miro-perf-candidate.73oIcg`) were removed after recording their source/build hashes; earlier absolute copy paths in this document are historical identifiers, not current files. Raw JSON, EXPLAIN, and logs under `/tmp` remain for review. After copy removal, filesystem free space was 6,101,176 KiB. The main checkout's `.next` was never built or removed.

Do not replace “not run” with estimates. Keep the raw JSON, schema version, fixture counts, and any abort reason. Cleanup is mandatory even after a failed run: `node tooling/perf-load.mjs cleanup --run-id=<uuid>`.
