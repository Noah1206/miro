# Character agency evaluation

This harness runs the real compiler, planner, renderer/verifier orchestration and application persistence contracts with explicitly synthetic provider outputs. Database fixtures are isolated users/characters on a guarded local test database. It never loads the production `.env` or sends real notifications.

```sh
TEST_DATABASE_URL=postgres://localhost/miro_test pnpm exec tsx ai/evals/agency/run.ts
TEST_DATABASE_URL=postgres://localhost/miro_test pnpm exec tsx ai/evals/agency/run.ts --long
```

Use Node 24 and apply `packages/db/migrations/20260924013643_character_agency.sql` to that local database first. The report includes per-test results, requested horizon, commit/source hash, mock mode and explicit unmeasured quality fields. Inspect the persisted-horizon test result to confirm the requested horizon ran; an argument alone is not evidence.

The suite covers source-span compilation, conditional personality rules, default-vs-explicit provenance, action capabilities, actor/evidence scope, cancellation, clock bounds, fresh-evidence appraisal, actual `runTurn`, revision pinning, DB compare-and-swap and atomic receipts. Shadow tests compare the unchanged legacy path with one-step proposals; this is not a longitudinal policy comparison.

## Live evaluation gate

`--live` deliberately fails. Before adding a live experiment adapter, implement a persistent **whole-experiment** budget (including moderation, retries, user simulator and judge); do not split the existing single-writer validation cap across workers. Use isolated session branches, commit and reload every turn, record every provider's actual mode/model and count incomplete runs as incomplete. Never put production user messages into fixtures without evaluation consent.

`scenarios.json` contains development scenarios only. A separately frozen, family-grouped held-out set and two independent Korean human reviewers are still required for the release claims in `docs/character-agency-plan.md`. Recorded fixtures and source-string inclusion do not establish character quality. Existing baseline, context-only baseline and agency must use the same model and external events in live comparisons; run ablations independently.
