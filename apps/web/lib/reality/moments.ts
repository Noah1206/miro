import { and, eq, gt, inArray } from 'drizzle-orm'
import { db, userMoments } from '@miro/db'
import { acceptMoments, dueMoment, localClock, localIso, type MomentPhase, type UserMoment } from '@miro/domain'
import { extractMoments } from '@miro/engine'
import type { LLMProvider } from '@miro/providers'
import { observe } from '@/lib/observe'
import type { EvaluateOutcome } from './evaluate'

/**
 * 사용자가 말한 자기 일정(2026-10-09 — "내 말을 기억하고 챙긴다"). 뽑기는 기억 작업이, 챙길 때는 선연락 스케줄러가 맡는다.
 * 규칙(언제 응원하고 언제 묻는지)은 domain/reality/moments.
 */
const toMoment = (r: typeof userMoments.$inferSelect): UserMoment => ({ id: r.id, about: r.about, eventAt: r.eventAt, hasTime: r.hasTime,
  cheerAt: r.cheerAt, askAt: r.askAt, cheeredAt: r.cheeredAt, askedAt: r.askedAt })

/** 아직 챙길 수 있는 일정 — 사흘 전 일까지(끝난 뒤 묻기·대화 맥락에 쓴다). */
export async function activeMoments(sessionId: string, now = new Date()): Promise<UserMoment[]> {
  const rows = await db.select().from(userMoments)
    .where(and(eq(userMoments.sessionId, sessionId), eq(userMoments.status, 'active'), gt(userMoments.eventAt, new Date(now.getTime() - 3 * 86_400_000))))
    .orderBy(userMoments.eventAt).limit(20)
  return rows.map(toMoment)
}

export type DueMoment = { moment: UserMoment; phase: MomentPhase }

export async function dueMomentFor(sessionId: string, now: Date): Promise<DueMoment | null> {
  return dueMoment(await activeMoments(sessionId, now), now)
}

/**
 * 챙긴 결과를 남긴다. 보냈거나 캐릭터가 이번엔 안 보내기로 했으면 그때는 끝(다시 묻지 않는다 — 자율성 판단도 같은 기회로 한 번만 묻는다).
 * 지금 닿지 않을 뿐이면(자는 중·판 준비 중·상태가 바뀜) 남겨 두고 다음 확인(30분)에 다시 — 때를 넘기면 domain 의 창이 접는다.
 */
export async function settleMoment(due: DueMoment, outcome: EvaluateOutcome, now: Date): Promise<void> {
  const retry = (outcome.outcome === 'suppressed' && ['outside_active_hours', 'busy', 'max_pending', 'cooldown', 'daily_cap'].includes(outcome.reason))
    || (outcome.outcome === 'skipped' && ['agency_unavailable', 'state_changed', 'feature_disabled'].includes(outcome.reason))
  observe('moment.followup', { momentId: due.moment.id, phase: due.phase, outcome: outcome.outcome, reason: 'reason' in outcome ? outcome.reason : null, retry })
  if (retry) return
  await db.update(userMoments).set(due.phase === 'before' ? { cheeredAt: now } : { askedAt: now }).where(eq(userMoments.id, due.moment.id))
}

const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

/**
 * 이번 사용자 말에서 일정을 뽑아 남긴다(기억 추출 작업 안에서, 앞날을 말한 듯할 때만). 취소·변경도 여기서.
 * 실패해도 기억 작업은 그대로 끝난다 — 일정은 덤이다.
 */
export async function captureMoments(llm: LLMProvider, job: { sessionId: string; messageId: string; input: string; timeZone: string; now: Date;
  recent: Array<{ who: 'user' | 'character'; text: string }> }): Promise<number> {
  const existing = await activeMoments(job.sessionId, job.now)
  const proposed = await extractMoments(llm, {
    now: localIso(job.now, job.timeZone), weekday: WEEKDAYS[localClock(job.now, job.timeZone).weekday]!, recent: job.recent.slice(-6), input: job.input,
    existing: existing.map(m => ({ id: m.id, about: m.about, when: localClock(m.eventAt, job.timeZone).label })),
  })
  const cancel = proposed.cancel.filter(id => existing.some(m => m.id === id))
  const kept = existing.filter(m => !cancel.includes(m.id))
  const drafts = acceptMoments(proposed.moments, job.now, job.timeZone, kept)
  if (!cancel.length && !drafts.length) return 0
  await db.transaction(async tx => {
    if (cancel.length) await tx.update(userMoments).set({ status: 'cancelled' }).where(and(eq(userMoments.sessionId, job.sessionId), inArray(userMoments.id, cancel)))
    if (drafts.length) await tx.insert(userMoments).values(drafts.map(d => ({ sessionId: job.sessionId, sourceMessageId: job.messageId, ...d }))).onConflictDoNothing()
  })
  observe('moment.captured', { sessionId: job.sessionId, added: drafts.length, cancelled: cancel.length })
  return drafts.length
}
