import { castNames, relevantSituationImages } from './context'
import { trimEllipsisHabit, trimPenalizedSentences } from './conversation-repetition'
import { POLICY } from '@miro/config'
import { allowedBlockTypes, clampStatValues, validateNpcKnowledge, selectEvent, filterSalient } from '@miro/domain'
import type { RelationshipDelta, EventCandidate, MemoryCandidate, Npc, RealityIntent, SimulationEvent } from '@miro/domain'
import type { SimulationProposal } from './proposal.schema'
import type { SimulationSnapshot } from './context'

export type ValidationIssue = {
  field: string
  reason: string
}

/** 검증을 통과한, 실제로 적용할 변경분. */
export type ValidatedTransition = {
  blocks: SimulationProposal['rp']['blocks']
  worldDelta: { currentLocation?: string; currentTime?: string; worldStatus?: string } | null
  relationshipDelta: RelationshipDelta
  sceneDelta: SimulationProposal['sceneDelta']
  memories: MemoryCandidate[]
  newEvent: { candidate: EventCandidate; score: number } | null
  eventUpdates: SimulationProposal['eventUpdates']
  npcIntroductions: SimulationProposal['npcIntroductions']
  npcActions: SimulationProposal['npcActions']
  realityIntent: RealityIntent | null
  emotion: SimulationProposal['emotion']
  intent: SimulationProposal['intent']
  /** 11/10 상태창 글(작품에 형식이 있을 때만) */
  status?: string | null
  /** 11/10 범위로 자른 이번 턴 뒤 스탯 값(작품에 스탯이 있을 때만) */
  statValues?: Record<string, number> | null
  /** 11/18 이번 장면에 띄울 상황별 사진의 순번(0부터) — 작품 목록에 있고 이 방에서 허용된 것만, 최대 2장. */
  images?: number[]
  /** 11/18 images 와 같은 자리마다: 검증된 blocks 의 몇 번째 블록(1부터) 뒤에 넣는지. null 이면 답 끝. */
  imagesAfter?: Array<number | null>
  issues: ValidationIssue[]
}

/**
 * AI 제안을 검증한다.
 *
 * Application Layer 가 최종 권한을 갖는다 — 스키마를 통과했다는 이유만으로
 * 상태를 바꾸지 않는다. 존재하지 않는 NPC, 과도한 delta, 쿨다운 중인 사건은
 * 전체를 실패시키는 대신 해당 항목만 버리고 이유를 남긴다.
 */
export function validateProposal(
  proposal: SimulationProposal,
  snapshot: SimulationSnapshot,
): ValidatedTransition {
  const issues: ValidationIssue[] = []
  const blocks = validateBlocks(proposal, snapshot, issues)
  const told = blocks.map(b => b.text).join('\n')
  const photos = keepOutfitOrder(sceneImages(snapshot, proposal.images), snapshot, told)
  // 11/23 사용자 "왜 사진이 한 번도 안 나오는 경우가 있어": AI 가 images 를 빠뜨리거나 쓸 수 없는 코드만 내면 0장이었다 —
  // 고를 수 있는 사진이 있으면 지금 대화와 가장 가까운 것으로 최소 장수(3, 블록이 적으면 블록 수)를 채운다(옷차림 순서도 지킨다).
  if (!photos.length && blocks.length) {
    const need = Math.min(3, blocks.length)
    keepOutfitOrder(relevantSituationImages(snapshot).map(e => ({ index: e.i, after: null })), snapshot, told).slice(0, need)
      .forEach((e, k) => photos.push({ index: e.index, after: Math.max(1, Math.round(blocks.length * (k + 1) / (need + 1))), fill: true }))
  }

  return {
    blocks,
    worldDelta: validateWorldDelta(proposal, issues),
    relationshipDelta: validateRelationshipDelta(proposal, issues),
    sceneDelta: proposal.sceneDelta,
    memories: validateMemories(proposal, issues),
    newEvent: validateEvent(proposal, snapshot, issues),
    eventUpdates: validateEventUpdates(proposal, snapshot, issues),
    npcIntroductions: validateNpcIntroductions(proposal, snapshot, issues),
    npcActions: validateNpcActions(proposal, snapshot.activeNpcs, issues),
    realityIntent: proposal.realityIntent,
    emotion: proposal.emotion,
    intent: proposal.intent,
    status: snapshot.character.worldRole.statusFormat?.trim() && proposal.status?.trim() ? proposal.status.trim() : null,
    statValues: snapshot.character.worldRole.stats?.length ? clampStatValues(snapshot.character.worldRole.stats, snapshot.statValues ?? {}, proposal.statValues) : null,
    ...spreadPhotos(photos.map(p => p.index), blocks.length, photos.map((p) => {
      // 서버가 채운 사진은 정해 둔 자리(FILL_SLOTS, 저장 블록 기준) — 스트리밍 중에도 같은 자리에 먼저 보여 줄 수 있게. 답이 짧아 넘치면 답 끝.
      if (p.fill) return p.after !== null && p.after < blocks.length ? p.after : null
      if (p.after === null) return null
      const kept = allowedBlocks(proposal.rp.blocks.slice(0, p.after), snapshot).length
      return kept >= 1 && kept < blocks.length ? kept : null
    })),
    issues,
  }
}

