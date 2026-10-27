# Token balance updates

The profile card, character-chat menu, DM menu and recharge sheet share one
`WalletProvider`. They render server ledger snapshots; the browser never adds or
subtracts a quoted cost locally.

## Delivery

- Local action success/failure refreshes the authoritative snapshot, including
  release of a failed reservation.
- Database triggers on recharge grants, usage windows, subscriptions and bank
  orders publish `wallet_changed` through Supabase Broadcast. The message contains
  only `{ "changed": true }`. The write to `realtime.messages` belongs to the
  original transaction: a rollback publishes nothing.
- The authenticated client reads its balance on the signal. Related row changes
  are coalesced for 30 ms. There is no wallet polling interval.
- Successful subscription/reconnection, page navigation, browser back, online,
  focus and visibility restoration also refresh the snapshot to cover missed
  messages. Same-account browser tabs also exchange invalidation markers.
- Server read identity/time reject older cached route snapshots. A failed read
  retains the last known balance rather than showing a false zero.

An approved bank order is not a completed credit. The existing settlement process
still owns issuance. When issuance commits, its grant/order changes signal the UI.

## Channel isolation

Miro authenticates with its own HTTP-only cookie, not a Supabase Auth JWT.
`openWalletChannel` therefore requires the current Miro session and resolves only
that account's random channel capability. It accepts no account or topic input.

Capabilities contain two random UUIDs and live in `miro_private.wallet_topics`.
The schema/table have no PUBLIC, anon or authenticated grants; table RLS is enabled
with no client policies. No PostgREST access is granted. Only the server database
role reads the capability. Trigger functions are invoker functions, have an empty
search path and are not executable by PUBLIC.

The notification transport is a **public Broadcast channel with an unguessable
topic**, not an authenticated Supabase private channel. Anyone who obtains its
topic could receive or forge invalidations, but cannot read or change a wallet:
every snapshot/debit still checks the Miro session on the server. Never include
balance, user ID, order data, bank details or ledger rows in a broadcast. Never use
the transport to authorize spending. A server service/secret key is never returned
to the client; only a validated publishable/legacy anon key is returned.

Plain local Postgres uses `pg_notify` instead of `realtime.send` so transaction
delivery can be checked without a Supabase instance. This is a local verification
hook, not a browser SSE endpoint. A locally unconfigured Supabase connection still
supports direct action/navigation refresh, but cannot receive remote broadcasts.

## Operations

Apply `20261027075454_wallet_realtime_invalidation.sql` before deploying the client.
It creates no object inside Supabase's managed `realtime` schema. Notification
delivery failure must not reject a financial transaction. Reconnect/focus refresh
repairs display after interruption; real-time delivery requires network access.

Verify local commit/debit/refund signals and absence of a rollback signal. In
production, subscribe first, send a harmless invalidation on the current account's
channel, and check all three display timestamps advance. An idle connection should
not advance timestamps every five seconds. Do not change real balances or process
a payment just to verify delivery.

References:

- [Supabase database Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Managed Realtime schema restrictions](https://supabase.com/changelog/realtime-schema-locked-down-against-modification)
