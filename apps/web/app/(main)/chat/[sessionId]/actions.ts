'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db, roleplaySessions } from '@miro/db'
import { renderBlocks, runTurn } from '@miro/engine'
import { requireUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { commitTurn, StaleStateError } from '@/lib/simulation/commit'
import { resolveRpLLM } from '@/lib/simulation/mock-llm'
import { UsageExceededError, exceededMessage, guarded } from '@/lib/usage/guard'
import { track } from '@/lib/analytics/track'
import { observe, timed } from '@/lib/observe'

export type TurnState = {
  error: string | null
  notice: string | null
  /** 한도 도달 시 UI 가 Pro 안내 / 초기화 대기를 구분해 보여준다. */
  limit: { plan: 'free' | 'pro'; resetsAt: string } | null
}

const MAX_INPUT = 2000
const fail = (error: string): TurnState => ({ error, notice: null, limit: null })

/**
 * 자유 RP 한 턴.
 *
 * 흐름: 상태 로드 → Usage 예약 → Context → 1회 Structured Generation → 검증 → 원자적 커밋.
 * 동시 요청으로 상태가 바뀌었으면 최신 상태로 한 번 재시도한다.
 * 같은 턴의 재시도는 같은 idempotency key 를 쓰므로 두 번 차감되지 않는다.
 */
export async function sendTurn(_prev: TurnState, form: FormData): Promise<TurnState> {
  const user = await requireUser()
  const sessionId = String(form.get('sessionId') ?? '')
  const input = String(form.get('input') ?? '').trim()

  if (input.length === 0) return { error: null, notice: null, limit: null }
  if (input.length > MAX_INPUT) return fail(`${MAX_INPUT}자 이내로 입력해 주세요.`)

  for (let attempt = 0; attempt < 2; attempt++) {
    const loaded = await loadSession(sessionId, user.id)
    if (!loaded) return fail('대화를 찾을 수 없습니다.')
    if (loaded.restricted) return fail('운영 정책에 따라 이 역할극은 제한되었습니다. 문의는 설정에서 할 수 있습니다.')

    const llm = resolveRpLLM(loaded.characterName)
    const turnIndex = loaded.snapshot.turnCount + 1

    let result
    try {
      result = await guarded(
        { userId: user.id, kind: 'textRP', idempotencyKey: `turn:${sessionId}:${turnIndex}` },
        () => timed('provider.llm.turn', { sessionId, mode: llm.info.mode },
          () => runTurn({ llm, snapshot: loaded.snapshot, userInput: input })),
      )
    } catch (e) {
      if (e instanceof UsageExceededError) {
        return { error: exceededMessage(e), notice: null, limit: { plan: e.plan, resetsAt: e.resetsAt.toISOString() } }
      }
      return fail('응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }

    const { transition } = result
    // 검증에서 걸러진 항목은 조용히 버리지 않는다 — Provider 품질 신호다.
    if (transition.issues.length > 0) {
      observe('provider.llm.validation_issues', { sessionId, turn: turnIndex, count: transition.issues.length,
        fields: transition.issues.map((i) => i.field).join(',') })
    }
    if (transition.blocks.length === 0) return fail('응답을 생성하지 못했습니다. 다시 시도해 주세요.')

    try {
      await commitTurn({
        sessionId,
        characterId: loaded.characterId,
        turnIndex,
        userInput: input,
        responseText: renderBlocks(transition.blocks),
        blocks: transition.blocks,
        transition,
        worldVersion: loaded.snapshot.world.version,
        relationshipVersion: loaded.snapshot.relationship.version,
        currentRelationship: loaded.snapshot.relationship,
        existingMemories: loaded.snapshot.memories,
      })
    } catch (e) {
      // 다른 요청이 먼저 커밋했다. 최신 상태로 한 번 더 시도한다.
      if (e instanceof StaleStateError && attempt === 0) { observe('state.stale_retry', { sessionId, turn: turnIndex }); continue }
      observe('state.commit_failed', { sessionId, turn: turnIndex, error: (e as Error).message })
      return fail('상태를 저장하지 못했습니다. 다시 시도해 주세요.')
    }

    void track(user.id, 'rp_message_sent', { sessionId, turn: turnIndex })
    if (transition.newEvent) void track(user.id, 'event_triggered', { sessionId, type: transition.newEvent.candidate.type })
    if (transition.sceneDelta) void track(user.id, 'scene_changed', { sessionId })
    revalidatePath(`/chat/${sessionId}`)
    return {
      error: null,
      notice: result.providerMode === 'mock' ? 'LLM Provider 미구성 — Mock 응답입니다.' : null,
      limit: null,
    }
  }

  return fail('동시에 다른 요청이 처리되었습니다. 다시 시도해 주세요.')
}

/** 출력 스타일 변경 (n29). */
export async function setOutputStyle(sessionId: string, style: string): Promise<void> {
  const user = await requireUser()
  if (!['messenger', 'balanced', 'narrative'].includes(style)) return

  await db.update(roleplaySessions)
    .set({ outputStyle: style as 'messenger' | 'balanced' | 'narrative' })
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id)))

  revalidatePath(`/chat/${sessionId}`)
}
