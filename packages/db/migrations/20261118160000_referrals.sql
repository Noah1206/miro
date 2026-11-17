-- 11/18 추천인 코드 — 회원마다 코드 하나, 친구가 넣으면 친구 1,000(바로)·추천인 2,000(친구가 대화 3턴 했을 때). 계정당 한 번 추천받을 수 있다.
CREATE TABLE IF NOT EXISTS referral_codes (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS referrals (
  referee_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_id);
