# Resumable live character conversation evaluation

This runner is separate from `relationship-experience.eval.ts` and never reuses a production/demo account. It invokes the actual `createRoleplaySession`, `runConversationTurn`, deferred memory work and `loadSession` paths against a dedicated guarded **local** test database, using the supplied production model registry and credentials. It does not measure production web/network latency, real push delivery, or human emotional response.

Use Node 24. First prepare an empty, schema-current local test DB and a private JSON array of three published canon rows (`character`, `world`, optional `profile`, database column names). Never export production user messages into it. Supply credentials privately through `--env-json <JSON object>` or `--env-file <dotenv>`. Only provider/model/feature keys are copied into the worker; production database URLs and push credentials are excluded.

```sh
TEST_DATABASE_URL=postgresql://localhost/miro_longrun_20261016_test \
  pnpm exec tsx ai/evals/agency/longitudinal.ts --live \
  --env-json /private/path/execution-env.json --canon /private/path/canon.json \
  --out /private/path/results --limit-usd 20 --limit-requests 5000 \
  --turns 125 --chunk-turns 6 \
  --characters official-cha-dogyeom,official-gu-manseok,official-seo-ian
```

Repeat exactly the same command to continue. `--chunk-turns` counts successful turns across all characters, not per character; characters rotate sequentially. A chunk finishing is **not** evidence that the experiment is complete. `report.json.complete` requires every character to reach the target and its checkpoint reviews to be recorded. Choose a larger chunk to stay in one process. The script preserves private local fixtures for later audit and resume.

If a code fix requires a fresh experiment, use a new output directory and `--carry-budget <previous output>/budget.json`. This carries every prior attempt and unresolved cost reservation into the same total limit. The original ledger must remain unchanged, and the same argument is required on every resume. Keep the earlier transcripts as evidence; a new version starts its own successful-turn count.

Before each real inference the shared experiment ledger reserves a conservative cost and request slot. Compiler, internal retries/fallback, app dialogue, planner, verifier, memory work, model-driven user simulator and checkpoint judge all share this one durable ledger. Actual usage settles the reservation; missing/timeout usage conservatively retains it. App production counters remain active underneath. The immutable manifest rejects budget/model/canon/probe changes on resume; a single-writer lock prevents split budgets. Never delete the ledger/state or reset DB counters to continue after a cap.

For an app request confirmed terminal `failed`, an operator may deliberately resume once using `--retry-failed`; that reuses the same pending user text with a fresh request ID, records the old ID, and consumes the same experiment budget. `pending` is never replaced. `completed` is replayed with the original ID. Provider outage and budget admission stop the chunk; neither becomes a successful turn or a quality failure. Compilation retry uses its existing application lease/backoff, without editing those values.

User input combines distinct adult synthetic personas, fixed early memory/preference/cancellation facts, a response-aware **actual-model** user simulator, and immutable probes at turns 30, 60, 100, 120 and 125. Late probes do not repeat expected answers. The simulator receives only recent dialogue and a broad interaction goal; the fixed fact key is reserved for post-response judging. The judge is another real charged model call, **not independent human validation**; quoted evidence is checked against actual saved character text. Report uncertain judgments honestly and review full transcripts before claims of stable personality or relationship quality.

Evidence lives in the private output directory:

- `manifest.json`, `frozen-plan.json`: immutable model/canon/probe configuration.
- `budget.json`, `usage.json`: all attempted providers, costs and reservations including failures.
- `state.json`, `events.ndjson`, `report.json`: resumable progress, blockers and actual provider/task summaries.
- Per character: `before.json`, `latest.json`, each `turn-NNN.json`, `attempts.ndjson`, checkpoint and judgment JSONs. Each successful turn contains committed/reloaded state, memories and the original transcript.

Mock compiler/dialogue output is never counted. Generated relationship scores are evidence to inspect, not proof of human attachment. Local synthetic credit grants fund the test only; they do not modify provider prices, per-turn production budgets, character relationship values, real accounts or the separate 24-hour production demo.
