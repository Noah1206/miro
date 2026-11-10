import { inArray, sql } from 'drizzle-orm'
import { db, aiBudgetCounters } from '@miro/db'

const OVER = Symbol('over')

/**
 * 11/10 회원별 횟수 한도 — AI 예산과 같은 ai_budget_counters 행을 쓴다(만료 행은 ai/maintenance 가 지운다).
 * 키에 ':user:' 를 넣어 관리자 합계 화면에서 빠진다. 창은 고정 구간(분·5분·UTC 하루). 하나라도 넘으면 올린 것까지 되돌리고 false.
 */
export async function takeUserQuota(userId: string, name: string, windows: { ms: number; max: number }[]): Promise<boolean> {
  const now = Date.now()
  const entries = windows.map(w => { const slot = Math.floor(now / w.ms)
    return { key: `${slot}:${name}:user:${userId}:${w.ms}`, max: w.max, expiresAt: new Date((slot + 1) * w.ms + 3_600_000) } })
    .sort((a, b) => a.key.localeCompare(b.key))
  try {
    await db.transaction(async tx => {
      await tx.insert(aiBudgetCounters).values(entries.map(({ key, expiresAt }) => ({ key, expiresAt }))).onConflictDoNothing()
      const rows = await tx.update(aiBudgetCounters).set({ requests: sql`${aiBudgetCounters.requests} + 1` })
        .where(inArray(aiBudgetCounters.key, entries.map(e => e.key))).returning({ key: aiBudgetCounters.key, requests: aiBudgetCounters.requests })
      if (rows.some(r => r.requests > (entries.find(e => e.key === r.key)?.max ?? 0))) throw OVER
    })
    return true
  } catch (e) { if (e === OVER) return false; throw e }
}

/** 음성 서버 깨우기 — 서버(합성·목소리 등록)마다 회원당 5분에 한 번. */
export const takeVoiceWake = (userId: string, server: 'tts' | 'upload' = 'tts') => takeUserQuota(userId, `voice_wake_${server}`, [{ ms: 300_000, max: 1 }])
