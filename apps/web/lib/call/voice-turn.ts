import { randomUUID } from 'node:crypto'
import { characterAgencyMode } from '@miro/config'
import { renderBlocks, runTurn, UnsafeContentError } from '@miro/engine'
import { loadSession } from '@/lib/simulation/snapshot'
import { commitTurn, StaleStateError } from '@/lib/simulation/commit'
import { auxiliaryLLM, resolveRpLLM } from '@/lib/simulation/mock-llm'
import { observe } from '@/lib/observe'
import { owned } from './service'

/** 끊은 직후 도착하는 마지막 턴은 받는다 — 브라우저가 종료 신호와 거의 동시에 보낸다. */
const LATE_TURN_MS = 2 * 60_000
export const VOICE_TURN_MAX = 2000

export type VoiceTurnOutcome = 'stored' | 'not_found' | 'closed' | 'unsafe' | 'stale' | 'skipped'

/**
 * 실시간 음성 통화의 한 턴(사용자가 한 말 + 캐릭터가 소리로 한 말)을 채팅 턴처럼 남긴다.
 * 대사는 이미 나갔으므로 새로 만들지 않는다. 검열·관계·기억·사건 규칙은 채팅과 같은 파이프라인이 맡는다.
 * 검열에 걸린 턴은 남기지 않는다 — 소리는 이미 나갔어도 기억과 관계에는 들이지 않는다.
 */
export async function absorbVoiceTurn(userId: string, callId: string, user: string, character: string, now = new Date()): Promise<VoiceTurnOutcome> {
  const said = user.trim().slice(0, VOICE_TURN_MAX), reply = character.trim().slice(0, VOICE_TURN_MAX)
  if (!reply) return 'skipped'
  const call = await owned(userId, callId)
  if (!call || call.channel !== 'voice') return 'not_found'
  const late = call.status === 'ended' && call.endedAt && now.getTime() - call.endedAt.getTime() <= LATE_TURN_MS
  if (call.status !== 'active' && !late) return 'closed'
  // 자율성 엔진 코호트는 통화가 텍스트로만 진행된다(통화 화면이 막는다). 여기로 오는 음성 턴은 없어야 한다.
  if (characterAgencyMode(call.sessionId) === 'live') return 'skipped'

  for (let attempt = 0; attempt < 2; attempt++) {
    const loaded = await loadSession(call.sessionId, userId, said)
    if (!loaded || loaded.restricted) return 'not_found'
    const snapshot = { ...loaded.snapshot, mode: 'voice_call' as const }
    const requestId = randomUUID()
    const context = { userId, sessionId: call.sessionId, requestId }
    let result
    try {
      // 사용자가 아무 말도 안 한 턴(캐릭터가 먼저 말함)은 분류할 것이 없다 — 보조 분석을 부르지 않는다.
      result = await runTurn({ llm: resolveRpLLM(loaded.characterName, context), auxiliaryLLM: said ? auxiliaryLLM(loaded.characterName, context) : undefined,
        snapshot, userInput: said, spokenReply: reply, auxiliary: 'planned', now })
    } catch (e) {
      if (e instanceof UnsafeContentError) { observe('call.voice_turn_unsafe', { callId }); return 'unsafe' }
      throw e
    }
    try {
      await commitTurn({
        sessionId: call.sessionId, characterId: loaded.characterId, turnIndex: snapshot.turnCount + 1,
        userInput: said, userMessageId: randomUUID(), responseText: renderBlocks(result.transition.blocks),
        blocks: [...result.transition.blocks, { type: 'call_line' as never, speaker: null, text: callId }],
        transition: result.transition, worldVersion: snapshot.world.version, relationshipVersion: snapshot.relationship.version,
        currentRelationship: snapshot.relationship, existingMemories: snapshot.memories, characterState: result.characterState,
      })
      return 'stored'
    } catch (e) {
      if (e instanceof StaleStateError && attempt === 0) continue
      if (e instanceof StaleStateError) return 'stale'
      throw e
    }
  }
  return 'stale'
}
