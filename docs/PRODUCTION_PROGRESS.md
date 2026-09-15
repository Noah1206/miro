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