/**
 * 11/21 사용자: 사진은 글 → 사진 → 글. 두 장이 한자리(연달아)거나 답 끝(뒤에 글 없음)이면 안 된다.
 * 자리(after, 1부터 센 블록 번호)는 1..n-1 에서 사진마다 다르게 — 자리가 없거나 겹치면 가장 가까운 빈자리로, 빈자리가 없으면 그 사진은 뺀다.
 * 블록이 하나뿐인 답은 뒤에 글을 둘 수 없어 첫 사진 한 장만 답 끝에.
 */
export function spreadPhotos(images: number[], n: number, after: Array<number | null>): { images: number[]; imagesAfter: Array<number | null> } {
  const out = { images: [] as number[], imagesAfter: [] as Array<number | null> }
  if (n < 2) { if (images.length) { out.images.push(images[0]!); out.imagesAfter.push(null) } return out }
  const used = new Set<number>()
  images.forEach((index, k) => {
    const want = Math.min(Math.max(after[k] ?? n - 1, 1), n - 1)
    for (let d = 0; d < n; d++) for (const c of [want - d, want + d]) {
      if (c >= 1 && c <= n - 1 && !used.has(c)) { used.add(c); out.images.push(index); out.imagesAfter.push(c); return }
    }
  })
  return out
}

/** 스트리밍 중인 대사 블록을 최종 검증과 같은 규칙으로 거른다(10/9) — 보여 준 블록이 저장 때 빠지는 일을 줄인다. */
export function allowedBlocks(blocks: SimulationProposal['rp']['blocks'], s: SimulationSnapshot): SimulationProposal['rp']['blocks'] {
  return validateBlocks({ rp: { blocks } } as SimulationProposal, s, [])
}

/** 화자가 등장인물과 맞는지, 사용자를 대신 연기하지 않는지 확인한다. */
function validateBlocks(
  p: SimulationProposal,
  s: SimulationSnapshot,
  issues: ValidationIssue[],
): SimulationProposal['rp']['blocks'] {
  // 대형 세계관 하렘(11/3): [여러 인물] 의 히로인도 말할 수 있다.
  // 11/11 다인 작품의 함께 나오는 인물도.
  const cast = new Set(castNames(s.character))
  const known = new Set([s.character.identity.name, ...s.activeNpcs.map((n) => n.name), ...cast])
  const allowed = allowedBlockTypes(s.mode ?? 'chat')

  // 11/4 벌점 방식: 상투 표현·턴마다 되풀이된 몸짓·소품 문장을 서술·행동에서 지운다(대사는 그대로). 스트리밍과 저장이 같은 결과를 낸다.
  // 11/17 말줄임표 말버릇 — 설정 말투(말투·성격·인물 소개)에 말줄임표가 없는 인물의 대사만 다듬는다.
  const ellipsis = /…|\.{3}/
  const castIntro = new Map((s.character.worldRole.cast ?? []).map(p => [p.name, p.intro]))
  const ownVoice = `${s.character.personality.speechStyle ?? ''} ${s.character.personality.personality}`
  const keepEllipsis = (speaker: string | null | undefined) => ellipsis.test(speaker && castIntro.has(speaker) ? castIntro.get(speaker)! : ownVoice)
  return trimEllipsisHabit(trimPenalizedSentences(p.rp.blocks.filter((b) => {
    // 전화 중에는 서술할 화면이 없다. 모드에 맞지 않는 블록은 버린다.
    if (!allowed.has(b.type)) {
      issues.push({ field: 'rp.blocks', reason: `${b.type} not allowed in ${s.mode ?? 'chat'}` })
      return false
    }
    // An inner voice belongs to this character alone. Other people's minds are not the character's knowledge.
    // 여러 인물 카드(11/6)는 이 카드가 연기하는 히로인 자신의 속마음까지만.
    if (b.type === 'thought' && b.speaker && b.speaker !== s.character.identity.name && !cast.has(b.speaker)) {
      issues.push({ field: 'rp.blocks', reason: 'thought of someone else' })
      return false
    }
    if (b.type === 'dialogue' || b.type === 'npc') {
      if (!b.speaker) {
        issues.push({ field: 'rp.blocks', reason: `${b.type} block has no speaker` })
        return false
      }
      // AI 가 사용자를 대신 연기하는 것을 막는다.
      if (b.speaker === '사용자' || b.speaker.toLowerCase() === 'user') {
        issues.push({ field: 'rp.blocks', reason: 'block speaks for the user' })
        return false
      }
      if (!known.has(b.speaker)) {
        issues.push({ field: 'rp.blocks', reason: `unknown speaker: ${b.speaker}` })
        return false
      }
    }
    return true
  }), s.recentMessages ?? [], s.character.identity.name), keepEllipsis)
}

