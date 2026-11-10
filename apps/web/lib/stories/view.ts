import { and, eq, sql } from 'drizzle-orm'
import { db, storyChanges, storyRuns } from '@miro/db'
import { applyActions, currentEvent, optionOpen, progressOf, type StoryDefinition, type StoryProgress, type StoryState } from '@miro/domain'
import { definitionOf, runFor } from './repo'
import { syncContacts } from './contacts'

/** 플레이 화면에 보내는 것: 지금 사건의 예시 문구(열린 것만), 진행(끝낸 사건·알게 된 단서·관계). 조건·미래 사건은 없다. */
export type RunView = { hints: { id: string; text: string }[]; chapterTitle: string | null; progress: StoryProgress; premiseRefused: boolean }

export function runView(def: StoryDefinition, s: StoryState): RunView {
  const ev = currentEvent(def, s)
  return {
    hints: ev && s.premise === 'accepted' ? ev.options.filter(o => optionOpen(def, s, o).ok).map(o => ({ id: o.id, text: o.hint })) : [],
    chapterTitle: ev?.title ?? null,
    progress: progressOf(def, s),
    premiseRefused: s.premise === 'refused',
  }
}

/**
 * 화면의 연락 허용/중지 스위치. 대화 턴과 같은 길(엔진 검증 → 원장 → 예약 정리)로 — 근거는 사용자가 누른 버튼이다.
 * 중지하면 그 인물의 대기 중인 연락이 즉시 취소된다.
 */
export async function setContactPermission(userId: string, runId: string, character: string, value: 'allowed' | 'stopped') {
  const run = await runFor(userId, runId)
  if (!run || run.status === 'archived') return { ok: false as const, error: 'run' }
  const def = await definitionOf(run.storyId)
  if (!def.characters.some(c => c.key === character)) return { ok: false as const, error: 'character' }
  const label = value === 'allowed' ? '연락 허용' : '연락 중지'
  return db.transaction(async tx => {
    const [locked] = await tx.select().from(storyRuns).where(and(eq(storyRuns.id, runId), eq(storyRuns.userId, userId))).for('update')
    const r = applyActions(def, locked!.state as StoryState, [{ type: 'contact', character, value, quote: label }], label, `ui:${Date.now()}`)
    if (!r.applied.length) return { ok: true as const, view: runView(def, r.state) }
    await tx.insert(storyChanges).values(r.applied.map(c => ({ runId, kind: c.kind, detail: { ...c.detail, via: 'settings' } })))
    await tx.update(storyRuns).set({ state: r.state, version: sql`${storyRuns.version} + 1`, updatedAt: new Date() }).where(eq(storyRuns.id, runId))
    await syncContacts(tx, def, runId, r.state, null, new Date())
    return { ok: true as const, view: runView(def, r.state) }
  })
}
