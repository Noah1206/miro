import { resolveChatModel } from '@/lib/ai/chat-models'
import { eq, and } from 'drizzle-orm'
import { db, users, conversationRequests, contactProfiles, messages, roleplaySessions } from '@miro/db'
import { captureEvaluation } from '@/lib/ai/evaluation'
import { randomUUID } from 'node:crypto'
import { AIBudgetDeniedError, importanceScore, interactionImportance } from '@miro/providers'
import { beginRequest, failRequest, SessionUnavailableError } from '@/lib/ai/gateway'
import { feature, usagePolicy } from '@miro/config'
import type { CharacterState, ContactChannel, RealityIntent } from '@miro/domain'
import { renderBlocks, requireSafeContent, runTurn, UnsafeContentError, type TurnResult } from '@miro/engine'
import { loadSession } from './snapshot'
import { commitTurn, StaleStateError, type CommittedMessage } from './commit'
import { afterResponse } from '@/lib/defer'
import { resolveRpLLM, auxiliaryLLM } from './mock-llm'
import { UsageExceededError, reserve, rollback, type Reservation } from '@/lib/usage/guard'
import { type BudgetKind } from '@/lib/usage/ai-usage'
import { evaluateSession } from '@/lib/reality/evaluate'
import { track } from '@/lib/analytics/track'
import { measured, observe, timed } from '@/lib/observe'
import { type LoadedAgency } from '@/lib/agency/runtime'
import { prepareAgencyTurn } from '@/lib/agency/turn-context'
import { characterAvailability } from '@/lib/reality/routine'

