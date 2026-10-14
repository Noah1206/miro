-- Reading is an explicit character choice, separate from replying.
ALTER TABLE messenger_inbox
  ADD COLUMN attention_state text NOT NULL DEFAULT 'pending' CHECK (attention_state IN ('pending','deferred','left')),
  ADD COLUMN attention_context_key text,
  ADD COLUMN attention_decision jsonb;
