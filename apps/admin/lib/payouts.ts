import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db, adminActions, creatorPayouts, openPii, rechargeGrants, rechargeLedger, usageLedger, users } from '@miro/db'

export type PayoutStatus = 'requested' | 'paid' | 'rejected'

/** 창작 보상 출금 신청 목록. 대기 건은 오래된 것부터. 주민등록번호는 여기서만 복호화한다(지급명세서용). */
export async function listPayouts(status: PayoutStatus | 'all' = 'requested') {
  const rows = await db.select({
    id: creatorPayouts.id, userId: creatorPayouts.userId, email: users.email, tokens: creatorPayouts.tokens,
    grossKRW: creatorPayouts.grossKRW, incomeTaxKRW: creatorPayouts.incomeTaxKRW, localTaxKRW: creatorPayouts.localTaxKRW, netKRW: creatorPayouts.netKRW,
    realName: creatorPayouts.realName, rrnSealed: creatorPayouts.rrnSealed, bank: creatorPayouts.bank, accountNumber: creatorPayouts.accountNumber,
    status: creatorPayouts.status, note: creatorPayouts.note, createdAt: creatorPayouts.createdAt, decidedAt: creatorPayouts.decidedAt,
  }).from(creatorPayouts).innerJoin(users, eq(users.id, creatorPayouts.userId))
    .where(status === 'all' ? undefined : eq(creatorPayouts.status, status))
    .orderBy(status === 'requested' ? creatorPayouts.createdAt : desc(creatorPayouts.createdAt)).limit(200)
  return rows.map(({ rrnSealed, ...r }) => {
    let rrn = '(복호화 실패 — MIRO_PII_KEY 확인)'
    try { const v = openPii(rrnSealed); rrn = `${v.slice(0, 6)}-${v.slice(6)}` } catch { /* 키가 없거나 다르면 표시만 실패 */ }
    return { ...r, rrn }
  })
}

/** 송금을 마친 뒤 누른다. */
export async function markPayoutPaid(adminId: string, id: string, note: string): Promise<'paid' | 'stale'> {
  return db.transaction(async tx => {
    const [r] = await tx.update(creatorPayouts).set({ status: 'paid', note, decidedBy: adminId, decidedAt: new Date() })
      .where(and(eq(creatorPayouts.id, id), eq(creatorPayouts.status, 'requested'))).returning({ id: creatorPayouts.id })
    if (!r) return 'stale'
    // 감사 로그에 출금 id 칸이 없어 메모 앞에 붙인다.
    await tx.insert(adminActions).values({ adminId, action: 'payout_paid', previousStatus: 'requested', newStatus: 'paid', note: `출금 ${id} ${note}` })
    return 'paid'
  })
}

/** 반려 — 신청 때 뺀 창작 보상 토큰을 그 잔액 그대로 되돌린다(web guard 의 rollback 과 같은 순서, 출금은 월간 제공량을 안 쓴다). */
export async function rejectPayout(adminId: string, id: string, note: string): Promise<'rejected' | 'stale'> {
  return db.transaction(async tx => {
    const [r] = await tx.update(creatorPayouts).set({ status: 'rejected', note, decidedBy: adminId, decidedAt: new Date() })
      .where(and(eq(creatorPayouts.id, id), eq(creatorPayouts.status, 'requested'))).returning({ ledgerId: creatorPayouts.ledgerId, userId: creatorPayouts.userId })
    if (!r) return 'stale'
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${r.userId}))`)
    await tx.update(usageLedger).set({ status: 'rolled_back' }).where(eq(usageLedger.id, r.ledgerId))
    for (const part of await tx.select().from(rechargeLedger).where(eq(rechargeLedger.ledgerId, r.ledgerId))) {
      await tx.update(rechargeGrants).set({ consumed: sql`greatest(0, ${rechargeGrants.consumed} - ${part.amount})` }).where(eq(rechargeGrants.id, part.grantId))
    }
    await tx.delete(rechargeLedger).where(eq(rechargeLedger.ledgerId, r.ledgerId))
    // 감사 로그에 출금 id 칸이 없어 메모 앞에 붙인다.
    await tx.insert(adminActions).values({ adminId, action: 'payout_reject', previousStatus: 'requested', newStatus: 'rejected', note: `출금 ${id} ${note}` })
    return 'rejected'
  })
}

/** 'YYYY-MM'(한국 달) → 그 달의 시작·다음 달 시작(UTC 시각). */
export function kstMonthRange(month: string): [Date, Date] {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return [new Date(Date.UTC(y, m - 1, 1) - 9 * 3600_000), new Date(Date.UTC(y, m, 1) - 9 * 3600_000)]
}
export const lastKstMonth = (now = new Date()) => {
  const k = new Date(now.getTime() + 9 * 3600_000)
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
}

/**
 * 그 달(송금 완료 기준)에 지급한 출금을 사람별로 묶는다 — 원천징수이행상황신고서 '사업소득 매월징수(A25)' 칸과 간이지급명세서(거주자의 사업소득)에 그대로 옮겨 적는 숫자.
 * 업종코드 940306 = 1인 미디어 콘텐츠 창작자(인적용역).
 */
export async function monthlyWithholding(month: string) {
  const [from, to] = kstMonthRange(month)
  const rows = await db.select({ userId: creatorPayouts.userId, realName: creatorPayouts.realName, rrnSealed: creatorPayouts.rrnSealed,
    gross: creatorPayouts.grossKRW, incomeTax: creatorPayouts.incomeTaxKRW, localTax: creatorPayouts.localTaxKRW })
    .from(creatorPayouts).where(and(eq(creatorPayouts.status, 'paid'), gte(creatorPayouts.decidedAt, from), lt(creatorPayouts.decidedAt, to)))
  const people = new Map<string, { realName: string; rrn: string; gross: number; incomeTax: number; localTax: number }>()
  for (const r of rows) {
    const p = people.get(r.userId) ?? { realName: r.realName, rrn: (() => { try { return openPii(r.rrnSealed) } catch { return '' } })(), gross: 0, incomeTax: 0, localTax: 0 }
    p.gross += r.gross; p.incomeTax += r.incomeTax; p.localTax += r.localTax
    people.set(r.userId, p)
  }
  const list = [...people.values()]
  const sum = (k: 'gross' | 'incomeTax' | 'localTax') => list.reduce((n, p) => n + p[k], 0)
  return { month, people: list, total: { count: list.length, gross: sum('gross'), incomeTax: sum('incomeTax'), localTax: sum('localTax') } }
}
