'use server'

import { feature } from '@miro/config'
import { COPY } from '@/lib/copy'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { renderBlocks, runTurn } from '@miro/engine'
import { requireUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { commitTurn, StaleStateError } from '@/lib/simulation/commit'
import { resolveRpLLM } from '@/lib/simulation/mock-llm'
import { endCall, owned, startOutgoingCall, UsageExceededError } from '@/lib/call/service'
import { exceededMessage } from '@/lib/usage/guard'
import { randomUUID } from 'node:crypto'
import { prepareAgencyTurn } from '@/lib/agency/turn-context'

export type CallTurnState = { error: string | null }

/**
 * 통화 중 한 마디. Chat 과 같은 시뮬레이션 파이프라인을 mode 만 바꿔 쓴다 —
 * 통화에서 한 말이 관계·세계·기억에 그대로 반영된다. 사용량은 통화 시간으로 이미 차감된다.
 */
export async function callTurn(_prev: CallTurnState, form: FormData): Promise<CallTurnState> {
  if (!feature('voiceCall') && !feature('videoCall')) return { error: COPY.error.featureOff }
  const user = await requireUser()
  const callId = String(form.get('callId') ?? '')
  const input = String(form.get('input') ?? '').trim()
  if (!input) return { error: null }
  if (input.length > 500) return { error: '500자 이내로 입력해 주세요.' }

  const call = await owned(user.id, callId)
  if (!call || call.status !== 'active') return { error: '통화가 진행 중이 아닙니다.' }
  const userMessageId = randomUUID()

  for (let attempt = 0; attempt < 2; attempt++) {
    const loaded = await loadSession(call.sessionId, user.id)
    if (!loaded || loaded.restricted) return { error: '대화를 찾을 수 없습니다.' }
    const snapshot = { ...loaded.snapshot, mode: call.channel === 'voice' ? 'voice_call' as const : 'video_call' as const }
    const turnIndex = snapshot.turnCount + 1

    let result
    let prepared
    try {
      const llm = resolveRpLLM(loaded.characterName, { userId: user.id, sessionId: call.sessionId })
      prepared = await prepareAgencyTurn(call.sessionId, user.id, snapshot, llm, { id: userMessageId, text: input })
      result = await runTurn({ llm, snapshot: prepared.snapshot, userInput: input, agency: prepared.agency })
    } catch {
      return { error: '연결이 불안정합니다. 텍스트 대화로 이어가시겠어요?' }
    }
    if (result.transition.blocks.length === 0) return { error: '응답을 만들지 못했습니다.' }

    try {
      await commitTurn({
        sessionId: call.sessionId, characterId: loaded.characterId, turnIndex,
        userInput: input, userMessageId, responseText: renderBlocks(result.transition.blocks),
        ...(prepared.runtime?.mode === 'live' && result.agency ? { agency: { version: prepared.runtime.version, plan: result.agency.plan } } : {}),
        blocks: [...result.transition.blocks, { type: 'call_line' as never, speaker: null, text: callId }],
        transition: result.transition,
        worldVersion: snapshot.world.version, relationshipVersion: snapshot.relationship.version,
        currentRelationship: snapshot.relationship, existingMemories: snapshot.memories,
        characterState: result.characterState,
      })
    } catch (e) {
      if (e instanceof StaleStateError && attempt === 0) continue
      return { error: '상태를 저장하지 못했습니다.' }
    }
    revalidatePath(`/call/${callId}`)
    return { error: null }
  }
  return { error: '다시 시도해 주세요.' }
}

export async function hangUp(callId: string): Promise<void> {
  const user = await requireUser()
  const call = await owned(user.id, callId)
  await endCall(user.id, callId)
  redirect(call ? `/chat/${call.sessionId}` : '/home')
}

export type PlaceCallState = { error: string | null }

/** Chat 의 통화 버튼 (n41). 한도 초과면 인라인 안내, 성공이면 통화 화면으로. */
export async function placeCallAction(_prev: PlaceCallState, form: FormData): Promise<PlaceCallState> {
  const user = await requireUser()
  const sessionId = String(form.get('sessionId') ?? '')
  const channel = form.get('channel') === 'video' ? 'video' : 'voice'
  if (!feature(channel === 'video' ? 'videoCall' : 'voiceCall')) return { error: COPY.error.featureOff }
  let callId: string
  try {
    callId = await startOutgoingCall(user.id, sessionId, channel)
  } catch (e) {
    if (e instanceof UsageExceededError) return { error: exceededMessage(e) }
    return { error: '통화를 시작하지 못했습니다.' }
  }
  redirect(`/call/${callId}`)
}
