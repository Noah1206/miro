'use server'

import { revalidatePath } from 'next/cache'
import { renderBlocks, runTurn } from '@miro/engine'
import { requireUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { commitTurn, StaleStateError } from '@/lib/simulation/commit'
import { resolveRpLLM } from '@/lib/simulation/mock-llm'
import { contextFromWorld, getOrGenerate } from '@/lib/simulation/media'
import { UsageExceededError, exceededMessage, guarded } from '@/lib/usage/guard'
import { feature } from '@miro/config'
import { COPY } from '@/lib/copy'

export type LiveState = { error: string | null; notice: string | null }

/**
 * Live Scene 한 턴.
 *
 * Chat 과 동일한 Simulation 경로를 쓴다 — 별도 세계관을 만들지 않는다.
 * 결과는 World / Relationship / Event / Memory 에 그대로 반영되고,
 * Chat 으로 돌아가면 이어진다.
 */
export async function liveTurn(_prev: LiveState, form: FormData): Promise<LiveState> {
  if (!feature('liveScene')) return { error: COPY.error.featureOff, notice: null }
  const user = await requireUser()
  const sessionId = String(form.get('sessionId') ?? '')
  const input = String(form.get('input') ?? '').trim()

  if (input.length === 0) return { error: null, notice: null }
  if (input.length > 2000) return { error: '2000자 이내로 입력해 주세요.', notice: null }

  for (let attempt = 0; attempt < 2; attempt++) {
    const loaded = await loadSession(sessionId, user.id)
    if (!loaded || loaded.restricted) return { error: '장면을 찾을 수 없습니다.', notice: null }

    const llm = resolveRpLLM(loaded.characterName)
    const turnIndex = loaded.snapshot.turnCount + 1
    let result
    try {
      result = await guarded(
        { userId: user.id, kind: 'liveScene', idempotencyKey: `live:${sessionId}:${turnIndex}` },
        () => runTurn({ llm, snapshot: loaded.snapshot, userInput: input }),
      )
    } catch (e) {
      if (e instanceof UsageExceededError) return { error: exceededMessage(e), notice: null }
      return { error: '응답을 생성하지 못했습니다.', notice: null }
    }

    if (result.transition.issues.length > 0) {
      console.warn('[live] proposal issues', { sessionId, issues: result.transition.issues })
    }
    if (result.transition.blocks.length === 0) {
      return { error: '응답을 생성하지 못했습니다. 다시 시도해 주세요.', notice: null }
    }

    try {
      await commitTurn({
        sessionId,
        characterId: loaded.characterId,
        turnIndex,
        userInput: input,
        responseText: renderBlocks(result.transition.blocks),
        blocks: result.transition.blocks,
        transition: result.transition,
        worldVersion: loaded.snapshot.world.version,
        relationshipVersion: loaded.snapshot.relationship.version,
        currentRelationship: loaded.snapshot.relationship,
        existingMemories: loaded.snapshot.memories,
        characterState: result.characterState,
      })
    } catch (e) {
      if (e instanceof StaleStateError && attempt === 0) continue
      return { error: '상태를 저장하지 못했습니다.', notice: null }
    }

    revalidatePath(`/live/${sessionId}`)
    return {
      error: null,
      notice: result.providerMode === 'mock' ? 'LLM Provider 미구성 — Mock 응답입니다.' : null,
    }
  }
  return { error: '다시 시도해 주세요.', notice: null }
}

/** Live Scene 배경. Chat 과 같은 World State 에서 만든다. */
export async function ensureSceneBackground(sessionId: string): Promise<string | null> {
  if (!feature('liveScene')) return null
  const user = await requireUser()
  const loaded = await loadSession(sessionId, user.id)
  if (!loaded || loaded.restricted) return null

  const context = await contextFromWorld(sessionId)
  if (!context) return null

  try {
    const media = await getOrGenerate({
      sessionId,
      characterId: loaded.characterId,
      characterName: loaded.characterName,
      kind: 'background',
      context,
      aspect: '16:9',
      usage: { userId: user.id },
    })
    return media.url
  } catch {
    return null   // 배경 실패·한도 초과여도 텍스트 장면은 유지한다
  }
}
