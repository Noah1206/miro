import { DEFAULT_CHARACTER_STATE } from '@miro/domain'
import { receiveMessenger, MessengerError } from '@/lib/messenger/inbox'
import { resolveChatModel } from '@/lib/ai/chat-models'
import { eq, and } from 'drizzle-orm'
import { db, conversationRequests, characters, messages } from '@miro/db'
import { captureEvaluation } from '@/lib/ai/evaluation'
import { randomUUID } from 'node:crypto'
import { AIBudgetDeniedError, TurnMeter, importanceScore, interactionImportance } from '@miro/providers'
import { beginRequest, failRequest, SessionUnavailableError } from '@/lib/ai/gateway'
import { characterAgencyMode, feature, tokensForCost, POLICY } from '@miro/config'
import { contactBoundaryActive, contactBoundaryDirective, firstMeetingDirective, firstPromiseAt, momentHint, PROMISE_REASON, promisedContact, type CharacterState, type ContactChannel, type RealityIntent } from '@miro/domain'
import { looksLikeRefusal, renderBlocks, resolveTurnPolicy, runTurn, UnsafeContentError, type TurnResult, type TurnStream } from '@miro/engine'
import { loadSession } from './snapshot'
import { commitTurn, StaleStateError, type CommittedMessage } from './commit'
import { afterResponse } from '@/lib/defer'
import { runMemoryJobs } from '@/lib/ai/memory-jobs'
import { resolveRpLLM, auxiliaryLLM } from './mock-llm'
import { UsageExceededError, reserve, rollback, usageStatus, type Reservation } from '@/lib/usage/guard'
import { type BudgetKind } from '@/lib/usage/ai-usage'
import { prepareMoments } from '@/lib/reality/moments'
import { unveilOfferFor } from '@/lib/ops/safety'
import { evaluateSession } from '@/lib/reality/evaluate'
import { track } from '@/lib/analytics/track'
import { measured, observe, timed } from '@/lib/observe'
import { type LoadedAgency } from '@/lib/agency/runtime'
import { prepareAgencyTurn } from '@/lib/agency/turn-context'
import { applyContactBoundaryRequest } from '@/lib/reality/boundary'
import { resolveChatCommand } from './chat-command'
import { chooseSituationImage } from '@/lib/situation-images'

