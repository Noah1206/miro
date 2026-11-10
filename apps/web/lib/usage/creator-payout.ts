import { desc, eq, sql } from 'drizzle-orm'
import { creatorPayouts, db, rechargeGrants, sealPii } from '@miro/db'
import { revisionEffective } from '@/lib/legal/revisions'
import { commit, earningsBalance, EARNINGS_PROVIDERS, reserve, UsageExceededError } from './guard'

/**
 * 창작 보상 3단계(11/11) — 받은 토큰을 현금으로 출금 신청. 운영자가 직접 송금한다(관리자 /payouts).
 *
 * 돈 계산(충전 최저가 1토큰 ≈ 6.67원, AI 원가는 그 절반 이하로 차감량을 잡는다 — token-pricing costShare 0.5):
 *  - 대화 1000토큰(유료) → 매출 ≥6,670원, AI ≤3,333원, 크리에이터 100토큰 × 5원 = 500원 → 운영 ≥2,837원
 *  - 응원 1000토큰 → 매출 ≥6,670원, AI 0, 크리에이터 700토큰 × 5원 = 3,500원 → 운영 ≥3,170원
 * 그래서 1토큰 = 5원. 무료 토큰(출석·가입 선물·월간 제공)으로 한 대화의 보상은 앱 안에서만 쓰고 출금은 안 된다 —
 * 유료로 낸 몫의 10% 만 출금 대상(응원은 원래 유료 토큰만).
 */
export const PAYOUT_KRW_PER_TOKEN = 5
export const PAYOUT_MIN_KRW = 30_000
/** 실명·계좌·주민등록번호 수집이 처리방침에 들어가는 날(revisions.ts, 30일 전 공지) — 그 전엔 신청을 받지 않는다. */
export const PAYOUT_OPENS = '2026-12-11'
export const payoutOpen = (now = new Date()) => revisionEffective('privacy', PAYOUT_OPENS, now)

/** 사업소득 원천징수 3.3%(소득세 3% + 지방소득세 0.3%, 10원 미만 버림). 소득세가 1,000원 미만이면 소액부징수로 0. */
export function payoutQuote(tokens: number) {
  const gross = tokens * PAYOUT_KRW_PER_TOKEN
  let income = Math.floor(gross * 0.03 / 10) * 10
  if (income < 1000) income = 0
  const local = Math.floor(income * 0.1 / 10) * 10
  return { gross, incomeTax: income, localTax: local, net: gross - income - local }
}

/** 출금할 수 있는 토큰 = 수익 지갑 잔액(유료 몫 보상·받은 응원만 쌓이고, 옮기기·출금으로만 빠진다). */
export const withdrawableTokens = (userId: string) => earningsBalance(userId)

export class PayoutError extends Error {}

/** 주민등록번호 13자리 형식·검증 숫자 확인(2020.10 이후 발급분은 검증 숫자가 없어 앞 6자리 생년월일·7번째 자리만 본다). */
export function validRrn(rrn: string): boolean {
  if (!/^\d{13}$/.test(rrn)) return false
  const mm = Number(rrn.slice(2, 4)), dd = Number(rrn.slice(4, 6))
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && '123456789'.includes(rrn[6]!)
}

