import { eq, and } from 'drizzle-orm'
import { db, users, conversationRequests } from '@miro/db'
import { captureEvaluation } from '@/lib/ai/evaluation'
import { randomUUID } from 'node:crypto'
import { AIBudgetDeniedError, importanceScore, interactionImportance } from '@miro/providers'
import { beginRequest, failRequest } from '@/lib/ai/gateway'
import { feature, usagePolicy } from '@miro/config'
import type { CharacterState, ContactChannel, RealityIntent } from '@miro/domain'
import { renderBlocks, runTurn, UnsafeContentError, type TurnResult } from '@miro/engine'
import { loadSession } from './snapshot'
import { commitTurn, StaleStateError } from './commit'
import { resolveRpLLM, auxiliaryLLM } from './mock-llm'
import { UsageExceededError, reserve, rollback } from '@/lib/usage/guard'
import { type BudgetKind } from '@/lib/usage/ai-usage'
import { evaluateSession } from '@/lib/reality/evaluate'
import { track } from '@/lib/analytics/track'
import { observe, timed } from '@/lib/observe'

export type ConversationOutcome =
  | {
      ok: true
      requestId: string
      traceId: string
      turnIndex: number
      blocks: TurnResult['transition']['blocks']
      responseText: string
      providerMode: TurnResult['providerMode']
      characterState: CharacterState
      firedRules: string[]
      realityIntent: RealityIntent | null
      /** inlineReality 가 켜져 있고 규칙이 '지금' 이라 했을 때, 턴 직후 바로 보낸 선연락. */
      reality: { channel: ContactChannel; text: string } | null
      newEventType: string | null
      sceneChanged: boolean
    }
  | { ok: false; reason: 'not_found' | 'restricted' | 'empty' | 'too_long' | 'generation' | 'conflict' | 'safety' }
  | { ok: false; reason: 'usage'; error: UsageExceededError }
  | { ok: false; reason: 'budget'; kind: BudgetKind }

export const MAX_INPUT = 2000

/**
 * 대화 한 턴 — 웹 액션(/chat)과 API(/api/chat)가 똑같이 부르는 State Update Pipeline.
 *
 *   Gateway → 로드 → 월간 Usage 예약 → runTurn(규칙·상태·모델별 Budget·검증) → 원자적 커밋
 *   → (inlineReality) 사건 규칙이 '지금' 이라 한 선연락을 바로 발송
 *
 * 동시 요청으로 상태가 바뀌었으면 최신 상태로 한 번 재시도한다. 같은 턴의 재시도는 같은
 * idempotency key 를 쓰므로 두 번 차감되지 않는다. 오류는 이유(reason)로만 나간다 — 호출자가 문장을 고른다.
 */