export type ConversationOutcome =
  | {
      ok: true
      requestId: string
      traceId: string
  chatModel?: string
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
      /** 이번 턴에 저장된 메시지. 화면이 바로 붙인다. 옛 결과를 되살린 경우 비어 있을 수 있다. */
      messages?: CommittedMessage[]
      /** 문자: 캐릭터가 지금 바빠서 답장을 나중으로 미뤘다. until 은 ISO, label 은 뭘 하는 중인지. */
      delayed?: { until: string; label: string }
    }
  | { ok: false; reason: 'not_found' | 'restricted' | 'empty' | 'too_long' | 'generation' | 'conflict' | 'safety' | 'model_unavailable' }
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
  chatModel?: string
  /** messenger = 문자 페이지에서 온 턴. 문자로 답하고 messenger kind 로 남는다. 미로 캐릭터에만 있다. */
  mode?: 'chat' | 'messenger'
}): Promise<ConversationOutcome> {
  const input = opts.input.trim()
  if (input.length === 0) return { ok: false, reason: 'empty' }
  if (input.length > MAX_INPUT) return { ok: false, reason: 'too_long' }
  const { userId, sessionId } = opts
  const userMessageId = randomUUID()

  for (let attempt = 0; attempt < 2; attempt++) {
    // 세션·모델·동의는 서로를 모른다 — 한 번에 읽는다.
    const [loaded, model, consent] = await Promise.all([
      measured('chat.snapshot', () => loadSession(sessionId, userId, input)),
      measured('chat.model', () => resolveChatModel(userId, opts.chatModel ?? 'miro')).catch(() => null),
      measured('chat.consent_db', () => db.select({ allowEvaluation: users.allowEvaluation }).from(users).where(eq(users.id, userId)).limit(1)).then(rows => rows[0]),
    ])
    if (!loaded) return { ok: false, reason: 'not_found' }
    if (loaded.restricted) return { ok: false, reason: 'restricted' }
    if (!model) return { ok: false, reason: 'model_unavailable' }
    const messenger = opts.mode === 'messenger'
    // 문자는 미로 캐릭터의 것이다 — 일반 캐릭터챗 세션에는 문자 페이지가 없다.
    if (messenger && loaded.experienceType !== 'reality') return { ok: false, reason: 'not_found' }
    // 문자인데 캐릭터가 바쁘거나 닿지 않는 중이면 지금 답하지 않는다 — 내 문자만 남고, 답장은 리듬이 풀린 뒤 스케줄러가 보낸다.
    // 연락이 꺼진 캐릭터는 스케줄러가 답장을 보내지 않으므로 여기서 미루지 않고 바로 답한다.
    if (messenger) {
      const now = new Date()
      const [profile] = await db.select({ enabled: contactProfiles.enabled }).from(contactProfiles).where(eq(contactProfiles.characterId, loaded.characterId)).limit(1)
      const availability = profile?.enabled ? await characterAvailability(loaded.characterId, now, loaded.snapshot.clock?.timeZone) : null
      if (availability && availability.availability !== 'free') {
        // 미뤄진 문자는 지금 모델에 가지 않고 나중에 기록으로만 실린다. 기록은 검열에서 줄어들 수 있으니 저장할 때 판정한다.
        try {
          await requireSafeContent(resolveRpLLM(loaded.characterName, { userId, sessionId, requestId: opts.requestId, traceId: opts.traceId, ip: opts.ip }),
            { phase: 'input', character: loaded.snapshot.character, input })
        } catch (e) { if (e instanceof UnsafeContentError) return { ok: false, reason: 'safety' }; throw e }
        const wait = (availability.minutesUntilFree ?? 30) + 3 + (loaded.snapshot.turnCount % 9)
        const until = new Date(now.getTime() + wait * 60_000).toISOString()
        const label = availability.label ?? ''
        const row = await db.transaction(async (tx) => {
          const [inserted] = await tx.insert(messages).values({ id: userMessageId, sessionId, role: 'user', kind: 'messenger', content: input, blocks: [], turnIndex: loaded.snapshot.turnCount })
            .returning({ id: messages.id, role: messages.role, kind: messages.kind, content: messages.content, blocks: messages.blocks, turnIndex: messages.turnIndex })
          await tx.update(roleplaySessions).set({ lastInteractionAt: now, pendingRealityIntent: {
            channel: 'message', urgency: 0.9, notBefore: until, answers: 'user_message',
            reason: `${label} 중에 사용자가 문자를 보냈다 — 이제야 보고 답장한다(늦은 것을 어떻게 말할지는 성격대로)`,
          } }).where(eq(roleplaySessions.id, sessionId))
          const delayedOutcome = {
            ok: true as const, requestId: opts.requestId, traceId: opts.traceId, turnIndex: loaded.snapshot.turnCount, blocks: [], responseText: '',
            providerMode: 'live' as const, characterState: loaded.snapshot.characterState!, firedRules: [], realityIntent: null, reality: null,
            newEventType: null, sceneChanged: false, messages: [inserted!], delayed: { until, label },
          }
          // 요청을 끝낸 것으로 남긴다 — 안 하면 15분 동안 'pending' 이라 이 세션의 다음 문자·채팅이 모두 막힌다. 같은 id 재전송은 이 결과를 돌려받는다.
          await tx.update(conversationRequests).set({ status: 'completed', result: delayedOutcome }).where(eq(conversationRequests.id, opts.requestId))
          return delayedOutcome
        })
        observe('messenger.reply_delayed', { sessionId, until, label })
        return row
      }
    }
    const dialogueModelId = model.modelId
    const importance = importanceScore(interactionImportance(input))
    const kind = importance >= .85 ? 'majorEvent' : importance >= .35 ? 'complexEvent' : 'textRP'
    // MIRO basic chat does not draw down the monthly allowance. Everything else the
    // pipeline enforces — request dedupe, AI cost budget, rate limits, safety — still runs.
    let reservation: Reservation | null = null
    if (model.metered) {
      try { reservation = await measured('chat.usage_reserve', () => reserve({ userId, kind, idempotencyKey: `turn:${opts.requestId}` })) }
      catch (e) { if (e instanceof UsageExceededError) return { ok: false, reason: 'usage', error: e }; throw e }
    }
    const refund = () => reservation ? rollback(reservation.reservationId) : Promise.resolve()
    const context = { dialogueModelId, allowEvaluation: consent?.allowEvaluation ?? false, userId, sessionId, requestId: opts.requestId, traceId: opts.traceId, ip: opts.ip, continuity: reservation?.continuity ?? false, usageUnits: reservation?.cost ?? 0 }
    const llm = resolveRpLLM(loaded.characterName, context)
    const turnIndex = loaded.snapshot.turnCount + 1

    let result: TurnResult
    let agency: LoadedAgency | null = null
    try {
      const prepared = await prepareAgencyTurn(sessionId, userId, messenger ? { ...loaded.snapshot, mode: 'messenger' } : loaded.snapshot, llm, { id: userMessageId, text: input })
      agency = prepared.runtime
      result = await timed('provider.llm.turn', { sessionId, mode: llm.info.mode },
        () => runTurn({ llm, snapshot: prepared.snapshot, userInput: input, agency: prepared.agency,
          auxiliaryLLM: reservation?.continuity ? undefined : auxiliaryLLM(loaded.characterName, context),
          // continuity 여유분으로 나가는 턴은 등급과 무관하게 최소한으로 답한다.
          maxOutputTokens: reservation?.continuity ? usagePolicy().continuity.maxOutputTokens : model.tier.maxOutputTokens,
          contextScale: reservation?.continuity ? 1 : model.tier.contextScale,
          auxiliary: reservation?.continuity ? 'planned' : model.tier.auxiliary,
          replyLength: reservation?.continuity ? 'scene' : model.tier.replyLength,
        }))

    } catch (e) {
      await refund()
      if (e instanceof UnsafeContentError) return { ok: false, reason: 'safety' }
      if (e instanceof AIBudgetDeniedError) return { ok: false, reason: 'budget', kind: e.reason as BudgetKind }
      if (e instanceof UsageExceededError) return { ok: false, reason: 'usage', error: e }
      // Only our own stage codes: a DB error message can carry query parameters, i.e. user text.
      const cause = e instanceof Error && /^(agency_[a-z_]+( [a-z_]+)*|ai unavailable after \d+ attempts: [\w .:$-]+|no capable model fits context|selected model cannot handle dialogue context)$/.test(e.message) ? e.message : 'other'
      observe('turn.failed', { sessionId, turn: turnIndex, error: 'generation_failed', cause })
      return { ok: false, reason: 'generation' }
    }

    const { transition } = result
    if (result.agencyShadow) observe('agency.shadow', { sessionId, ...result.agencyShadow })
    // 일반 캐릭터챗은 먼저 연락하지 않는다. 엔진이 의도를 냈더라도 여기서 버린다 —
    // 저장하면 스케줄러가, 남겨두면 inline 이 그것을 실행하기 때문이다.
    if (loaded.experienceType !== 'reality' && transition.realityIntent) {
      observe('reality.intent_dropped_chat', { sessionId, turn: turnIndex })
      transition.realityIntent = null
    }
    if (result.providerMode === 'fallback') {
      await refund()
      observe('provider.llm.fallback', { sessionId, turn: turnIndex })
      return { ok: false, reason: 'generation' }
    }
    // 검증에서 걸러진 항목은 조용히 버리지 않는다 — Provider 품질 신호다.
    if (transition.issues.length > 0) {
      observe('provider.llm.validation_issues', { sessionId, turn: turnIndex, count: transition.issues.length, fields: transition.issues.map((i) => i.field).join(',') })
    }
    if (transition.blocks.length === 0) { await refund(); return { ok: false, reason: 'generation' } }

    // Live Scene v1 (2026-09-19, 명세서 §5.3): 미로(Reality) 세션에서 장소가 실제로 바뀌거나
    // 새 장면이 열리면 스트림에 장소·시간 한 줄을 남긴다. 이미지는 없다 — 이 표시가 전부다.
    const movedTo = transition.worldDelta?.currentLocation ?? null
    const sceneMarker = loaded.experienceType === 'reality' && !messenger
      && (transition.sceneDelta !== null || (movedTo !== null && movedTo !== loaded.snapshot.world.currentLocation))
      ? [movedTo ?? loaded.snapshot.world.currentLocation, transition.worldDelta?.currentTime ?? loaded.snapshot.world.currentTime]
        .filter(Boolean).join(' · ')
      : null

    const responseText = renderBlocks(transition.blocks)
    const outcome: Extract<ConversationOutcome, { ok: true }> = {
      ok: true, requestId: opts.requestId, traceId: opts.traceId, turnIndex, blocks: transition.blocks, responseText,
      providerMode: result.providerMode, characterState: result.characterState, firedRules: result.firedRules,
      realityIntent: transition.realityIntent, reality: null, newEventType: transition.newEvent?.candidate.type ?? null,
      sceneChanged: transition.sceneDelta !== null,
    }
    try {
      const committed = await measured('chat.commit', () => commitTurn({
        reservationId: reservation?.reservationId ?? null, requestId: opts.requestId, requestResult: outcome,
        sessionId, characterId: loaded.characterId, turnIndex,
        userInput: input, userMessageId, responseText, blocks: transition.blocks, transition, sceneMarker, channel: messenger ? 'messenger' : 'scene',
        ...(agency?.mode === 'live' && result.agency ? { agency: { version: agency.version, plan: result.agency.plan } } : {}),
        worldVersion: loaded.snapshot.world.version,
        relationshipVersion: loaded.snapshot.relationship.version,
        currentRelationship: loaded.snapshot.relationship,
        existingMemories: loaded.snapshot.memories,
        characterState: result.characterState,
      }))
      outcome.messages = committed.messages
    } catch (e) {
      await refund()
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
    if (feature('inlineReality') && loaded.experienceType === 'reality' && transition.realityIntent && !transition.realityIntent.notBefore) {
      try {
        const r = await measured('chat.inline_reality', () => evaluateSession(sessionId, new Date(), { inline: true }))
        if (r.outcome === 'sent' && r.text) reality = { channel: r.channel, text: r.text }
        else observe('reality.inline_not_sent', { sessionId, outcome: r.outcome, reason: 'reason' in r ? r.reason : undefined })
      } catch (e) {
        observe('reality.inline_failed', { sessionId, error: (e as Error).message })
      }
    }

    const completed = { ...outcome, reality }
    // 재전송용 결과 갱신과 평가 샘플은 유저가 기다릴 일이 아니다 — 응답을 보낸 뒤에 한다 (요청 밖에서는 그 자리에서).
    await afterResponse(async () => {
      await db.update(conversationRequests).set({ result: completed }).where(eq(conversationRequests.id, opts.requestId)).catch(() => observe('request.cache_update_failed', { requestId: opts.requestId }))
      await captureEvaluation(userId, opts.requestId, { input, response: responseText, context: result.context.system + '\n' + result.context.prompt, promptVersion: result.context.promptVersion, modelId: llm.lastModelId, shadow: llm.shadowOutput }).catch(() => observe('ai.evaluation_capture_failed', { requestId: opts.requestId }))
    })
    return completed

  }
  return { ok: false, reason: 'conflict' }
}

/** Main chat and alpha share ownership, trace and replay protection. */
export async function runConversationTurn(opts: { userId: string; sessionId: string; input: string; ip?: string | null; requestId?: string; chatModel?: string; mode?: 'chat' | 'messenger' }): Promise<ConversationOutcome> {
  if (!opts.input.trim()) return { ok: false, reason: 'empty' }
  if (opts.input.length > MAX_INPUT) return { ok: false, reason: 'too_long' }
  let request
  try { request = await measured('chat.gateway', () => beginRequest(opts.userId, opts.sessionId, opts.chatModel === 'pro' ? opts.input + '\0miro-pro' : opts.input, opts.requestId)) }
  catch (error) { return { ok: false, reason: error instanceof SessionUnavailableError ? error.reason : 'conflict' } }
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