export type ConversationOutcome =
  | {
      ok: true
      requestId: string
      traceId: string
      chatModel?: string
      tokensCharged?: number
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
  | { ok: false; reason: 'not_found' | 'restricted' | 'empty' | 'too_long' | 'generation' | 'conflict' | 'model_unavailable' | 'command_unavailable' }
  /** unveil: 일반 방에서 거절됐고 사용자가 언베일로 이어갈 수 있다(ready=인증·동의 완료, verify=인증·동의가 남음). 권유일 뿐 전환은 사용자가 한다. */
  | { ok: false; reason: 'safety'; unveil?: 'ready' | 'verify' | null }
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
  tokenCeiling?: number
  /** Only scene turns execute here; messenger reception returns before this pipeline. */
  mode?: 'chat'
  /** 캐릭터 명령어 이름 또는 접근 가능한 라이브러리 ID — 이번 턴의 대사에만 적용한다. */
  command?: string
  commandId?: string
  /** 대사를 블록 단위로 받는 대로 보낼 곳(10/9 스트리밍). 저장 전 답이다 — 최종본은 돌려주는 결과다. */
  stream?: TurnStream
}): Promise<ConversationOutcome> {
  const input = opts.input.trim()
  if (input.length === 0) return { ok: false, reason: 'empty' }
  if (input.length > MAX_INPUT) return { ok: false, reason: 'too_long' }
  const { userId, sessionId } = opts
  const userMessageId = randomUUID()

  for (let attempt = 0; attempt < 2; attempt++) {
    // 성인 방은 전용 모델의 가격과 한도를 사용한다.
    const loaded = await measured('chat.snapshot', () => loadSession(sessionId, userId, input))
    if (!loaded) return { ok: false, reason: 'not_found' }
    if (loaded.restricted) return { ok: false, reason: 'restricted' }
    const commandRule = opts.command || opts.commandId ? await resolveChatCommand(userId, loaded.commands, { name: opts.command, sourceId: opts.commandId }) : null
    if ((opts.command || opts.commandId) && !commandRule) return { ok: false, reason: 'command_unavailable' }
    const now = new Date()
    const boundary = await applyContactBoundaryRequest(sessionId, userId, input, opts.requestId, now,
      loaded.snapshot.clock?.timeZone ?? POLICY.reality.defaultTimeZone) ?? loaded.contactBoundary
    loaded.snapshot.contactBoundary = boundary
    const model = await measured('chat.model', () => resolveChatModel(userId, loaded.adult.turn && loaded.adult.since === null && opts.chatModel !== 'pro' ? 'miro' : opts.chatModel ?? 'miro', loaded.adult.turn)).catch(() => null)
    if (!model) return { ok: false, reason: 'model_unavailable' }
    const dialogueModelId = model.modelId
    // 캐릭터의 권장 생각·상황별 사진(10/28). 생각을 높이면 그 깊이만큼 이 턴의 출력 한도·예약을 늘린다 — 생각이 답 자리를 먹거나 예약을 넘어 턴이 실패하지 않게.
    const [charSettings] = await db.select({ rec: characters.recommendedChat, situationImages: characters.situationImages }).from(characters).where(eq(characters.id, loaded.characterId)).limit(1)
    const thinking = charSettings?.rec?.thinking
    const thinkScale = thinking ? { medium: 2, high: 3, xhigh: 4, max: 5 }[thinking] : 1
    // 일반 방에서만 권한다 — 언베일 방의 거절은 갈 곳이 없다.
    const offerUnveil = () => loaded.adult.since === null ? unveilOfferFor(userId, loaded.characterId, sessionId).catch(() => null) : Promise.resolve(null)
    const importance = importanceScore(interactionImportance(input))
    const kind = importance >= .85 ? 'majorEvent' : importance >= .35 ? 'complexEvent' : 'textRP'
    // 정책은 서버가 여기서 한 번 확정한다(§3.1). 등급은 서버가 검증한 선택에서, 경험은 캐릭터에서, 채널은 진입 경로에서 온다.
    const policyInput = { experience: loaded.experienceType, tier: model.tierName, channel: 'scene' as const, agencyMode: characterAgencyMode(sessionId, loaded.policyVersion), memory: 'inline' as const }
    // 모든 대화 모델은 같은 토큰 원장으로 예약·정산한다. 중복 요청과 공급자 원가 제한은 별도로 유지한다.
    let reservation: Reservation | null = null
    const balance = await usageStatus(userId)
    const availableTokens = balance.remaining + balance.rechargeRemaining
    if (availableTokens === 0 && model.quote.maximumTokens > 0) return { ok: false, reason: 'usage', error: new UsageExceededError(balance.plan, balance.resetsAt ?? new Date()) }
    // A small positive balance may still fund a short actual turn. Reserve only the smaller ceiling.
    if (opts.tokenCeiling !== undefined && (!Number.isSafeInteger(opts.tokenCeiling) || opts.tokenCeiling < 0)) return { ok: false, reason: 'model_unavailable' }
    const maximumTokens = Math.min(model.quote.maximumTokens * thinkScale, availableTokens, opts.tokenCeiling ?? Infinity)
    const maximumUSD = Math.min(model.quote.maximumUSD * thinkScale, maximumTokens * model.pricing.revenueKRWPerToken * model.pricing.costShare / model.pricing.fxKRWPerUSD)
    if (resolveTurnPolicy({ ...policyInput, agencyReady: false }).metered) {
      try { reservation = await measured('chat.usage_reserve', () => reserve({ userId, kind, tokenAmount: maximumTokens, idempotencyKey: `turn:${opts.requestId}` })) }
      catch (e) { if (e instanceof UsageExceededError) return { ok: false, reason: 'usage', error: e }; throw e }
    }
    const refund = () => { turnMeter.closed = true; return reservation ? rollback(reservation.reservationId) : Promise.resolve() }
    const turnIndex = loaded.snapshot.turnCount + 1

    let moments: Awaited<ReturnType<typeof prepareMoments>> | undefined
    let result: TurnResult
    let agency: LoadedAgency | null = null
    let policy = resolveTurnPolicy({ ...policyInput, agencyReady: false, continuity: reservation?.continuity ?? false })
    const turnMeter = new TurnMeter(maximumUSD, model.quote.maxInputTokens, model.quote.maxOutputTokens * thinkScale)
    const context = { turnMeter, dialogueModelId, allowEvaluation: false, userId, sessionId, requestId: opts.requestId, traceId: opts.traceId, ip: opts.ip, continuity: reservation?.continuity ?? false, usageUnits: reservation?.cost ?? 0, origin: policy.origin, adult: loaded.adult.turn }
    // 첫 대화(10/19): 가까운 일정 하나를 묻고 끝에 "이따 ~에 문자할게" 를 약속하게 한다 — 약속했으면 그 시각에 실제로 연락이 간다(아래).
    // 대부분 첫 답 하나만 보고 떠나서(7일 45턴/45방), 먼저 연락하는 캐릭터라는 걸 첫 답에서 보여야 한다.
    const firstPromise = loaded.snapshot.turnCount === 0 && loaded.experienceType === 'reality' && !loaded.snapshot.world.narrativeCalendar && !contactBoundaryActive(boundary, now)
      ? firstPromiseAt(now, loaded.snapshot.clock?.timeZone ?? POLICY.reality.defaultTimeZone) : null
    // 성인 방인데 전용 모델이 빠져 있으면 여기서 던진다(메인 모델로 보내지 않음) — 잡아 둔 사용량은 돌려준다.
    let llm: ReturnType<typeof resolveRpLLM>
    try {
      const provider = resolveRpLLM(loaded.characterName, context)
      const directive = contactBoundaryDirective(boundary, now)
      const firstMeeting = firstPromise ? firstMeetingDirective(firstPromise.when) : ''
      // 서버에서 확인한 한 턴 지시. 이번 대사 한 번만 따른다(기억·관계 규칙은 평소대로).
      const commandDirective = commandRule ? `사용자가 명령어 /${commandRule.name} 을 썼습니다. 이번 응답 한 번은 다음 지시대로 씁니다(성격·말투·상황은 그대로): ${commandRule.prompt}` : ''
      // Keep the provider's usage/provenance getters: a spread would freeze or discard them.
      llm = directive || firstMeeting || commandDirective || thinking ? new Proxy(provider, { get(target, key) {
        if (key === 'generateStructured') return (request: Parameters<typeof provider.generateStructured>[0]) => target.generateStructured({ ...request,
          ...(thinking && (request.task === 'dialogue' || request.task === 'agency_plan') ? { thinking: request.thinking ?? thinking, ...(request.maxTokens ? { maxTokens: request.maxTokens * thinkScale } : {}) } : {}),
          system: request.system + (directive ? '\n' + directive : '') + (firstMeeting && request.task === 'dialogue' ? '\n' + firstMeeting : '') + (commandDirective && request.task === 'dialogue' ? '\n' + commandDirective : '') })
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      } }) : provider
    } catch (e) { await refund(); throw e }
    try {
      const prepared = await prepareAgencyTurn(sessionId, userId, loaded.snapshot, llm, { id: userMessageId, text: input }, new Date(), loaded.policyVersion)
      agency = prepared.runtime
      policyInput.agencyMode = characterAgencyMode(sessionId, prepared.policyVersion ?? loaded.policyVersion)
      // 개정판이 준비됐는지는 여기서야 안다 — 정책의 engine 은 준비 상태까지 본 결과다(준비 전이면 legacy 로 보류).
      policy = resolveTurnPolicy({ ...policyInput, agencyReady: prepared.agency?.mode === 'live', continuity: reservation?.continuity ?? false })
      context.origin = policy.origin
      result = await timed('provider.llm.turn', { sessionId, mode: llm.info.mode, engine: policy.engine },
        () => runTurn({ llm, snapshot: prepared.snapshot, userInput: input, agency: prepared.agency, policy, stream: opts.stream,
          auxiliaryLLM: reservation?.continuity ? undefined : auxiliaryLLM(loaded.characterName, context) }))
      // The fallback intent format has no clock tag; it cannot attest real contact from a dated scene.
      if (loaded.snapshot.world.narrativeCalendar && !prepared.agency) result.transition.realityIntent = null
      // Scene dates belong to the story. Do not schedule a real notification for its "tomorrow".
      if (feature('memoryExtraction') && momentHint(input) && !loaded.snapshot.world.narrativeCalendar) {
        moments = await prepareMoments(auxiliaryLLM(loaded.characterName, context), {
          sessionId, input, timeZone: loaded.snapshot.clock?.timeZone ?? POLICY.reality.defaultTimeZone, now: new Date(),
          recent: loaded.snapshot.recentMessages.map(m => ({ who: m.role === 'user' ? 'user' as const : 'character' as const, text: m.content.slice(0, 300) })),
        }).catch(() => undefined)
      }

    } catch (e) {
      await refund()
      if (e instanceof UnsafeContentError) { observe('turn.refused', { sessionId, turn: turnIndex, model: dialogueModelId, by: 'provider' }); return { ok: false, reason: 'safety', unveil: await offerUnveil() } }
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
    // 저장하면 스케줄러가, 남겨두면 inline 이 그것을 실행하기 때문이다. (엔진도 같은 정책으로 막는다 — 두 겹.)
    if (!policy.permissions.proactiveContact && transition.realityIntent) {
      observe('reality.intent_dropped_chat', { sessionId, turn: turnIndex })
      transition.realityIntent = null
    }
    if (firstPromise && !transition.realityIntent && promisedContact(renderBlocks(transition.blocks))) {
      transition.realityIntent = { channel: 'message', reason: PROMISE_REASON, urgency: 0.9, notBefore: firstPromise.at.toISOString(), promise: true }
    }
    // 필터는 통과했지만 캐릭터를 벗어난 거절문 — 대사로 저장하지 않고 공급자 거절과 같이 처리한다(차감 취소, 턴 미저장).
    if (looksLikeRefusal(renderBlocks(transition.blocks))) {
      await refund()
      observe('turn.refused', { sessionId, turn: turnIndex, model: dialogueModelId, by: 'text' })
      return { ok: false, reason: 'safety', unveil: await offerUnveil() }
    }
    if (result.providerMode === 'fallback' || turnMeter.missingSuccessfulUsage) {
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
    const sceneLine = (location: string | null, time: string | null) => [location, time].filter(Boolean).join(' · ')
    const sceneBefore = sceneLine(loaded.snapshot.world.currentLocation, loaded.snapshot.world.currentTime)
    const sceneAfter = sceneLine(movedTo ?? loaded.snapshot.world.currentLocation, transition.worldDelta?.currentTime ?? loaded.snapshot.world.currentTime)
    // 장소·시간이 그대로면 남기지 않는다 — 모델이 sceneDelta 를 매 턴 내면 같은 줄("어딘가 · 저녁")이 턴마다 찍혔다(9/27 운영 실측).
    const sceneMarker = loaded.experienceType === 'reality' && sceneAfter !== sceneBefore
      && (transition.sceneDelta !== null || (movedTo !== null && movedTo !== loaded.snapshot.world.currentLocation))
      ? sceneAfter : null

    turnMeter.closed = true
    const actualTokens = tokensForCost(turnMeter.customerCostUSD, model.pricing)
    if (actualTokens > (reservation?.cost ?? 0)) { await refund(); return { ok: false, reason: 'generation' } }
    const responseText = renderBlocks(transition.blocks)
    // 상황별 사진(10/28) — 만든 사람이 적은 상황이 지금 장면이 됐으면, 이 대화방에서 아직 안 띄운 사진 하나를 답 뒤에 붙인다.
    // 10/31: 싼 분류 모델이 상황 설명을 보고 고른다(실패하면 키워드). 이번 턴 차감 계량기는 이미 닫혔으므로 서비스 예산으로 부른다.
    const situationImages = charSettings?.situationImages ?? []
    const situationImage = situationImages.length === 0 ? null : await chooseSituationImage(
      auxiliaryLLM(loaded.characterName, { ...context, turnMeter: undefined, usageUnits: 0 }), situationImages,
      { userInput: input ?? '', responseText },
      new Set((await db.select({ content: messages.content }).from(messages).where(and(eq(messages.sessionId, sessionId), eq(messages.kind, 'photo')))).map(m => m.content)))
    const outcome: Extract<ConversationOutcome, { ok: true }> = {
      ok: true, requestId: opts.requestId, traceId: opts.traceId, tokensCharged: actualTokens, turnIndex, blocks: transition.blocks, responseText,
      providerMode: result.providerMode, characterState: result.characterState, firedRules: result.firedRules,
      realityIntent: transition.realityIntent, reality: null, newEventType: transition.newEvent?.candidate.type ?? null,
      sceneChanged: transition.sceneDelta !== null,
    }
    try {
      const committed = await measured('chat.commit', () => commitTurn({
        reservationId: reservation?.reservationId ?? null, actualTokens, moments, requestId: opts.requestId, requestResult: outcome,
        sessionId, characterId: loaded.characterId, turnIndex,
        userInput: input, userMessageId, explicit: loaded.adult.turn, responseText, blocks: transition.blocks, transition, sceneMarker, channel: 'scene', situationImage,
        // 리롤(10/27) — 이 턴은 다시 받을 수 있다. 다시 보낼 때 같은 명령어를 붙인다.
        undo: { command: opts.command ?? null, commandId: opts.commandId ?? null },
        ...(agency?.mode === 'live' && result.agency ? { agency: { version: agency.version, plan: result.agency.plan } } : {}),
        worldVersion: loaded.snapshot.world.version,
        relationshipVersion: loaded.snapshot.relationship.version,
        currentRelationship: loaded.snapshot.relationship,
        existingMemories: loaded.snapshot.memories,
        characterState: result.characterState,
        ledger: { policy: result.policy, records: result.records },
        // continuity 턴도 기억은 남긴다 — 후처리는 배경 작업이라 사용자 예산을 더 쓰지 않는다.
        ...(result.policy.memory === 'deferred' ? { memoryJobs: { userId, auxiliary: result.policy.generation.auxiliary } } : {}),
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
    if (feature('inlineReality') && policy.permissions.proactiveContact && transition.realityIntent && !transition.realityIntent.notBefore) {
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
      // 기억 작업은 바로 시도한다. 여기서 유실돼도 DB 의 작업은 남아 크론이 거둔다.
      await runMemoryJobs(new Date(), { sessionId, limit: 2, inline: true }).catch(() => observe('memory.jobs_after_response_failed', { sessionId }))
      // 성인 방의 대화는 평가 표본으로 남기지 않는다 — 표본은 나중에 메인 모델 비교에 쓰인다.
      if (!loaded.adult.turn) await captureEvaluation(userId, opts.requestId, { input, response: responseText, context: result.context.system + '\n' + result.context.prompt, promptVersion: result.context.promptVersion, modelId: llm.lastModelId, shadow: llm.shadowOutput }).catch(() => observe('ai.evaluation_capture_failed', { requestId: opts.requestId }))
    })
    return completed

  }
  return { ok: false, reason: 'conflict' }
}

/** Main chat and alpha share ownership, trace and replay protection. */
export async function runConversationTurn(opts: { userId: string; sessionId: string; input: string; command?: string; commandId?: string; ip?: string | null; requestId?: string; chatModel?: string; tokenCeiling?: number; mode?: 'chat' | 'messenger'; stream?: TurnStream }): Promise<ConversationOutcome> {
  if (opts.mode === 'messenger') {
    const requestId = opts.requestId ?? randomUUID()
    try {
      const message = await receiveMessenger({ ...opts, requestId })
      return { ok: true, requestId, traceId: randomUUID(), turnIndex: 0, blocks: [], responseText: '', providerMode: 'live',
        characterState: DEFAULT_CHARACTER_STATE, firedRules: [], realityIntent: null, reality: null, newEventType: null, sceneChanged: false,
        messages: [{ ...message, turnIndex: 0 }] }
    } catch (error) {
      return { ok: false, reason: error instanceof MessengerError && error.reason !== 'rate_limit' && error.reason !== 'invalid_model' ? error.reason : 'conflict' }
    }
  }
  if (!opts.input.trim()) return { ok: false, reason: 'empty' }
  if (opts.input.length > MAX_INPUT) return { ok: false, reason: 'too_long' }
  let request
  // 같은 글이라도 모델·명령어가 다르면 다른 요청이다(멱등 키).
  const keyed = (opts.chatModel === 'pro' ? opts.input + '\0miro-pro' : opts.chatModel && opts.chatModel !== 'miro' ? opts.input + '\0model:' + opts.chatModel : opts.input) + (opts.command ? '\0cmd:' + opts.command : '') + (opts.commandId ? '\0book:' + opts.commandId : '')
  try { request = await measured('chat.gateway', () => beginRequest(opts.userId, opts.sessionId, keyed, opts.requestId)) }
  catch (error) { return { ok: false, reason: error instanceof SessionUnavailableError ? error.reason : 'conflict' } }
  if (request.cached) return request.cached
  try {
    const result = await executeTurn({ ...opts, mode: 'chat', requestId: request.requestId, traceId: randomUUID() })
    if (!result.ok) await failRequest(request.requestId)
    return result
  } catch {
    await failRequest(request.requestId)
    return { ok: false, reason: 'generation' }
  }
}
