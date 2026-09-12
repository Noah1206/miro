'use server'

import { revalidatePath } from 'next/cache'
import { renderBlocks, runTurn } from '@miro/engine'
import { requireUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { commitTurn, StaleStateError } from '@/lib/simulation/commit'
import { resolveRpLLM } from '@/lib/simulation/mock-llm'

export type TurnState = { error: string | null; notice: string | null }

const MAX_INPUT = 2000

/**
 * 자유 RP 한 턴.
 *
 * 흐름: 상태 로드 → Context → 1회 Structured Generation → 검증 → 원자적 커밋.
 * 동시 요청으로 상태가 바뀌었으면 최신 상태로 한 번 재시도한다.
 */
export async function sendTurn(_prev: TurnState, form: FormData): Promise<TurnState> {
  const user = await requireUser()
  const sessionId = String(form.get('sessionId') ?? '')
  const input = String(form.get('input') ?? '').trim()

  if (input.length === 0) return { error: null, notice: null }
  if (input.length > MAX_INPUT) {
    return { error: `${MAX_INPUT}자 이내로 입력해 주세요.`, notice: null }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const loaded = await loadSession(sessionId, user.id)
    if (!loaded) return { error: '대화를 찾을 수 없습니다.', notice: null }

    const llm = resolveRpLLM(loaded.characterName)

    let result
    try {
      result = await runTurn({ llm, snapshot: loaded.snapshot, userInput: input })
    } catch {
      return { error: '응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.', notice: null }
    }

    const { transition } = result

    // 검증에서 걸러진 항목은 조용히 버리지 않는다 — Provider 품질 신호다.
    if (transition.issues.length > 0) {
      console.warn('[rp] proposal issues', {
        sessionId, turn: loaded.snapshot.turnCount + 1,
        issues: transition.issues,
      })
    }

    if (transition.blocks.length === 0) {
      return { error: '응답을 생성하지 못했습니다. 다시 시도해 주세요.', notice: null }
    }

    try {
      await commitTurn({
        sessionId,
        characterId: loaded.characterId,
        turnIndex: loaded.snapshot.turnCount + 1,
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
      if (e instanceof StaleStateError && attempt === 0) continue
      return { error: '상태를 저장하지 못했습니다. 다시 시도해 주세요.', notice: null }
    }

    revalidatePath(`/chat/${sessionId}`)
    return {
      error: null,
      notice: result.providerMode === 'mock'
        ? 'LLM Provider 미구성 — Mock 응답입니다.'
        : null,
    }
  }

  return { error: '동시에 다른 요청이 처리되었습니다. 다시 시도해 주세요.', notice: null }
}

/** 출력 스타일 변경 (n29). */
export async function setOutputStyle(sessionId: string, style: string): Promise<void> {
  const user = await requireUser()
  const { db, roleplaySessions } = await import('@miro/db')
  const { and, eq } = await import('drizzle-orm')

  if (!['messenger', 'balanced', 'narrative'].includes(style)) return

  await db.update(roleplaySessions)
    .set({ outputStyle: style as 'messenger' | 'balanced' | 'narrative' })
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id)))

  revalidatePath(`/chat/${sessionId}`)
}
