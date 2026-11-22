import { DEFAULT_CHARACTER_STATE, recalledFor, visibleStatValues } from '@miro/domain'
import { receiveMessenger, MessengerError } from '@/lib/messenger/inbox'
import { freeChatTurn, resolveChatModel } from '@/lib/ai/chat-models'
import { rankSituationImages } from '@/lib/situation-ranking'
import { eq, and, sql } from 'drizzle-orm'
import { db, conversationRequests, characters, messages, memories, roleplaySessions } from '@miro/db'
import { captureEvaluation } from '@/lib/ai/evaluation'
import { randomUUID } from 'node:crypto'
import { AIBudgetDeniedError, TurnMeter, importanceScore, interactionImportance } from '@miro/providers'
import { beginRequest, failRequest, SessionUnavailableError } from '@/lib/ai/gateway'
import { characterAgencyMode, feature, tokensForCost, voicePaused, POLICY, MIN_TURN_BALANCE, REFERRAL_GRANT } from '@miro/config'
import { VOICE_TOKENS_MAX, voiceTokens } from '../voice-text'
import { contactBoundaryActive, contactBoundaryDirective, firstMeetingDirective, firstPromiseAt, momentHint, PROMISE_REASON, promisedContact, type CharacterState, type ContactChannel, type RealityIntent } from '@miro/domain'
import { looksLikeBackstageLeak, looksLikeRefusal, renderBlocks, resolveTurnPolicy, runTurn, UnsafeContentError, type TurnResult, type TurnStream } from '@miro/engine'
import { leadName } from '@/lib/editorial/heroine-name'
import { loadSession } from './snapshot'
import { commitTurn, StaleStateError, type CommittedMessage } from './commit'
import { afterResponse } from '@/lib/defer'
import { CHAPTER_LIMIT, compactChapters } from '@/lib/ai/memory-compact'
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
import { endingTitle } from '@/lib/novel-ending'
import { recordEnding } from '@/lib/novel'
import { maybeRewardReferrer } from '@/lib/referral'

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
  | { ok: false; reason: 'not_found' | 'restricted' | 'empty' | 'too_long' | 'generation' | 'conflict' | 'model_unavailable' | 'command_unavailable' | 'command_adult_only' }
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
  /** 11/10 엔딩 분기점에서 사용자가 '엔딩 보기'를 고른 엔딩 이름 — 이번 응답이 그 엔딩의 에필로그가 된다. */
  ending?: string
  /** 11/10 사용자가 출력량 팝업에서 고른 생각 강도 — 없으면 작품 권장값. */
  thinking?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** 11/11 음성 모드가 켜진 방에서 보낸 턴 — 대사마다 숨은 음성 지시를 받는다. */
  voice?: boolean
  /** 대사를 블록 단위로 받는 대로 보낼 곳(10/9 스트리밍). 저장 전 답이다 — 최종본은 돌려주는 결과다. */
  stream?: TurnStream
}): Promise<ConversationOutcome> {
  const input = opts.input.trim()
  if (input.length === 0) return { ok: false, reason: 'empty' }
  if (input.length > MAX_INPUT) return { ok: false, reason: 'too_long' }
  const { userId, sessionId } = opts
  const userMessageId = randomUUID()

  for (let attempt = 0; attempt < 2; attempt++) {
    // 11/16 한 턴의 구간별 시간(turn.timing) — 준비 · 첫 글자 · 첫 블록 · 생성 끝 · 저장 끝. 어디가 느린지 기록으로 가른다.
    const t0 = performance.now(), at = () => Math.round(performance.now() - t0)
    const marks: { model?: number; firstText?: number; firstBlock?: number; generated?: number } = {}
    // 성인 방은 전용 모델의 가격과 한도를 사용한다.
    const loaded = await measured('chat.snapshot', () => loadSession(sessionId, userId, input))
    if (loaded) loaded.snapshot.voiceOut = !!opts.voice
    if (!loaded) return { ok: false, reason: 'not_found' }
    if (loaded.restricted) return { ok: false, reason: 'restricted' }
    const commandRule = opts.command || opts.commandId ? await resolveChatCommand(userId, loaded.commands, { name: opts.command, sourceId: opts.commandId }) : null
    if ((opts.command || opts.commandId) && !commandRule) return { ok: false, reason: 'command_unavailable' }
    const endingRule = opts.ending ? loaded.snapshot.character.worldRole.endings?.find(e => e.name === opts.ending) : undefined
    // 11/5: 설명이 [언베일] 로 시작하는 명령어(색마모드 등)는 언베일이 켜진 방에서만 실행한다.
    if (commandRule?.hint.startsWith('[언베일]') && !loaded.adult.turn) return { ok: false, reason: 'command_adult_only' }
    const now = new Date()
    const boundary = await applyContactBoundaryRequest(sessionId, userId, input, opts.requestId, now,
      loaded.snapshot.clock?.timeZone ?? POLICY.reality.defaultTimeZone) ?? loaded.contactBoundary
    loaded.snapshot.contactBoundary = boundary
    // 11/3: 언베일 턴도 고른 모델 그대로(언베일 쪽 짝으로 보낸다). 짝이 없으면 기본 모델로.
    const model = await measured('chat.model', () => resolveChatModel(userId, opts.chatModel ?? 'miro', loaded.adult.turn)
      .catch(() => loaded.adult.turn ? resolveChatModel(userId, 'miro', true) : Promise.reject(new Error('invalid chat model')))).catch(() => null)
    if (!model) return { ok: false, reason: 'model_unavailable' }
    const dialogueModelId = model.modelId
    // 캐릭터의 권장 생각·상황별 사진(10/28). 생각을 높이면 그 깊이만큼 이 턴의 출력 한도·예약을 늘린다 — 생각이 답 자리를 먹거나 예약을 넘어 턴이 실패하지 않게.
    const [charSettings] = await db.select({ rec: characters.recommendedChat, situationImages: characters.situationImages }).from(characters).where(eq(characters.id, loaded.characterId)).limit(1)
    // 11/18 사진이 30장을 넘는 작품 — 최근 대화와 뜻이 가까운 순서를 미리 계산해 둔다(모델 준비와 겹쳐 돌고, 실패하면 엔진이 글자 겹침으로).
    // 11/23 사용자: 옷은 벗은 → 입은 사진으로 되돌아가면 안 된다 — 이 방에서 마지막으로 보인 상황 사진의 순번(엔진 keepOutfitOrder).
    const lastPhotoIndex = db.select({ content: messages.content }).from(messages)
      .where(and(eq(messages.sessionId, loaded.sessionId), eq(messages.kind, 'photo'), sql`${messages.hiddenAt} is null`)).orderBy(sql`${messages.createdAt} desc`).limit(1)
      .then(([m]) => { const path = m?.content.split('?')[0]; const i = path ? (charSettings?.situationImages ?? []).findIndex(e => e.image?.split('?')[0] === path) : -1; return i >= 0 ? i : null }).catch(() => null)
    const situationRanking = rankSituationImages(charSettings?.situationImages ?? [], [...loaded.snapshot.recentMessages.slice(-4).map(m => m.content), input].join('\n')).catch(() => null)
    // 11/16 생각 강도는 3단계(빠름·보통·깊게) — 예전 '깊게·최대'(xhigh·max)는 Sonnet 에서 답 없이 잘렸다. 생각이 먹지 않는 모델(DeepSeek 등)은 무시한다.
    const wanted = opts.thinking ?? charSettings?.rec?.thinking
    const thinking = model.thinking && wanted ? (wanted === 'xhigh' || wanted === 'max' ? 'high' as const : wanted) : undefined
    const thinkScale = thinking ? ({ low: 1, medium: 2, high: 3, xhigh: 4, max: 5 } as const)[thinking] ?? 1 : 1
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
    // 11/16 음성 모드 턴은 읽는 대사만큼 더 받는다 — 모델 몫(maximumTokens) 위에 음성 몫을 따로 예약한다.
    const voiceOn = !!opts.voice && feature('characterVoice') && !voicePaused()
    // 11/19 오픈 이벤트 무료 턴 — 잔액 검사·예약·차감 없이(잔액 0 이어도 대화). 사용자별 하루 AI 호출 한도(AI_USER_DAILY_LIMIT)는 그대로 걸린다.
    const free = !voiceOn && freeChatTurn(dialogueModelId, now.getTime())
    // 11/10 사용자: 잔액이 500 미만이면 대화를 시작하지 않는다(하루 무료 1,500 은 자정에 다시 채워진다).
    if (!free && availableTokens < MIN_TURN_BALANCE && model.quote.maximumTokens > 0) return { ok: false, reason: 'usage', error: new UsageExceededError(balance.plan, balance.resetsAt ?? new Date()) }
    // A small positive balance may still fund a short actual turn. Reserve only the smaller ceiling.
    if (opts.tokenCeiling !== undefined && (!Number.isSafeInteger(opts.tokenCeiling) || opts.tokenCeiling < 0)) return { ok: false, reason: 'model_unavailable' }
    const maximumTokens = Math.min(Math.max(model.quote.maximumTokens * thinkScale, model.floorTokens), free ? Infinity : availableTokens, opts.tokenCeiling ?? Infinity)
    const maximumUSD = Math.min(model.quote.maximumUSD * thinkScale, maximumTokens * model.pricing.revenueKRWPerToken * model.pricing.costShare / model.pricing.fxKRWPerUSD)
    if (!free && resolveTurnPolicy({ ...policyInput, agencyReady: false }).metered) {
      try { reservation = await measured('chat.usage_reserve', () => reserve({ userId, kind, tokenAmount: Math.min(maximumTokens + (voiceOn ? VOICE_TOKENS_MAX : 0), availableTokens), idempotencyKey: `turn:${opts.requestId}` })) }
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
    // 11/6 사용자: 첫 답에만 붙이니 한창인 장면에서도 튀었다 → 첫 대화 동안(둘째~여섯째 답) 장면이 한숨 돌린 때 한 번. 이미 약속했으면 그만.
    // 첫 답은 인트로가 깔아 둔 장면 한가운데라 붙이지 않는다 — 조건을 달아도 모델이 첫 답에서 거의 늘 약속했다(11/6 운영 확인 4/4).
    const promised = loaded.snapshot.recentMessages.some(m => m.role === 'character' && promisedContact(m.content))
    const firstPromise = loaded.snapshot.turnCount >= 1 && loaded.snapshot.turnCount < 6 && !promised && loaded.experienceType === 'reality' && !loaded.snapshot.world.narrativeCalendar && !contactBoundaryActive(boundary, now)
      ? firstPromiseAt(now, loaded.snapshot.clock?.timeZone ?? POLICY.reality.defaultTimeZone) : null
    // 성인 방인데 전용 모델이 빠져 있으면 여기서 던진다(메인 모델로 보내지 않음) — 잡아 둔 사용량은 돌려준다.
    let llm: ReturnType<typeof resolveRpLLM>
    try {
      const provider = resolveRpLLM(loaded.characterName, context)
      const directive = contactBoundaryDirective(boundary, now)
      const firstMeeting = firstPromise ? firstMeetingDirective(firstPromise.when) : ''
      // 서버에서 확인한 한 턴 지시. 이번 대사 한 번만 따른다(기억·관계 규칙은 평소대로).
      const commandDirective = commandRule ? `사용자가 명령어 /${commandRule.name} 을 썼습니다. 이번 응답 한 번은 다음 지시대로 씁니다(성격·말투·상황은 그대로): ${commandRule.prompt}`
        : endingRule ? `사용자가 엔딩 '${endingRule.name}' 을 보기로 골랐습니다. 이번 응답은 그 엔딩의 에필로그입니다 — 지금까지의 대화를 바탕으로 이야기를 그 결말로 맺는 장면을 쓰고(조건: ${endingRule.condition}${endingRule.epilogue ? ` · 분위기: ${endingRule.epilogue}` : ''}), 마지막 블록을 narrative 로 하고 text 를 정확히 \`— ENDING · ${endingRule.name} —\` 로 씁니다. 사용자의 입력('엔딩 보기')은 대사가 아니라 이 선택입니다.` : ''
      // Keep the provider's usage/provenance getters: a spread would freeze or discard them.
      llm = directive || firstMeeting || commandDirective || thinking ? new Proxy(provider, { get(target, key) {
        if (key === 'generateStructured') return (request: Parameters<typeof provider.generateStructured>[0]) => target.generateStructured({ ...request,
          ...(thinking && (request.task === 'dialogue' || request.task === 'agency_plan') ? { thinking: request.thinking ?? thinking, ...(request.maxTokens ? { maxTokens: request.maxTokens * thinkScale } : {}) } : {}),
          // 11/16 캐시 배치(promptPrefix)인 요청은 이 턴 지시를 지시문이 아니라 입력 끝에 붙인다 — 지시문이 턴마다 달라지면 그 뒤의 최근 대화 캐시가 통째로 깨진다.
          ...((extra => request.promptPrefix ? { prompt: request.prompt + (extra ? '\n\n## 서버가 확인한 이번 턴 지시' + extra : '') } : { system: request.system + extra })(
            (directive ? '\n' + directive : '') + (firstMeeting && request.task === 'dialogue' ? '\n' + firstMeeting : '') + (commandDirective && request.task === 'dialogue' ? '\n' + commandDirective : ''))) })
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      } }) : provider
    } catch (e) { await refund(); throw e }
    try {
      const prepared = await prepareAgencyTurn(sessionId, userId, loaded.snapshot, llm, { id: userMessageId, text: input }, new Date(), loaded.policyVersion)
      agency = prepared.runtime
      policyInput.agencyMode = characterAgencyMode(sessionId, prepared.policyVersion ?? loaded.policyVersion)
      // 개정판이 준비됐는지는 여기서야 안다 — 정책의 engine 은 준비 상태까지 본 결과다(준비 전이면 legacy 로 보류).
      // 11/10: 여유분 턴은 보조 모델을 안 넘기므로 기억은 배경 작업으로 — 전엔 inline 이라 그 턴의 기억이 아예 안 남았다.
      policy = resolveTurnPolicy({ ...policyInput, agencyReady: prepared.agency?.mode === 'live', continuity: reservation?.continuity ?? false, memory: reservation?.continuity ? 'deferred' : 'inline' })
      context.origin = policy.origin
      // 계산은 위에서 미리 시작했다 — 여기선 길어야 1.5초만 더 기다리고, 넘으면 이번 턴은 글자 겹침으로(답을 늦추지 않게).
      const ranking = await Promise.race([situationRanking, new Promise<null>(r => setTimeout(() => r(null), 1500))])
      if (ranking) prepared.snapshot.situationRanking = ranking
      prepared.snapshot.lastPhotoIndex = await lastPhotoIndex
      marks.model = at()
      // 11/20 스트리밍 사진 — 엔진은 순번만 안다, 주소는 여기서 붙인다.
      const photoUrl = (i: number) => charSettings?.situationImages?.[i]?.image
      const stream = opts.stream && { ...opts.stream, onFirstText: () => { marks.firstText ??= at() }, onBlocks: (blocks: Parameters<TurnStream['onBlocks']>[0]) => { marks.firstBlock ??= at(); opts.stream!.onBlocks(blocks) },
        onPhotos: (photos: Parameters<NonNullable<TurnStream['onPhotos']>>[0]) => opts.stream!.onPhotos?.(photos.flatMap(p => { const url = photoUrl(p.index); return url ? [{ ...p, url }] : [] })) }
      result = await timed('provider.llm.turn', { sessionId, mode: llm.info.mode, engine: policy.engine },
        () => runTurn({ llm, snapshot: prepared.snapshot, userInput: input, agency: prepared.agency, policy, stream,
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

    marks.generated = at()
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
    // 필터는 통과했지만 캐릭터를 벗어난 거절문 — 대사로 저장하지 않고 차감을 취소한다(턴 미저장).
    // 11/4 사용자 요청: '안전 차단'으로 안내하지 않고 평범한 생성 실패로 — 같은 말을 다시 보내면 새로 받는다(언베일 안내도 붙이지 않는다).
    if (looksLikeRefusal(renderBlocks(transition.blocks))) {
      await refund()
      observe('turn.refused', { sessionId, turn: turnIndex, model: dialogueModelId, by: 'text' })
      return { ok: false, reason: 'generation' }
    }
    // 11/12 개발 정보(모델·그림 학습 등)가 대사로 새면 저장하지 않는다 — 같은 말을 다시 보내면 새로 받는다.
    if (looksLikeBackstageLeak(renderBlocks(transition.blocks))) {
      await refund()
      observe('turn.backstage_leak', { sessionId, turn: turnIndex, model: dialogueModelId })
      return { ok: false, reason: 'generation' }
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
    const costTokens = tokensForCost(turnMeter.customerCostUSD, model.pricing)
    if (costTokens > (reservation || free ? maximumTokens : 0)) { await refund(); return { ok: false, reason: 'generation' } }
    // 11/14 사용자: 한 턴 최소 차감은 모델별(floorTokens) — 검증 없는 언베일 방도 같은 모델이면 일반 방과 같은 최소(예약 안에서만).
    const actualTokens = reservation ? Math.min(Math.min(Math.max(costTokens, model.floorTokens), maximumTokens) + (voiceOn ? voiceTokens(transition.blocks as Array<Record<string, unknown>>) : 0), reservation.cost) : free ? 0 : costTokens
    // 11/21 사용자: 1:1 공식 작품은 인물 이름 칸이 작품 제목이라 저장 글이 '작품 제목: 대사' 였다 — 작품 안 인물 이름(leadName)이 따로 있으면
    // 주인공 대사 앞의 제목을 뗀다(화면 말풍선은 블록으로 그려 원래 인물 이름, 이 글은 목록 미리보기·알림·기록용).
    const titleName = loaded.snapshot.character.identity.name
    const lead = leadName({ name: titleName, secret: loaded.snapshot.character.personality.secret, personality: loaded.snapshot.character.personality.personality, cast: loaded.snapshot.character.worldRole.cast })
    const rendered = renderBlocks(transition.blocks)
    const responseText = lead !== titleName ? rendered.split('\n').map(line => line.startsWith(`${titleName}: `) ? line.slice(titleName.length + 2) : line).join('\n') : rendered
    // 11/19 사용자: 상태창 형식이 있는 작품은 매 턴 상태창이 꼭 보인다 — AI 가 status 를 빠뜨리면 이 방의 직전 상태창을 그대로 잇는다.
    const status = transition.status?.trim() || (loaded.snapshot.character.worldRole.lastStatus ?? null)
    // 상황별 사진 — 11/18 바베챗식: 답을 쓰는 AI 가 지금 장면의 사진 코드를 직접 고른다(images, 한 답에 최대 2장, 같은 사진 재사용 가능).
    // 예전엔 답 뒤에 분류 AI 를 한 번 더 불러 한 장만, 방에서 한 번 띄운 사진은 다시 안 썼다. 순번·허용(언베일 전용)은 엔진 검증기가 이미 걸렀다.
    const sceneImages = charSettings?.situationImages ?? []
    // 11/18 사용자: 답 중간, AI 가 고른 블록 바로 뒤에(after = 저장 블록의 1부터 센 번호, null 이면 답 끝).
    const situationImages = (transition.images ?? []).flatMap((i, k) => { const url = sceneImages[i]?.image; return url ? [{ url, after: transition.imagesAfter?.[k] ?? null }] : [] })
    // 11/20 저장 전 마지막으로 확정 자리를 한 번 더 — 스트리밍 중 못 정한 사진(답 끝 등)도 저장본과 같은 자리에 미리 뜬다.
    opts.stream?.onPhotos?.((transition.images ?? []).map((index, k) => ({ index, after: transition.imagesAfter?.[k] ?? null, url: sceneImages[index]?.image })).filter(p => p.url))
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
        userInput: input, userMessageId, explicit: loaded.adult.turn, responseText, blocks: withStatus(transition.blocks, status, transition.statValues ? visibleStatValues(loaded.snapshot.character.worldRole.stats ?? [], transition.statValues) : null) as typeof transition.blocks, transition, sceneMarker, channel: 'scene', situationImages,
        // 리롤(10/27) — 이 턴은 다시 받을 수 있다. 다시 보낼 때 같은 명령어를 붙인다.
        undo: { command: opts.command ?? null, commandId: opts.commandId ?? null, voice: voiceOn },
        ...(agency?.mode === 'live' && result.agency ? { agency: { version: agency.version, plan: result.agency.plan } } : {}),
        worldVersion: loaded.snapshot.world.version,
        relationshipVersion: loaded.snapshot.relationship.version,
        currentRelationship: loaded.snapshot.relationship,
        existingMemories: loaded.snapshot.memories,
        characterState: result.characterState,
        ...(transition.statValues ? { statValues: transition.statValues } : {}),
        ledger: { policy: result.policy, records: result.records },
        // continuity 턴도 기억은 남긴다 — 후처리는 배경 작업이라 사용자 예산을 더 쓰지 않는다.
        ...(result.policy.memory === 'deferred' ? { memoryJobs: { userId, auxiliary: result.policy.generation.auxiliary } } : {}),
      }))
      outcome.messages = committed.messages
      observe('turn.timing', { sessionId, turn: turnIndex, model: dialogueModelId, prepMs: marks.model, firstTextMs: marks.firstText, firstBlockMs: marks.firstBlock, generatedMs: marks.generated, totalMs: at(), chars: responseText.length })
    } catch (e) {
      await refund()
      // 다른 요청이 먼저 커밋했다. 최신 상태로 한 번 더 시도한다.
      if (e instanceof StaleStateError && attempt === 0) { observe('state.stale_retry', { sessionId, turn: turnIndex }); continue }
      observe('state.commit_failed', { sessionId, turn: turnIndex, error: (e as Error).message })
      return { ok: false, reason: 'conflict' }
    }

    // 11/18 추천인 보상 — 친구(이 사용자)가 대화 3턴에 닿으면 추천인에게 한 번(추천받지 않았으면 아무 일 없음).
    if (turnIndex >= REFERRAL_GRANT.afterTurns) void afterResponse(() => maybeRewardReferrer(userId))
    // 11/18 기억 노트 '떠올린 기억' — 지시문에 실린 기억 중 이번 입력과 실제로 맞은 것(최근 30턴, 새것이 앞).
    const recalled = recalledFor(loaded.snapshot.memories.filter(m => m.type !== 'short_term_summary'), sessionId, POLICY.context.relevantMemoryCount, input).map(m => m.id)
    if (recalled.length) void afterResponse(async () => {
      const entry = JSON.stringify([{ turn: turnIndex, at: new Date().toISOString(), input: input.slice(0, 80), ids: recalled }])
      await db.update(roleplaySessions).set({ memoryRecalls: sql`(select coalesce(jsonb_agg(e order by n), '[]'::jsonb) from jsonb_array_elements(${entry}::jsonb || ${roleplaySessions.memoryRecalls}) with ordinality t(e, n) where n <= 30)` })
        .where(eq(roleplaySessions.id, sessionId))
    })

    void track(userId, 'rp_message_sent', {
      sessionId, turn: turnIndex, mood: result.characterState.mood, provider: result.providerMode,
      semantic: result.semanticEvents.map((e) => e.type).join(','), rules: result.firedRules.join(','),
    })
    if (transition.newEvent) void track(userId, 'event_triggered', { sessionId, type: transition.newEvent.candidate.type })
    if (transition.sceneDelta) void track(userId, 'scene_changed', { sessionId })
    // 11/10 긴 맥락: 채팅방 요약 턴도 지난 이야기가 쌓이면 묶는다(전엔 배경 작업 경로만 묶었다). 응답 뒤에, 실패해도 턴은 끝난 것이다.
    if (transition.memories.some(m => m.type === 'short_term_summary')) void afterResponse(async () => {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(memories).where(and(eq(memories.sessionId, sessionId), eq(memories.type, 'chapter')))
      if ((row?.n ?? 0) > CHAPTER_LIMIT) await compactChapters(sessionId, userId).catch(e => observe('memory.compact_failed', { sessionId, error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }))
    })
    // 11/9 웹소설: AI 가 결말 표식을 쓴 턴 — 처음 결말만 남기고 기록한다.
    const ending = endingTitle(transition.blocks)
    if (ending) await recordEnding(sessionId, userId, ending, turnIndex)
      .then(first => { if (first) void track(userId, 'story_ending', { sessionId, title: ending }) })
      .catch(() => observe('novel.ending_record_failed', { sessionId }))

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
export async function runConversationTurn(opts: { userId: string; sessionId: string; input: string; command?: string; commandId?: string; ending?: string; thinking?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; voice?: boolean; ip?: string | null; requestId?: string; chatModel?: string; tokenCeiling?: number; mode?: 'chat' | 'messenger'; stream?: TurnStream }): Promise<ConversationOutcome> {
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
  const keyed = (opts.chatModel === 'pro' ? opts.input + '\0miro-pro' : opts.chatModel && opts.chatModel !== 'miro' ? opts.input + '\0model:' + opts.chatModel : opts.input) + (opts.command ? '\0cmd:' + opts.command : '') + (opts.commandId ? '\0book:' + opts.commandId : '') + (opts.ending ? '\0ending:' + opts.ending : '') + (opts.thinking ? '\0think:' + opts.thinking : '')
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

/**
 * 11/10 상태창 — 저장할 블록 끝에 상태 블록을 붙인다. 말풍선(reply-segments)·대화 기록(character-context)은 이 종류를 걸러 내고,
 * 대화 화면이 접히는 카드로 따로 그린다. 스트리밍 중엔 안 보이고 저장된 메시지가 오면 나타난다.
 */
function withStatus<T extends Record<string, unknown>>(blocks: T[], status: string | null, stats: Record<string, number> | null): Array<T | { type: 'status'; text: string; stats?: Record<string, number> }> {
  if (!status && !stats) return blocks
  return [...blocks, { type: 'status' as const, text: status ?? '', ...(stats ? { stats } : {}) }]
}
