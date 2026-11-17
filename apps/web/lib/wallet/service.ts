import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { bankTransferOrders, db, rechargeGrants, usageLedger, users } from '@miro/db'
import { bankAccount, firstPurchasePrice, rechargeCatalog } from '@miro/config'
import { earningsBalance, usageStatus } from '@/lib/usage/guard'
import { observe } from '@/lib/observe'
import { isMinor } from '@/lib/payments/minor'
import { purchasedProductIds } from '@/lib/payments/first-purchase'
import { cardPaymentConfig } from '@/lib/payments/portone-card'
import type { WalletEntry, WalletHistory, WalletOrder, WalletSnapshot } from './types'

/** Every branch filters the owner. The cursor keeps Postgres microseconds, including ties. */
export async function walletHistory(userId: string, cursor?: string, limit = 20): Promise<WalletHistory> {
  let after: { at: string; id: string } | undefined
  if (cursor) {
    try {
      after = JSON.parse(Buffer.from(cursor, 'base64url').toString())
      if (!after || typeof after.id !== 'string' || !/^(usage|grant|order):[a-f0-9-]{36}$/.test(after.id)
        || typeof after.at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(after.at)
        || !Number.isFinite(Date.parse(after.at))) throw new Error()
    } catch { throw new Error('INVALID_CURSOR') }
  }
  const size = Math.max(1, Math.min(20, limit))
  const rows = await db.execute<WalletEntry>(sql`
    with entries as (
      select 'usage:' || ${usageLedger.id}::text as id, ${usageLedger.createdAt} as at,
        case ${usageLedger.kind} when 'textRP' then '모델 대화' when 'voiceCallPerMinute' then '음성통화'
          when 'videoCallPerMinute' then '영상통화' when 'photo' then '사진 생성'
          when 'liveScene' then '라이브 장면' when 'cheer' then '응원 보냄' when 'payout' then '출금 신청' else '추가 인터랙션' end as label,
        case when ${usageLedger.status} = 'rolled_back' or ${usageLedger.continuity} then 0 else -${usageLedger.amount} end as amount,
        case when ${usageLedger.continuity} then '대화 이어가기 제공량'
          else coalesce((select a.model || ' · ' from ai_usage a where 'turn:' || a.request_id::text = ${usageLedger.idempotencyKey} and a.task = 'dialogue' and a.ok = true order by a.created_at desc limit 1), '') || '충전 토큰 ' || ${usageLedger.fromGrants}::text || ' · 제공 토큰 ' || (${usageLedger.amount} - ${usageLedger.fromGrants})::text end as detail,
        case ${usageLedger.status} when 'committed' then '사용 완료' when 'reserved' then '사용 중' else '차감 취소' end as status
      -- 수익 지갑에서 빠진 것(옮기기·출금)은 일반 지갑 내역이 아니다 — 옮기기는 받은 쪽(+)으로 보인다.
      from ${usageLedger} where ${usageLedger.userId} = ${userId} and ${usageLedger.kind} not in ('payout', 'earnings_transfer')
      union all
      select 'grant:' || ${rechargeGrants.id}::text, ${rechargeGrants.createdAt},
        case when ${rechargeGrants.source} = 'purchase' then '토큰 충전' when ${rechargeGrants.provider} = 'welcome' then '가입 선물' when ${rechargeGrants.provider} = 'coupon' then '쿠폰' when ${rechargeGrants.provider} = 'referral' then '추천 가입 선물' when ${rechargeGrants.provider} = 'referral_bonus' then '친구 추천 보상' when ${rechargeGrants.provider} = 'creator_reward_free' then '창작 보상' when ${rechargeGrants.provider} = 'voice_reward_free' then '목소리 보상' when ${rechargeGrants.provider} = 'earnings_transfer' then '수익에서 옮김' else '토큰 지급' end,
        ${rechargeGrants.amount} - ${rechargeGrants.refunded},
        case when ${rechargeGrants.refunded} > 0 then '회수 ' || ${rechargeGrants.refunded}::text
          when ${rechargeGrants.expiresAt} is not null then to_char(${rechargeGrants.expiresAt} at time zone 'Asia/Seoul', 'YYYY.MM.DD') || '까지'
          else '월초에 초기화되지 않아요' end,
        case when ${rechargeGrants.status} = 'revoked' then '환불됨'
          when ${rechargeGrants.expiresAt} <= now() then '기한 지남' else '지급 완료' end
      from ${rechargeGrants} where ${rechargeGrants.userId} = ${userId} and ${rechargeGrants.provider} is distinct from 'creator_reward' and ${rechargeGrants.provider} is distinct from 'creator_cheer' and ${rechargeGrants.provider} is distinct from 'voice_reward'
      union all
      select 'order:' || ${bankTransferOrders.id}::text, ${bankTransferOrders.createdAt},
        case ${bankTransferOrders.kind} when 'pass' then 'Pro 1개월 이용권' else '토큰 충전 주문' end,
        null::integer,
        -- 원화는 '9,900원' 으로. 다른 통화는 그대로 표기한다(운영 계좌는 원화만 받는다).
        case when ${bankTransferOrders.currency} = 'KRW' then to_char(${bankTransferOrders.amountMinor}, 'FM999,999,999') || '원'
          else ${bankTransferOrders.amountMinor}::text || ' ' || ${bankTransferOrders.currency} end,
        case when ${bankTransferOrders.settledAt} is not null then '지급 완료'
          when ${bankTransferOrders.status} = 'approved' then '지급 대기'
          when ${bankTransferOrders.status} = 'rejected' then '취소됨'
          when ${bankTransferOrders.status} = 'expired' or ${bankTransferOrders.expiresAt} <= now() then '기한 지남'
          else '입금 대기' end
      from ${bankTransferOrders} where ${bankTransferOrders.userId} = ${userId}
        and (${bankTransferOrders.kind} = 'pass' or ${bankTransferOrders.settledAt} is null)
    )
    select id, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at, label, amount, detail, status
    from entries ${after ? sql`where (at, id) < (${after.at}::timestamptz, ${after.id}::text)` : sql``}
    order by entries.at desc, id desc limit ${size + 1}
  `)
  const entries = [...rows].slice(0, size)
  const last = entries.at(-1)
  return { entries, cursor: rows.length > size && last ? Buffer.from(JSON.stringify({ at: last.at, id: last.id })).toString('base64url') : null }
}