function validateWorldDelta(
  p: SimulationProposal,
  issues: ValidationIssue[],
): ValidatedTransition['worldDelta'] {
  if (!p.worldDelta) return null
  const d = p.worldDelta
  const out: ValidatedTransition['worldDelta'] = {}
  if (d.currentLocation?.trim()) out.currentLocation = d.currentLocation.trim()
  if (d.currentTime?.trim()) out.currentTime = d.currentTime.trim()
  if (d.worldStatus?.trim()) out.worldStatus = d.worldStatus.trim()
  if (Object.keys(out).length === 0) {
    issues.push({ field: 'worldDelta', reason: 'empty after trimming' })
    return null
  }
  return out
}

/**
 * 관계 delta 검증.
 * 스키마는 ±100 까지 허용하지만 정책 상한은 그보다 훨씬 좁다.
 * 상한을 넘는 값은 버리지 않고 clamp 한다 — 방향성은 AI 판단을 존중하되 폭만 제한한다.
 */
function validateRelationshipDelta(
  p: SimulationProposal,
  issues: ValidationIssue[],
): ValidatedTransition['relationshipDelta'] {
  const out: RelationshipDelta = {}
  if (!p.relationshipDelta) return out

  const limit = POLICY.relationship.deltaClampPerTurn
  const dims = [
    'trust', 'attraction', 'jealousy',
    'protectiveness', 'emotionalDistance', 'attachment',
  ] as const

  for (const dim of dims) {
    const v = p.relationshipDelta[dim]
    if (v === undefined) continue
    if (Math.abs(v) > limit) {
      issues.push({ field: `relationshipDelta.${dim}`, reason: `clamped from ${v}` })
    }
    out[dim] = Math.max(-limit, Math.min(limit, v))
  }

  if (p.relationshipDelta.stage) out.stage = p.relationshipDelta.stage
  return out
}

function validateMemories(
  p: SimulationProposal,
  issues: ValidationIssue[],
): MemoryCandidate[] {
  const kept = filterSalient(p.memoryCandidates as MemoryCandidate[])
  const droppedCount = p.memoryCandidates.length - kept.length
  if (droppedCount > 0) {
    issues.push({ field: 'memoryCandidates', reason: `${droppedCount} below salience threshold` })
  }
  return kept
}

/**
 * 사건 선택.
 * 조건을 만족해도 relevance/salience/cooldown 을 통과해야 실제로 발생한다.
 * 한 턴에 최대 1건이다.
 */
function validateEvent(
  p: SimulationProposal,
  s: SimulationSnapshot,
  issues: ValidationIssue[],
): ValidatedTransition['newEvent'] {
  if (p.eventCandidates.length === 0) return null

  const candidates: EventCandidate[] = p.eventCandidates.map((c) => ({
    type: c.type,
    context: { summary: c.summary },
    participantNpcIds: c.participantNpcIds,
    relevance: c.relevance,
    salience: c.salience,
  }))

  const picked = selectEvent(candidates, s.activeEvents, s.recentlyResolvedEvents, s.turnCount)
  if (!picked) {
    issues.push({ field: 'eventCandidates', reason: 'no candidate passed eligibility' })
  }
  return picked
}

/**
 * 사건 상태 변화 검증.
 *
 * 진행 중인 사건만 갱신할 수 있다 — AI 가 존재하지 않는 사건을 해결했다고
 * 주장하거나, 이미 끝난 사건을 되살리지 못하게 한다.
 */
function validateEventUpdates(
  p: SimulationProposal,
  s: SimulationSnapshot,
  issues: ValidationIssue[],
): SimulationProposal['eventUpdates'] {
  const activeIds = new Set(s.activeEvents.map((e) => e.id))
  const seen = new Set<string>()

  return p.eventUpdates.filter((u) => {
    if (!activeIds.has(u.eventId)) {
      issues.push({ field: 'eventUpdates', reason: `not an active event: ${u.eventId}` })
      return false
    }
    if (seen.has(u.eventId)) {
      issues.push({ field: 'eventUpdates', reason: `duplicate update for ${u.eventId}` })
      return false
    }
    seen.add(u.eventId)
    return true
  })
}

/**
 * NPC 등장 검증.
 *
 * NPC 는 메인 캐릭터보다 많은 맥락을 차지하면 안 된다. 동시 활성 수를 제한하고,
 * 이름이 겹치는 NPC 는 추가하지 않는다.
 */
