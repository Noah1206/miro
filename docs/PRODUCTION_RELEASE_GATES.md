# Miro production release gates

2026-09-15. Implementation and release are separate. The user deferred live AI validation and kept operating budget at zero. No live test, public deployment, real checkout or media activation is approved by a passing mock suite.

## Environments

- Local/CI tests: explicitly named local `*_test` database, mock providers, isolated ports 3200/3300. Never seed the shared user database.
- Staging: separate database, provider credentials and host. Do not reuse user data without a separate approved process.
- Production: no mock entitlements/providers, server-only secrets, measured budgets. New Reality/outbox code requires migration before activation.

## Before enabling Free beta

- [ ] Real browser login → real AI reply → save → reload passes, including failure and retry.
- [ ] Long multi-character conversations pass the agreed memory/correction/relationship rubric.
- [ ] Memory-grounded proactive messages pass live input/output safety and relevance checks.
- [ ] Actual Push delivery verified on supported devices, with opt-out/quiet hours/revisit checks.
- [ ] Daily operating budget and invitation size explicitly set; current budget remains zero.
- [ ] Concurrent load test meets agreed error, latency and cost targets. Targets must be measured and agreed, not assumed.
- [ ] Database backup restored into an isolated environment and record integrity checked.
- [ ] Privacy/deletion/retention behavior matches user-facing documents.
- [ ] Monitoring alerts reach an operator, including provider failure and budget exhaustion.

## Deployment order

1. Back up and record current app revision and migration state.
2. Validate new migrations against a fresh test database and a staging copy using synthetic data.
3. Apply only pending migrations to staging, then validate permissions and app queries.
4. Deploy app to staging and run smoke/critical E2E without production credentials.
5. For production rollout, apply pending additive migration first; do not replay the fresh-database `db:migrate:sql` script against an existing production database.
6. Deploy with unvalidated features disabled. Check health, auth, reads, errors, usage reservations and notification queue.
7. Enable features only after the corresponding gate is passed. No feature is enabled by this document.

## Recovery runbook

- Provider outage/budget exhaustion: stop new generation, retain conversations; do not turn on mock responses as production fallback.
- Interrupted chat: `maintainAI` fails expired pending requests and refunds reserved user usage atomically. Completed requests are not refunded. Provider cost reservations are separate.
- Push outage: persistent jobs retry with bounded attempts. Expired leases recover; stable tags collapse repeated notifications. Device delivery remains at-least-once, not exactly-once.
- Outbox failure: inspect pending/sending/failed counts and attempts via server-authorized DB access. Do not log raw subscriptions, private text or credentials.
- App regression: return to the recorded previous compatible app revision. Keep additive tables; do not delete user data as rollback.
- Suspected access leak: disable affected endpoint/feature, preserve restricted audit metadata, investigate scope before recovery.

## Pro and media gates

Pro requires explicit price, pool size and depth/frequency settings plus real purchase/renewal/cancellation/refund/out-of-order webhook validation. No numeric product decisions are inferred.

Photo, voice message, call, video, Live Scene and Face Cast each require a working provider, permission/safety checks, saved results, bounded costs and failure recovery. A mock adapter or UI does not pass a release gate.

## Evidence for this development pass

See `PRODUCTION_PROGRESS.md` for actual test results and pushed units. Unit/mock E2E success does not establish real AI quality, live payment correctness or production capacity.
