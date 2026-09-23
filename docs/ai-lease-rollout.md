# AI provider lease rollout

`MIRO_AI_DB_LEASES` is off by default. With it unset or `0`, production retains the existing budget, request-rate, timeout, and per-process provider limits. This mode does **not** impose a cross-instance provider cap. Mock providers remain disallowed in production.

To enable cross-instance admission, first apply `packages/db/migrations/20260923174000_ai_provider_leases.sql`, verify `ai_provider_leases` and its expiry index, then deploy with `MIRO_AI_DB_LEASES=1`. With the flag on, a missing or unavailable lease database rejects the AI call before the provider is invoked; do not enable it until the migration is confirmed. Watch provider errors, lease admission failures, DB connection pressure, chat latency, and background-job duration. Roll back the flag to `0` if DB lease admission becomes a bottleneck; this restores the prior per-process behavior, not a global cap.

The five-minute maximum hold prevents a permanently hung provider promise from occupying a lease forever. If a provider ignores abort and remains physically active past that hold, another process can be admitted, so this is not an absolute physical-call concurrency guarantee. Use provider-side request termination or an external gateway for a strict cap.

Deploy `/api/cron/reality/maintenance` before applying `packages/db/migrations/20260923180000_reality_workload_isolation.sql`. That migration reschedules AI evaluations and maintenance independently. The combined route remains available to existing callers, but does not provide scheduling isolation when used alone. The cron registration requires configured `ops_cron_config` and `pg_cron`; validate the installed job definitions in the target environment.
