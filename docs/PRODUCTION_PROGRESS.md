# Production readiness execution

2026-09-15. Branch: `codex/production-readiness`. Each completed implementation unit is tested, committed and pushed. A pushed unit is not a production launch approval.

## Constraints

- User chose operating budget 0 and deferred live AI validation. Do not enable paid requests or claim live validation.
- Prices, plan limits, proactive frequency and beta size remain undecided.
- No production deployment or new media/Reality feature activation until their gates pass.

## Completed units

- Baseline: prior P0 safety, UI and pricing documentation preserved; 328 isolated unit/integration tests passed. Commit `7d5bccb` pushed.
- Request recovery: failure status and usage refund now share one transaction and lock order. Expiry is rechecked under lock. Generation commits recheck deleted/restricted sessions. Targeted 10 tests and web typecheck passed; previous full suite 332 tests passed before the last two additional session restriction tests.

## Remaining gates

- Live model/browser end-to-end and long conversation quality (deferred by user).
- Stable retry/reload UX and complete interruption/concurrency testing.
- Memory-grounded safe proactive messaging, durable notification delivery and scheduling recovery.
- Reality pool UI and plan-specific depth/frequency after numeric policy decisions.
- Staging load, recovery, security and backup restore verification.
- Real subscription lifecycle validation; then beta and Pro release.
- Image, voice, video and Live/Face Cast provider implementation and independent release validation.

- Grounded Reality: visible owned recent text and memories now enter proactive generation with explicit time and untrusted-data instructions. Input/output safety checks added. Session deletion/restriction/new interaction during generation stops persistence. Account and notification settings rechecked before Push. 339 isolated tests and web typecheck passed. Production activation and real model quality remain deferred.

- Chat draft/retry and usage presentation: drafts survive tab reload and network failure; uncertain retries preserve request identity. Successful sends clear the draft. Monthly Reality usage wording replaces AI usage; unavailable media and production checkout are no longer advertised as available. Production builds passed; 7 mock browser E2E tests passed, including a deliberately aborted request and successful retry.

- Durable Push outbox: contact persistence atomically enqueues per-subscription jobs. Leased workers retry transient failure up to five attempts, recover abandoned leases, cancel deleted/disabled/opened/expired contacts, and stop expired endpoints. Push timeout is bounded. Delivery is at-least-once; stable notification tags collapse repeats, not a guarantee of exactly-once device delivery. Local-only migration `20260915100230_reality_notification_outbox.sql` applied; no shared DB migration performed. 345 isolated tests and both production builds passed. RLS/client-grant denial checked.

- Migration/recovery tooling: SQL migration runner now stops on the first error and applies each file transactionally. All migrations applied successfully to a fresh local `miro_release_test` database. A full local dump/restore into `miro_restore_test` preserved a synthetic user record. This is a local rehearsal, not verification of a managed production backup. CI creates non-login Supabase-style API roles before migrations so permission tests run on plain Postgres.
