# Token billing

2026-10-11: every user-initiated chat model uses purchased Miro tokens. A Miro token is a wallet credit, not one provider processing token. Existing grants and purchase records retain their amounts and expiry dates. The existing onboarding grant remains 300 tokens valid for seven days.

Model choices come from enabled, priced dialogue definitions. Backups are not selectable. Each model has standard and long response options, capped by both the application tier and the registered provider output limit. Adult rooms use their separately validated registry for choices, pricing and execution.

`MIRO_TOKEN_PRICING` optionally sets `fxKRWPerUSD` (default 1500), `maxInputTokens` (default 64000) and `turnAllowance` (default 2). The exchange rate is a configurable pricing assumption, not a live FX quote. The permitted provider-cost share is 0.5. Revenue per wallet token is the minimum KRW price/unit among planned packs and the actual configured catalog, so larger bonus packs cannot silently erase the margin.

The input ceiling uses UTF-8 bytes plus structured-output schema bytes and adapter overhead as a conservative processing-token upper bound. It is not displayed as measured input usage. Output caps include reasoning tokens. The quoted maximum reserves a shared cost envelope for dialogue, analyses, retries and provider fallbacks. The model picker shows the maximum reservation, not a promised final charge or a guaranteed number of replies.

Before calling any provider, the server reserves the quoted wallet amount or the available balance, whichever is smaller, and scales its cost envelope down accordingly. A small balance is not automatically rejected merely because it cannot fund the largest possible response. `TurnMeter` synchronously reserves each attempt's maximum cost across concurrent calls. It settles using provider-reported processing tokens and configured model prices. Successful answers with missing usage cannot be billed as measured usage. Unknown usage on failed calls remains a service cost and is not charged to the customer.

The delivered answer and exact, downward-only token settlement commit in one database transaction. Unused reserved tokens return to the original grant/monthly sources. Failed turns refund their reservation. The request gateway replays a completed response without invoking AI or charging again. A zero or insufficient wallet stops before provider invocation.

Memory extraction and summaries execute with the turn's shared envelope, including the agency path. Upcoming-user-event extraction is prepared before settlement and persisted atomically with the source message. Newly delivered turns do not enqueue another unpriced memory extraction after settlement. Optional post-response model-comparison and realization-review calls are not run against the closed customer envelope. Existing background jobs remain service work.

New free-account monthly windows have zero allowance. Active windows keep already-issued provided tokens until their original monthly expiry. Existing paid subscriptions keep their promised monthly allowance; token purchases remain the only new customer-facing checkout. Purchase catalog, transfer confirmation and idempotent token grants continue through the existing payment service.

The old free-chat monthly dollar ceiling does not block wallet-backed turns; their cost envelope replaces it. Global/provider cost limits and request/rate limits remain enforced. A 50% per-token conversion is an operating target, not a guarantee of total business margin: welcome gifts, failed calls, proactive service work, fees and taxes must still be included in cost reporting.

Validation uses only local named test databases. Production balances and payment confirmations are not modified by automated checks.
