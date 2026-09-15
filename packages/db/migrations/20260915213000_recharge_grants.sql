-- 충전 원장. 월간 창(usage_windows)과 분리해서 구매 잔액을 따로 보존한다.
-- 월초에 월간 창이 새로 열려도 이 행들은 그대로 남는다.

create table if not exists recharge_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  -- 지급량과 사용량. 남은 양 = amount - consumed - refunded.
  amount integer not null check (amount > 0),
  consumed integer not null default 0 check (consumed >= 0),
  refunded integer not null default 0 check (refunded >= 0),
  -- 유효기간. 정책 미확정이라 null 은 '만료 없음' 으로 둔다.
  expires_at timestamptz,
  -- 지급 출처. 검증된 서버 결제 결과만 여기를 채운다.
  source text not null check (source in ('purchase', 'grant', 'refund_reversal')),
  provider text,
  external_ref text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  -- 사용량이 지급량을 넘지 못한다.
  constraint recharge_grants_within_amount check (consumed + refunded <= amount)
);

-- 같은 결제를 두 번 지급하지 않는다. 결제 건이 없는 수동 지급은 제약을 타지 않는다.
create unique index if not exists recharge_grants_payment_uniq
  on recharge_grants (provider, external_ref)
  where provider is not null and external_ref is not null;

-- 차감 시 오래된/먼저 만료되는 잔액부터 고르기 위한 인덱스.
create index if not exists recharge_grants_user_active_idx
  on recharge_grants (user_id, expires_at, created_at)
  where status = 'active';

-- 예약 한 건이 충전 잔액에서 얼마를 썼는지 기록한다.
-- 월간에서 쓴 양 = amount - from_grants. 복구는 이 값을 보고 각 출처로 되돌린다.
alter table usage_ledger add column if not exists from_grants integer not null default 0;

-- 예약별 충전 잔액 사용 내역. 한 예약이 여러 잔액에 걸칠 수 있다.
create table if not exists recharge_ledger (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references usage_ledger(id) on delete cascade,
  grant_id uuid not null references recharge_grants(id) on delete restrict,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists recharge_ledger_ledger_idx on recharge_ledger (ledger_id);

-- 0013 과 같은 방침: 서버 전용. anon/authenticated 에 권한을 주지 않고 RLS 를 켠다.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on recharge_grants, recharge_ledger from anon, authenticated;
  end if;
end $$;
alter table recharge_grants enable row level security;
alter table recharge_ledger enable row level security;
