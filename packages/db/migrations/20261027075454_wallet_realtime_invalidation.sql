SET LOCAL lock_timeout = '5s';

-- Miro uses its own cookie sessions, not Supabase Auth JWTs. Only the signed-in
-- server action can return this unguessable channel capability. No balance,
-- account ID, order, or ledger row is ever broadcast on it.
CREATE SCHEMA IF NOT EXISTS miro_private;
REVOKE ALL ON SCHEMA miro_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS miro_private.wallet_topics (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  topic text NOT NULL UNIQUE DEFAULT ('wallet:' || gen_random_uuid()::text || gen_random_uuid()::text)
);
ALTER TABLE miro_private.wallet_topics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON miro_private.wallet_topics FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA miro_private FROM anon;
    REVOKE ALL ON miro_private.wallet_topics FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA miro_private FROM authenticated;
    REVOKE ALL ON miro_private.wallet_topics FROM authenticated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION miro_private.signal_wallet_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  old_owner uuid;
  new_owner uuid;
  channel text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' THEN old_owner := OLD.user_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_owner := NEW.user_id; END IF;
  FOR channel IN
    SELECT topic FROM miro_private.wallet_topics WHERE user_id IN (old_owner, new_owner)
  LOOP
    BEGIN
      IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
        -- realtime.send writes in this transaction. WAL only publishes after
        -- COMMIT, so a failed/rolled-back debit cannot publish a false result.
        PERFORM realtime.send('{"changed":true}'::jsonb, 'wallet_changed', channel, false);
      ELSE
        -- Plain local Postgres can verify commit/rollback delivery with LISTEN.
        PERFORM pg_catalog.pg_notify('miro_wallet_changed', channel);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- An unavailable notification service must never break payment/debit.
      RAISE WARNING 'Wallet notification unavailable (SQLSTATE %)', SQLSTATE;
    END;
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Wallet notification unavailable (SQLSTATE %)', SQLSTATE;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION miro_private.signal_wallet_change() FROM PUBLIC;

CREATE TRIGGER wallet_changed_after_grant
  AFTER INSERT OR UPDATE OR DELETE ON public.recharge_grants
  FOR EACH ROW EXECUTE FUNCTION miro_private.signal_wallet_change();
CREATE TRIGGER wallet_changed_after_usage
  AFTER INSERT OR UPDATE OR DELETE ON public.usage_windows
  FOR EACH ROW EXECUTE FUNCTION miro_private.signal_wallet_change();
CREATE TRIGGER wallet_changed_after_order
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_transfer_orders
  FOR EACH ROW EXECUTE FUNCTION miro_private.signal_wallet_change();
CREATE TRIGGER wallet_changed_after_subscription
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION miro_private.signal_wallet_change();