export async function requestPayout(opts: { userId: string; tokens: number; realName: string; rrn: string; bank: string; accountNumber: string; requestId: string }): Promise<void> {
  if (!payoutOpen()) throw new PayoutError('not_open')
  const realName = opts.realName.trim(), bank = opts.bank.trim(), accountNumber = opts.accountNumber.replace(/[\s-]/g, '')
  const rrn = opts.rrn.replace(/\D/g, '')
  if (!Number.isSafeInteger(opts.tokens) || opts.tokens * PAYOUT_KRW_PER_TOKEN < PAYOUT_MIN_KRW) throw new PayoutError('below_minimum')
  if (!realName || realName.length > 40 || !bank || bank.length > 30) throw new PayoutError('invalid_input')
  if (!/^\d{8,20}$/.test(accountNumber)) throw new PayoutError('invalid_account')
  if (!validRrn(rrn)) throw new PayoutError('invalid_rrn')
  if (!/^[0-9a-f-]{36}$/i.test(opts.requestId)) throw new PayoutError('invalid_request')
  const sealed = sealPii(rrn)
  const quote = payoutQuote(opts.tokens)
  await db.transaction(async tx => {
    // 같은 사람의 신청이 겹치면 출금 가능액을 두 번 쓰지 않게 사용자 단위로 잠근다(guard 의 잠금과 같은 키).
    // 수익 잔액보다 많으면 reserve 가 거절한다.
    const reservation = await reserve({ userId: opts.userId, kind: 'payout', tokenAmount: opts.tokens, onlyProviders: EARNINGS_PROVIDERS, idempotencyKey: `payout:${opts.userId}:${opts.requestId}` }, tx)
      .catch(e => { throw e instanceof UsageExceededError ? new PayoutError('over_withdrawable') : e })
    if (reservation.reused) return
    await commit(reservation.reservationId, undefined, tx)
    await tx.insert(creatorPayouts).values({ userId: opts.userId, tokens: opts.tokens, grossKRW: quote.gross, incomeTaxKRW: quote.incomeTax, localTaxKRW: quote.localTax, netKRW: quote.net,
      realName, rrnSealed: sealed, bank, accountNumber, ledgerId: reservation.reservationId })
  })
}

export async function myPayouts(userId: string) {
  return db.select({ id: creatorPayouts.id, tokens: creatorPayouts.tokens, netKRW: creatorPayouts.netKRW, status: creatorPayouts.status, note: creatorPayouts.note, createdAt: creatorPayouts.createdAt })
    .from(creatorPayouts).where(eq(creatorPayouts.userId, userId))
    .orderBy(desc(creatorPayouts.createdAt)).limit(20)
}

export const TRANSFER_PROVIDER = 'earnings_transfer'

/** 수익 → 일반 지갑(단방향). 옮긴 토큰은 대화 등에 쓰이고 다시 수익·출금으로 돌아오지 않는다. 받은 쪽 기록 = (provider, 예약 id) 로 한 번만. */
export async function transferToWallet(opts: { userId: string; amount: number; requestId: string }): Promise<void> {
  if (!Number.isSafeInteger(opts.amount) || opts.amount <= 0) throw new PayoutError('invalid_amount')
  if (!/^[0-9a-f-]{36}$/i.test(opts.requestId)) throw new PayoutError('invalid_request')
  await db.transaction(async tx => {
    const reservation = await reserve({ userId: opts.userId, kind: 'earnings_transfer', tokenAmount: opts.amount, onlyProviders: EARNINGS_PROVIDERS, idempotencyKey: `transfer:${opts.userId}:${opts.requestId}` }, tx)
      .catch(e => { throw e instanceof UsageExceededError ? new PayoutError('over_withdrawable') : e })
    if (reservation.reused) return
    await commit(reservation.reservationId, undefined, tx)
    await tx.insert(rechargeGrants).values({ userId: opts.userId, amount: opts.amount, source: 'grant', provider: TRANSFER_PROVIDER, externalRef: reservation.reservationId }).onConflictDoNothing()
  })
}

/** 수익 지갑 내역 — 들어온 것(창작 보상·받은 응원)과 나간 것(지갑으로 옮김·출금 신청). */
export async function earningsHistory(userId: string): Promise<Array<{ id: string; at: Date; label: string; amount: number }>> {
  const rows = await db.execute<{ id: string; at: string; label: string; amount: number }>(sql`
    select id::text, created_at::text as at, case provider when 'creator_cheer' then '받은 응원' else '창작 보상' end as label, (amount - refunded) as amount
      from ${rechargeGrants} where user_id = ${userId} and status = 'active' and provider in ('creator_reward', 'creator_cheer')
    union all
    select id::text, created_at::text, case kind when 'payout' then '출금 신청' else '지갑으로 옮김' end, -amount
      from usage_ledger where user_id = ${userId} and kind in ('payout', 'earnings_transfer') and status = 'committed'
    order by at desc limit 30`)
  return [...rows].map(r => ({ ...r, at: new Date(r.at) }))
}