async function executeTurn(opts: {
  userId: string
  sessionId: string
  input: string
  ip?: string | null
  requestId: string
  traceId: string
}): Promise<ConversationOutcome> {
  const input = opts.input.trim()
  if (input.length === 0) return { ok: false, reason: 'empty' }
  if (input.length > MAX_INPUT) return { ok: false, reason: 'too_long' }
  const { userId, sessionId } = opts

  for (let attempt = 0; attempt < 2; attempt++) {
    const loaded = await loadSession(sessionId, userId, input)
    if (!loaded) return { ok: false, reason: 'not_found' }
    if (loaded.restricted) return { ok: false, reason: 'restricted' }

    const importance = importanceScore(interactionImportance(input))
    const kind = importance >= .85 ? 'majorEvent' : importance >= .35 ? 'complexEvent' : 'textRP'
    let reservation
    try { reservation = await reserve({ userId, kind, idempotencyKey: `turn:${opts.requestId}` }) }
    catch (e) { if (e instanceof UsageExceededError) return { ok: false, reason: 'usage', error: e }; throw e }
    const [consent] = await db.select({ allowEvaluation: users.allowEvaluation }).from(users).where(eq(users.id, userId)).limit(1)
    const context = { allowEvaluation: consent?.allowEvaluation ?? false, userId, sessionId, requestId: opts.requestId, traceId: opts.traceId, ip: opts.ip, continuity: reservation.continuity, usageUnits: reservation.cost }
    const llm = resolveRpLLM(loaded.characterName, context)
    const turnIndex = loaded.snapshot.turnCount + 1

    let result: TurnResult
    try {
      result = await timed('provider.llm.turn', { sessionId, mode: llm.info.mode },
        () => runTurn({ llm, snapshot: loaded.snapshot, userInput: input,
          auxiliaryLLM: reservation.continuity ? undefined : auxiliaryLLM(loaded.characterName, context),
          maxOutputTokens: reservation.continuity ? usagePolicy().continuity.maxOutputTokens : undefined,
        }))

    } catch (e) {
      await rollback(reservation.reservationId)
      if (e instanceof UnsafeContentError) return { ok: false, reason: 'safety' }
      if (e instanceof AIBudgetDeniedError) return { ok: false, reason: 'budget', kind: e.reason as BudgetKind }
      if (e instanceof UsageExceededError) return { ok: false, reason: 'usage', error: e }
      observe('turn.failed', { sessionId, turn: turnIndex, error: 'generation_failed' })
      return { ok: false, reason: 'generation' }
    }

    const { transition } = result
    if (result.providerMode === 'fallback') {
      await rollback(reservation.reservationId)
      observe('provider.llm.fallback', { sessionId, turn: turnIndex })
      return { ok: false, reason: 'generation' }
    }
    // 검증에서 걸러진 항목은 조용히 버리지 않는다 — Provider 품질 신호다.
    if (transition.issues.length > 0) {
      observe('provider.llm.validation_issues', { sessionId, turn: turnIndex, count: transition.issues.length, fields: transition.issues.map((i) => i.field).join(',') })
    }
    if (transition.blocks.length === 0) { await rollback(reservation.reservationId); return { ok: false, reason: 'generation' } }

    const responseText = renderBlocks(transition.blocks)
    const outcome: Extract<ConversationOutcome, { ok: true }> = {
      ok: true, requestId: opts.requestId, traceId: opts.traceId, turnIndex, blocks: transition.blocks, responseText,
      providerMode: result.providerMode, characterState: result.characterState, firedRules: result.firedRules,
      realityIntent: transition.realityIntent, reality: null, newEventType: transition.newEvent?.candidate.type ?? null,
      sceneChanged: transition.sceneDelta !== null,
    }
    try {
      await commitTurn({
        reservationId: reservation.reservationId, requestId: opts.requestId, requestResult: outcome,
        sessionId, characterId: loaded.characterId, turnIndex,
        userInput: input, responseText, blocks: transition.blocks, transition,
        worldVersion: loaded.snapshot.world.version,
        relationshipVersion: loaded.snapshot.relationship.version,
        currentRelationship: loaded.snapshot.relationship,
        existingMemories: loaded.snapshot.memories,
        characterState: result.characterState,
      })
    } catch (e) {
      await rollback(reservation.reservationId)
      // 다른 요청이 먼저 커밋했다. 최신 상태로 한 번 더 시도한다.
      if (e instanceof StaleStateError && attempt === 0) { observe('state.stale_retry', { sessionId, turn: turnIndex }); continue }
      observe('state.commit_failed', { sessionId, turn: turnIndex, error: (e as Error).message })
      return { ok: false, reason: 'conflict' }
    }

    void track(userId, 'rp_message_sent', {
      sessionId, turn: turnIndex, mood: result.characterState.mood, provider: result.providerMode,
      semantic: result.semanticEvents.map((e) => e.type).join(','), rules: result.firedRules.join(','),
    })
    if (transition.newEvent) void track(userId, 'event_triggered', { sessionId, type: transition.newEvent.candidate.type })
    if (transition.sceneDelta) void track(userId, 'scene_changed', { sessionId })

    // Event Engine 은 "무엇" 을, Scheduler 는 "언제" 를 맡는다. notBefore 가 없는 의도만 지금 보낸다.
    let reality: { channel: ContactChannel; text: string } | null = null
    if (feature('inlineReality') && transition.realityIntent && !transition.realityIntent.notBefore) {
      try {
        const r = await evaluateSession(sessionId, new Date(), { inline: true })
        if (r.outcome === 'sent' && r.text) reality = { channel: r.channel, text: r.text }
        else observe('reality.inline_not_sent', { sessionId, outcome: r.outcome, reason: 'reason' in r ? r.reason : undefined })
      } catch (e) {
        observe('reality.inline_failed', { sessionId, error: (e as Error).message })
      }
    }

    const completed = { ...outcome, reality }
    await db.update(conversationRequests).set({ result: completed }).where(eq(conversationRequests.id, opts.requestId)).catch(() => observe('request.cache_update_failed', { requestId: opts.requestId }))
    await captureEvaluation(userId, opts.requestId, { input, response: responseText, context: result.context.system + '\n' + result.context.prompt, promptVersion: result.context.promptVersion, modelId: llm.lastModelId, shadow: llm.shadowOutput }).catch(() => observe('ai.evaluation_capture_failed', { requestId: opts.requestId }))
    return completed

  }
  return { ok: false, reason: 'conflict' }
}

/** Main chat and alpha share ownership, trace and replay protection. */
export async function runConversationTurn(opts: { userId: string; sessionId: string; input: string; ip?: string | null; requestId?: string }): Promise<ConversationOutcome> {
  if (!opts.input.trim()) return { ok: false, reason: 'empty' }
  if (opts.input.length > MAX_INPUT) return { ok: false, reason: 'too_long' }
  let request
  try { request = await beginRequest(opts.userId, opts.sessionId, opts.input, opts.requestId) }
  catch { return { ok: false, reason: 'conflict' } }
  if (request.cached) return request.cached
  try {
    const result = await executeTurn({ ...opts, requestId: request.requestId, traceId: randomUUID() })
    if (!result.ok) await failRequest(request.requestId)
    return result
  } catch {
    await failRequest(request.requestId)
    return { ok: false, reason: 'generation' }
  }
}
