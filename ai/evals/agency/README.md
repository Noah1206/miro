# Character agency evaluation

This harness runs the real compiler, planner, renderer/verifier orchestration and application persistence contracts with explicitly synthetic provider outputs. Database fixtures are isolated users/characters on a guarded local test database. It never loads the production `.env` or sends real notifications.

```sh
TEST_DATABASE_URL=postgres://localhost/miro_test pnpm exec tsx ai/evals/agency/run.ts
TEST_DATABASE_URL=postgres://localhost/miro_test pnpm exec tsx ai/evals/agency/run.ts --long
```

Use Node 24 and apply `packages/db/migrations/20260924013643_character_agency.sql` to that local database first. The report includes per-test results, requested horizon, commit/source hash, mock mode and explicit unmeasured quality fields. Inspect the persisted-horizon test result to confirm the requested horizon ran; an argument alone is not evidence.

The suite covers source-span compilation, conditional personality rules, default-vs-explicit provenance, action capabilities, actor/evidence scope, cancellation, clock bounds, fresh-evidence appraisal, actual `runTurn`, revision pinning, DB compare-and-swap and atomic receipts. Shadow tests compare the unchanged legacy path with one-step proposals; this is not a longitudinal policy comparison.

## P0 baseline

`baseline.ts` runs the same scripted synthetic session (8 turns, then scheduler ticks after 26 h and 50 h of idle) through the real app entry points twice: current core (flag off) and agency core (`live`, cohort `*`). It reads cost, tokens and per-call latency from the `ai_usage` rows the app writes, times each unit as the user waits for it, and re-executes the current-core failures in `apps/web/lib/agency/baseline-failures.eval.ts`.

```sh
createdb -h localhost miro_agency_test
DATABASE_URL=postgres://localhost/miro_agency_test pnpm db:migrate:sql
DATABASE_URL=postgres://localhost/miro_agency_test pnpm db:seed
TEST_DATABASE_URL=postgres://localhost/miro_agency_test pnpm exec tsx ai/evals/agency/baseline.ts
TEST_DATABASE_URL=postgres://localhost/miro_agency_test pnpm exec tsx ai/evals/agency/baseline.ts --live --limit-usd 1 --out ai/evals/agency/reports/p0-live.json
```

Use a database the unit tests do not share: `apps/web/lib/usage/__tests__/abuse-limits.integration.test.ts` deletes the current day's and month's budget counters, which resets the experiment cap.

- `--arms agency` (or `legacy`) runs one arm; the default runs both.
- Without `--live` every provider is the app mock. That checks wiring and accounting only: mock moderation makes no call and costs are zero.
- `--live` takes only `GEMINI_API_KEY` and `MIRO_MODEL_REGISTRY` from the root `.env`. The cap is the experiment user's monthly AI cost counter plus the day's global cost in that database, so a rerun with the same `--experiment` continues the same budget. A budget denial stops the run and marks it incomplete.
- Feature switches are pinned to production's `/api/health` values of 2026-09-24.
- If the registry has no model for `world_update`, the runner grants it to the dialogue model and records the override. The agency compiler, planner and verifier all use that task.
- Not measured: persona fidelity, human preference, cost per active instance-day (needs real traffic) and production network/DB latency.

## Live evaluation gate

`--live` deliberately fails. Before adding a live experiment adapter, implement a persistent **whole-experiment** budget (including moderation, retries, user simulator and judge); do not split the existing single-writer validation cap across workers. Use isolated session branches, commit and reload every turn, record every provider's actual mode/model and count incomplete runs as incomplete. Never put production user messages into fixtures without evaluation consent.

`scenarios.json` contains development scenarios only. A separately frozen, family-grouped held-out set and two independent Korean human reviewers are still required for the release claims in `docs/character-agency-plan.md`. Recorded fixtures and source-string inclusion do not establish character quality. Existing baseline, context-only baseline and agency must use the same model and external events in live comparisons; run ablations independently.