export async function walletSnapshot(userId: string, orderId?: string): Promise<WalletSnapshot> {
  const observedAt = Date.now()
  const [usage, history, orders, earnings, minor] = await Promise.all([
    usageStatus(userId), walletHistory(userId, undefined, 5),
    db.select().from(bankTransferOrders).where(and(eq(bankTransferOrders.userId, userId), orderId
      ? eq(bankTransferOrders.id, orderId)
      : or(eq(bankTransferOrders.status, 'awaiting'), and(eq(bankTransferOrders.status, 'approved'), isNull(bankTransferOrders.settledAt)))))
      .orderBy(desc(bankTransferOrders.createdAt)).limit(1),
    earningsBalance(userId),
    isMinor(userId),
  ])
  let account: WalletSnapshot['account'] = null
  let products: WalletSnapshot['products'] = []
  // 11/13 카드 결제(포트원·NHN KCP) — 설정이 다 있을 때만. 브라우저엔 상점 id·채널 키만 간다.
  const cfg = cardPaymentConfig()
  // 결제창은 구매자 이름·연락처·이메일이 필수 — 이름·이메일은 계정 값을 미리 채워 두고, 휴대폰은 결제할 때 입력받는다(우리 서버엔 저장 안 함).
  const [buyer] = cfg ? await db.select({ name: users.displayName, email: users.email }).from(users).where(eq(users.id, userId)).limit(1) : []
  const card = cfg ? { ...cfg, name: buyer?.name ?? '', email: buyer?.email ?? '' } : null
  try {
    account = bankAccount()
    // The configured domestic bank accepts KRW only. Never relabel another currency as won.
    if (account || card) products = rechargeCatalog().products.filter(p => p.currency === 'KRW')
  } catch { observe('wallet.catalog_unavailable', {}) }
  // 11/12 상품마다 첫 구매 할인(정가의 6/7) — 아직 산 적 없는 상품에만 할인가를 붙인다(주문 금액은 두 주문 경로가 같은 기준으로 정한다).
  if (products.length) {
    const bought = await purchasedProductIds(userId)
    products = products.map(p => (bought.has(p.id) ? p : { ...p, firstPriceMinor: firstPurchasePrice(p.priceMinor) }))
  }
  const o = orders[0]
  const order: WalletOrder | null = o ? {
    id: o.id, kind: o.kind, status: o.status === 'awaiting' && o.expiresAt <= new Date() ? 'expired' : o.status,
    amountMinor: o.amountMinor, currency: o.currency, units: o.units,
    depositName: o.depositorName === o.referenceCode ? o.referenceCode : `${o.depositorName} ${o.referenceCode}`,
    expiresAt: o.expiresAt.toISOString(), settledAt: o.settledAt?.toISOString() ?? null,
  } : null
  return { userId, observedAt, rechargeRemaining: usage.rechargeRemaining, monthlyRemaining: usage.remaining,
    available: usage.remaining + usage.rechargeRemaining, resetsAt: usage.resetsAt?.toISOString() ?? null,
    plan: usage.plan, account, card, products, order, history, earnings, minor }
}