function validateNpcIntroductions(
  p: SimulationProposal,
  s: SimulationSnapshot,
  issues: ValidationIssue[],
): SimulationProposal['npcIntroductions'] {
  const existing = new Set(s.activeNpcs.map((n) => n.name))
  const room = Math.max(0, POLICY.npc.maxActive - s.activeNpcs.length)
  const kept: SimulationProposal['npcIntroductions'] = []

  for (const intro of p.npcIntroductions) {
    if (kept.length >= room) {
      issues.push({ field: 'npcIntroductions', reason: 'max active npcs reached' })
      break
    }
    if (existing.has(intro.name) || intro.name === s.character.identity.name) {
      issues.push({ field: 'npcIntroductions', reason: `name already present: ${intro.name}` })
      continue
    }
    existing.add(intro.name)
    kept.push(intro)
  }
  return kept
}

/** NPC 가 알 수 없는 정보로 행동하지 못하게 한다. */
function validateNpcActions(
  p: SimulationProposal,
  activeNpcs: Npc[],
  issues: ValidationIssue[],
): SimulationProposal['npcActions'] {
  const byId = new Map(activeNpcs.map((n) => [n.id, n]))

  return p.npcActions.filter((a) => {
    const npc = byId.get(a.npcId)
    if (!npc) {
      issues.push({ field: 'npcActions', reason: `unknown npc: ${a.npcId}` })
      return false
    }
    if (!validateNpcKnowledge(a, npc)) {
      issues.push({ field: 'npcActions', reason: `${npc.name} cannot know: ${a.basedOn.join(', ')}` })
      return false
    }
    return true
  })
}

export type { SimulationEvent }

/**
 * 11/18 AI 가 고른 사진 코드(p1… 또는 'p3:4' = 4번째 블록 뒤) → 순번·자리. 목록 밖·언베일 아닌 방의 언베일 전용 사진·중복은 버리고 최대 5장.
 * 11/22 사용자(베이비챗 방식): 최소 장수 없음, 최대 3장. 같은 날: 서버가 모자란 장수를 정해진 자리(2·5·8번째 블록 뒤)에 끼워 채우던 것은 장면과 안 맞아 삭제 — AI 가 고른 사진만.
 */
const MAX_PHOTOS = 10   // 11/22 사용자: 최소 3장, 응답이 길수록 더 많이(블록 2개마다 한 장) — 최대 10장
/** after: AI 가 고른 사진은 AI 가 센(검증 전) 블록 번호, 채운 사진(fill)은 저장 블록 기준 자리. 스트리밍(stream-blocks)도 이걸 쓴다. */
/** 11/23 사용자: 옷은 앞으로만 — 입은 → 벗은 사진은 되지만 벗은 → 입은 사진은 안 된다(이 방의 직전 사진부터 이어서).
 *  '입은' = 일반 사진, 또는 언베일이라도 '옷 입은 채' 장면. 답에 다시 옷을 입는 일이 그려졌으면 입은 사진도 허용. */
const DRESSED_SCENE = /옷 입은 채|입은 채로|옷 위로/
const REDRESS = /옷을 (?:다시 )?(?:주워 )?입|옷을 챙겨 입|다시 입었|단추를 (?:다시 )?채|옷매무새를|가운을 걸치|이불을 (?:몸에 )?두르|다음 날/
export function keepOutfitOrder<T extends { index: number }>(photos: T[], s: SimulationSnapshot, told: string): T[] {
  const list = s.character.worldRole.situationImages ?? []
  const dressed = (i: number) => { const e = list[i]; return !!e && (!e.adult || DRESSED_SCENE.test(e.situation ?? '')) }
  const redressed = REDRESS.test(told)
  let bare = s.lastPhotoIndex != null && !dressed(s.lastPhotoIndex)
  return photos.filter(p => { if (dressed(p.index)) return !bare || redressed; bare = true; return true })
}

export function sceneImages(s: SimulationSnapshot, codes: readonly string[] | undefined): Array<{ index: number; after: number | null; fill?: boolean }> {
  const list = s.character.worldRole.situationImages ?? []
  const out: Array<{ index: number; after: number | null; fill?: boolean }> = []
  for (const code of codes ?? []) {
    const m = /^p(\d{1,4})\s*(?:[:@>]\s*(\d{1,3}))?$/i.exec(code.trim())
    const i = Number(m?.[1]) - 1
    if (!(i >= 0 && i < list.length) || (list[i]!.adult && !s.adultMode) || out.some(o => o.index === i)) continue
    out.push({ index: i, after: m?.[2] ? Number(m[2]) : null })
    if (out.length === MAX_PHOTOS) break
  }
  return out
}
