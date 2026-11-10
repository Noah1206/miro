import { desc, eq, sql } from 'drizzle-orm'
import { creatorPayouts, db, rechargeGrants, sealPii } from '@miro/db'
import { commit, reserve, UsageExceededError, type UsageTransaction } from './guard'
import { CHEER_PROVIDER, CREATOR_REWARD_PROVIDER, CREATOR_REWARD_RATE } from './creator-reward'

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
const CREATOR_PROVIDERS = [CREATOR_REWARD_PROVIDER, CHEER_PROVIDER]

/** 사업소득 원천징수 3.3%(소득세 3% + 지방소득세 0.3%, 10원 미만 버림). 소득세가 1,000원 미만이면 소액부징수로 0. */
export function payoutQuote(tokens: number) {
  const gross = tokens * PAYOUT_KRW_PER_TOKEN
  let income = Math.floor(gross * 0.03 / 10) * 10
  if (income < 1000) income = 0
  const tax = income + Math.floor(income * 0.1 / 10) * 10
  return { gross, tax, net: gross - tax }
}

/**
 * 지금 출금할 수 있는 토큰 = min(출금 대상으로 번 토큰 − 이미 신청한 토큰, 지갑에 남은 창작 보상 토큰).
 * ponytail: 매번 전체 기록을 다시 센다 — 크리에이터 기록이 수만 건이 되면 월별 집계 표로 바꾼다.
 */
export async function withdrawableTokens(userId: string, tx: UsageTransaction | typeof db = db): Promise<{ earned: number; requested: number; left: number; withdrawable: number }> {
  const [row] = await tx.execute<{ earned: number; requested: number; left: number }>(sql`select
      (select coalesce(sum(case when g.provider = ${CHEER_PROVIDER} then g.amount
          else least(g.amount, floor(coalesce((select sum(rl.amount) from recharge_ledger rl join recharge_grants pg on pg.id = rl.grant_id and pg.source = 'purchase'
            where rl.ledger_id::text = split_part(g.external_ref, '|', 1)), 0) * ${CREATOR_REWARD_RATE})::int) end), 0)::int
        from ${rechargeGrants} g where g.user_id = ${userId} and g.status = 'active' and g.provider in (${CREATOR_REWARD_PROVIDER}, ${CHEER_PROVIDER})) as earned,
      (select coalesce(sum(tokens), 0)::int from ${creatorPayouts} where user_id = ${userId} and status in ('requested', 'paid')) as requested,
      (select coalesce(sum(amount - consumed - refunded), 0)::int from ${rechargeGrants} where user_id = ${userId} and status = 'active' and provider in (${CREATOR_REWARD_PROVIDER}, ${CHEER_PROVIDER})) as left`)
  const earned = row?.earned ?? 0, requested = row?.requested ?? 0, left = row?.left ?? 0
  return { earned, requested, left, withdrawable: Math.max(0, Math.min(earned - requested, left)) }
}

export class PayoutError extends Error {}

/** 주민등록번호 13자리 형식·검증 숫자 확인(2020.10 이후 발급분은 검증 숫자가 없어 앞 6자리 생년월일·7번째 자리만 본다). */
export function validRrn(rrn: string): boolean {
  if (!/^\d{13}$/.test(rrn)) return false
  const mm = Number(rrn.slice(2, 4)), dd = Number(rrn.slice(4, 6))
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && '123456789'.includes(rrn[6]!)
}

export async function requestPayout(opts: { userId: string; tokens: number; realName: string; rrn: string; bank: string; accountNumber: string; requestId: string }): Promise<void> {
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
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${opts.userId}))`)
    // 남은 창작 보상 토큰보다 많으면 reserve 가 거절한다.
    const reservation = await reserve({ userId: opts.userId, kind: 'payout', tokenAmount: opts.tokens, onlyProviders: CREATOR_PROVIDERS, idempotencyKey: `payout:${opts.userId}:${opts.requestId}` }, tx)
      .catch(e => { throw e instanceof UsageExceededError ? new PayoutError('over_withdrawable') : e })
    if (reservation.reused) return
    const w = await withdrawableTokens(opts.userId, tx)
    if (opts.tokens > w.earned - w.requested) throw new PayoutError('over_withdrawable')
    await commit(reservation.reservationId, undefined, tx)
    await tx.insert(creatorPayouts).values({ userId: opts.userId, tokens: opts.tokens, grossKRW: quote.gross, taxKRW: quote.tax, netKRW: quote.net,
      realName, rrnSealed: sealed, bank, accountNumber, ledgerId: reservation.reservationId })
  })
}

export async function myPayouts(userId: string) {
  return db.select({ id: creatorPayouts.id, tokens: creatorPayouts.tokens, netKRW: creatorPayouts.netKRW, status: creatorPayouts.status, note: creatorPayouts.note, createdAt: creatorPayouts.createdAt })
    .from(creatorPayouts).where(eq(creatorPayouts.userId, userId))
    .orderBy(desc(creatorPayouts.createdAt)).limit(20)
}
