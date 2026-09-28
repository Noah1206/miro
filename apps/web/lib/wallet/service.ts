import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { bankTransferOrders, db, rechargeGrants, usageLedger } from '@miro/db'
import { bankAccount, rechargeCatalog } from '@miro/config'
import { usageStatus } from '@/lib/usage/guard'
import { observe } from '@/lib/observe'
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
        case ${usageLedger.kind} when 'textRP' then 'ECHO 대화' when 'voiceCallPerMinute' then '음성통화'
          when 'videoCallPerMinute' then '영상통화' when 'photo' then '사진 생성'
          when 'liveScene' then '라이브 장면' else '추가 인터랙션' end as label,
        case when ${usageLedger.status} = 'rolled_back' or ${usageLedger.continuity} then 0 else -${usageLedger.amount} end as amount,
        case when ${usageLedger.continuity} then '대화 이어가기 제공량'
          else '충전 잔액 ' || ${usageLedger.fromGrants}::text || ' · 월간 제공량 ' || (${usageLedger.amount} - ${usageLedger.fromGrants})::text end as detail,
        case ${usageLedger.status} when 'committed' then '사용 완료' when 'reserved' then '사용 중' else '차감 취소' end as status
      from ${usageLedger} where ${usageLedger.userId} = ${userId}
      union all
      select 'grant:' || ${rechargeGrants.id}::text, ${rechargeGrants.createdAt},
        case ${rechargeGrants.source} when 'purchase' then '크레딧 충전' else '크레딧 지급' end,
        ${rechargeGrants.amount} - ${rechargeGrants.refunded},
        case when ${rechargeGrants.refunded} > 0 then '회수 ' || ${rechargeGrants.refunded}::text
          when ${rechargeGrants.expiresAt} is not null then to_char(${rechargeGrants.expiresAt} at time zone 'Asia/Seoul', 'YYYY.MM.DD') || '까지'
          else '월초에 초기화되지 않아요' end,
        case when ${rechargeGrants.status} = 'revoked' then '환불됨'
          when ${rechargeGrants.expiresAt} <= now() then '기한 지남' else '지급 완료' end
      from ${rechargeGrants} where ${rechargeGrants.userId} = ${userId}
      union all
      select 'order:' || ${bankTransferOrders.id}::text, ${bankTransferOrders.createdAt},
        case ${bankTransferOrders.kind} when 'pass' then 'Pro 1개월 이용권' else '크레딧 충전 주문' end,
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
  const [usage, history, orders] = await Promise.all([
    usageStatus(userId), walletHistory(userId, undefined, 5),
    db.select().from(bankTransferOrders).where(and(eq(bankTransferOrders.userId, userId), orderId
      ? eq(bankTransferOrders.id, orderId)
      : or(eq(bankTransferOrders.status, 'awaiting'), and(eq(bankTransferOrders.status, 'approved'), isNull(bankTransferOrders.settledAt)))))
      .orderBy(desc(bankTransferOrders.createdAt)).limit(1),
  ])
  let account: WalletSnapshot['account'] = null
  let products: WalletSnapshot['products'] = []
  try {
    account = bankAccount()
    // The configured domestic bank accepts KRW only. Never relabel another currency as won.
    if (account) products = rechargeCatalog().products.filter(p => p.currency === 'KRW')
  } catch { observe('wallet.catalog_unavailable', {}) }
  const o = orders[0]
  const order: WalletOrder | null = o ? {
    id: o.id, kind: o.kind, status: o.status === 'awaiting' && o.expiresAt <= new Date() ? 'expired' : o.status,
    amountMinor: o.amountMinor, currency: o.currency, units: o.units,
    depositName: o.depositorName === o.referenceCode ? o.referenceCode : `${o.depositorName} ${o.referenceCode}`,
    expiresAt: o.expiresAt.toISOString(), settledAt: o.settledAt?.toISOString() ?? null,
  } : null
  return { rechargeRemaining: usage.rechargeRemaining, monthlyRemaining: usage.remaining,
    available: usage.remaining + usage.rechargeRemaining, resetsAt: usage.resetsAt?.toISOString() ?? null,
    plan: usage.plan, account, products, order, history }
}
