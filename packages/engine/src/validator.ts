import { REDRESS, castNames, dressedPhoto, heroineName, photoTagsOf, photoByTag, photoTagMode, rankedSituationImages } from './context'
import { trimEllipsisHabit, trimPenalizedSentences } from './conversation-repetition'
import { PENETRATION_CUE, PHOTO_TAGS, POLICY, cuePhotoTag, cueUserPosition } from '@miro/config'
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
  // 11/24 블록마다 정한 사진(블록의 photo 칸)이 있으면 그것을 쓴다 — 없을 때만 예전처럼 최상위 images.
  const perBlock = blockPhotoCodes(proposal.rp.blocks)
  const photos = keepOutfitOrder(sceneImages(snapshot, perBlock.length ? perBlock : proposal.images), snapshot, told)
  // 11/23 사용자 "왜 사진이 한 번도 안 나오는 경우가 있어": AI 가 images 를 빠뜨리거나 쓸 수 없는 코드만 내면 0장이었다 —
  // 고를 수 있는 사진이 있으면 지금 대화와 가장 가까운 것으로 최소 장수(3, 블록이 적으면 블록 수)를 채운다(옷차림 순서도 지킨다).
  // 11/23 사용자 "왜 사진이 한 번도 안 나오는 경우가 있어": AI 가 images 를 빠뜨리거나 쓸 수 없는 코드만 내면 0장이었다 —
  // 고를 수 있는 사진이 있으면 지금 대화와 가장 가까운 것으로 최소 장수(3, 블록이 적으면 블록 수)를 채운다(옷차림 순서를 지키고, 방금 보인 사진은 빼고).
  // 장수가 모자랄 때(1~2장)까지 서버가 채우는 건 넣지 않았다 — 글자 겹침으로 고르면 장면과 어긋난 사진(임신·여러 명)이 끼었다(11/23 실측). 그건 AI 가 목록 전체를 보고 고른다.
  // 11/24 태그로 고르는 작품은 먼저 이번 답의 글에서 태그를 짐작해(config cuePhotoTag) 그 블록 뒤에 둔다 — 글자 겹침으로 채우면 장면과 다른 행위의 사진이 떴다.
  if (!photos.length && blocks.length && photoTagMode(snapshot.character, !!snapshot.adultMode)) {
    const codes: string[] = []; let prev = ''
    // 체위 이름 없이 삽입만 그려진 블록 — 사용자가 체위를 적었으면 그 체위, 아니면 이 작품에 있는 체위 사진 가운데 하나를 돌아가며(사용자: 지정하지 않았으면 다양하게 나와도 된다).
    const positions = photoTagsOf(snapshot.character, !!snapshot.adultMode, true).filter(t => (PHOTO_TAGS.체위 as readonly string[]).includes(t) && t !== '애널')
    const wanted = cueUserPosition(snapshot.userInput ?? '')
    blocks.forEach((b, i) => {
      let tag = cuePhotoTag(b.text)
      if (tag === '달아오름' && PENETRATION_CUE.test(b.text)) tag = wanted ?? positions[(snapshot.turnCount + i) % (positions.length || 1)] ?? tag
      if (tag && tag !== prev) { codes.push(`${tag}:${i + 1}`); prev = tag }
    })
    photos.push(...keepOutfitOrder(sceneImages(snapshot, codes), snapshot, told).slice(0, 5).map(p => ({ ...p, fill: true })))
  }
  if (!photos.length && blocks.length) {
    const need = Math.min(3, blocks.length), seen = new Set(snapshot.recentPhotoIndexes ?? [])
    keepOutfitOrder(rankedSituationImages(snapshot).filter(e => !seen.has(e.i)).map(e => ({ index: e.i, after: null })), snapshot, told).slice(0, need)
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
    ...firstPhotoEarly(spreadPhotos(photos.map(p => p.index), blocks.length, photos.map((p) => {
      // 서버가 채운 사진은 정해 둔 자리(FILL_SLOTS, 저장 블록 기준) — 스트리밍 중에도 같은 자리에 먼저 보여 줄 수 있게. 답이 짧아 넘치면 답 끝.
      if (p.fill) return p.after !== null && p.after < blocks.length ? p.after : null
      if (p.after === null) return null
      const kept = allowedBlocks(proposal.rp.blocks.slice(0, p.after), snapshot).length
      return kept >= 1 && kept < blocks.length ? kept : null
    }))),
    issues,
  }
}

/**
 * 11/21 사용자: 사진은 글 → 사진 → 글. 두 장이 한자리(연달아)거나 답 끝(뒤에 글 없음)이면 안 된다.
 * 자리(after, 1부터 센 블록 번호)는 1..n-1 에서 사진마다 다르게 — 자리가 없거나 겹치면 가장 가까운 빈자리로, 빈자리가 없으면 그 사진은 뺀다.
 * 블록이 하나뿐인 답은 뒤에 글을 둘 수 없어 첫 사진 한 장만 답 끝에.
 */
/** 11/23 사용자: 답의 맨 처음 장면 글이 나올 때부터 사진이 한 장은 같이 나와야 한다 — 가장 앞 사진을 첫 블록 뒤로 당긴다. */
export function firstPhotoEarly(out: { images: number[]; imagesAfter: Array<number | null> }) {
  if (!out.images.length || out.imagesAfter.includes(1)) return out
  let k = 0
  out.imagesAfter.forEach((a, i) => { if ((a ?? Infinity) < (out.imagesAfter[k] ?? Infinity)) k = i })
  out.imagesAfter[k] = 1
  return out
}

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

/** 두 글의 편집 거리(글자 넣기·빼기·바꾸기 횟수). 짧은 이름 비교용. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]!
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
  // 11/24 사용자: 설정에 있는 주변 인물(아들·남편·친구)이 장면에 맞게 나와 말해야 하는데 유저와 주인공 1:1 로만 흘렀다 —
  // 카드 이름·[여러 인물]·다인 인물이 아닌 화자의 대사를 여기서 전부 지우고 있었다. 작품 설정 글 어딘가에 이름이 나오는 사람이면 말할 수 있게 한다
  // (설정에 없는 새 이름의 대사는 여전히 지운다 — 서술로는 등장할 수 있다). 대화방에서만: 문자는 한 사람이 보내는 글이다.
  const authored = (s.mode ?? 'chat') === 'chat' ? JSON.stringify(s.character) + (s.worldSetting ?? '') : ''
  const persona = s.userPersona?.name?.trim() || null
  // 1:1 작품인데 카드 이름이 작품 제목인 경우 — AI 가 주인공 대사의 화자를 실제 이름('윤미경'·'미경')으로 쓰면 '모르는 화자'로 지워져 대사가 통째로 빠졌다.
  // 주인공의 실제 이름으로 쓴 줄은 카드 이름 줄로 바꿔 둔다(화면·목소리는 카드 이름 줄을 주인공으로 다룬다).
  const lead = cast.size ? null : heroineName(s.character.personality.secret, s.character.personality.personality)
  // 11/24 예비 모델(Grok)이 카드 이름을 한 글자 틀리게 적어('니 엄마 잘먹습니다') 대사·속마음 5블록이 지워지고 행동만 남았다 — 띄어쓰기를 빼고 두 글자 이내로 다른 이름은 카드 이름으로 본다(5자 이상일 때만).
  const flatName = (x: string) => x.replace(/\s+/g, ''), card = flatName(s.character.identity.name)
  const nearCard = (n: string) => { const a = flatName(n); return card.length >= 5 && Math.abs(a.length - card.length) <= 2 && editDistance(a, card) <= 2 }
  const isLead = (speaker: string) => { const n = speaker.trim(); return (n !== s.character.identity.name && nearCard(n)) || (!!lead && lead !== s.character.identity.name && (n === lead || (n.length >= 2 && lead.endsWith(n)))) }
  const inSettings = (speaker: string) => { const n = speaker.trim(); return n.length >= 2 && n.length <= 12 && authored.includes(n) }
  const allowed = allowedBlockTypes(s.mode ?? 'chat')

  // 11/4 벌점 방식: 상투 표현·턴마다 되풀이된 몸짓·소품 문장을 서술·행동에서 지운다(대사는 그대로). 스트리밍과 저장이 같은 결과를 낸다.
  // 11/17 말줄임표 말버릇 — 설정 말투(말투·성격·인물 소개)에 말줄임표가 없는 인물의 대사만 다듬는다.
  const ellipsis = /…|\.{3}/
  const castIntro = new Map((s.character.worldRole.cast ?? []).map(p => [p.name, p.intro]))
  const ownVoice = `${s.character.personality.speechStyle ?? ''} ${s.character.personality.personality}`
  const keepEllipsis = (speaker: string | null | undefined) => ellipsis.test(speaker && castIntro.has(speaker) ? castIntro.get(speaker)! : ownVoice)
  return trimEllipsisHabit(trimPenalizedSentences(p.rp.blocks.map(b => b.speaker && isLead(b.speaker) ? { ...b, speaker: s.character.identity.name } : b).filter((b) => {
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
      if (b.speaker === '사용자' || b.speaker.toLowerCase() === 'user' || (persona !== null && b.speaker.trim() === persona)) {
        issues.push({ field: 'rp.blocks', reason: 'block speaks for the user' })
        return false
      }
      if (!known.has(b.speaker) && !inSettings(b.speaker)) {
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
export function keepOutfitOrder<T extends { index: number }>(photos: T[], s: SimulationSnapshot, told: string): T[] {
  const list = s.character.worldRole.situationImages ?? []
  const dressed = (i: number) => dressedPhoto(list, i)
  const redressed = REDRESS.test(told)
  let bare = s.lastPhotoIndex != null && !dressed(s.lastPhotoIndex)
  // heat(11/24): 이번 답에서 성인 사진이 나온 뒤에는 일상 사진으로 돌아가지 않는다 — 옷차림과 같은 '앞으로만' 원칙(행위 사진 사이에 일상 표정 컷이 끼지 않게).
  let heat = false
  return photos.filter(p => {
    const e = list[p.index]
    if (heat && e && !e.adult && !redressed) return false
    if (dressed(p.index)) { if (bare && !redressed) return false } else bare = true
    if (e?.adult) heat = true
    return true
  })
}

/** 블록마다 정한 사진(photo 칸) → "태그:블록번호" 목록. 번호는 AI 가 쓴 블록 순서(검증 전) 그대로. */
export function blockPhotoCodes(blocks: ReadonlyArray<{ photo?: string }>): string[] {
  return blocks.flatMap((b, i) => { const tag = b.photo?.replace(/\s*[:@>]\s*\d{1,3}\s*$/, '').trim(); return tag ? [`${tag}:${i + 1}`] : [] })
}

export function sceneImages(s: SimulationSnapshot, codes: readonly string[] | undefined): Array<{ index: number; after: number | null; fill?: boolean }> {
  const list = s.character.worldRole.situationImages ?? []
  const out: Array<{ index: number; after: number | null; fill?: boolean }> = []
  // 11/23 태그로 고르는 작품 — "태그:블록번호". 서버가 그 태그의 사진 한 장으로 바꾼다(context photoByTag). 벗은 사진이 나온 뒤에는 벗은 사진만.
  const byTag = photoTagMode(s.character, !!s.adultMode)
  // 11/24 AI 는 사진을 글 순서대로 적지 않을 때가 있다("당황:6, 겁먹음:1, 입으로:3") — 적힌 순서로 옷차림·단계를 따지면 뒤 블록의 일상 사진이 앞 블록의 성인 사진보다 먼저 통과했다.
  // 글에 나오는 자리(블록 번호) 순서로 놓고 따진다(자리 없는 것은 맨 뒤, 같은 자리는 적힌 순서).
  const picks = (codes ?? []).map((code, k) => {
    const c = code.trim(), m = /^p(\d{1,4})\s*(?:[:@>]\s*(\d{1,3}))?$/i.exec(c), t = !m && byTag ? /^(.+?)\s*(?:[:@>]\s*(\d{1,3}))?$/.exec(c) : null
    const at = (t ?? m)?.[2]
    return { m, t, k, after: at ? Number(at) : null }
  }).sort((x, y) => (x.after ?? Infinity) - (y.after ?? Infinity) || x.k - y.k)
  let bare = s.lastPhotoIndex != null && !dressedPhoto(list, s.lastPhotoIndex), heat = false
  // 11/24 사용자: 유저가 체위를 명시했으면(뒤에서·후배위 등) 그 체위 사진이 나와야 한다 — AI 가 다른 체위 태그를 골랐으면 명시한 체위로 바꾼다(그 체위 사진이 없으면 AI 가 고른 대로).
  const wanted = byTag ? cueUserPosition(s.userInput ?? '') : null
  const flat = (x: string) => x.replace(/\s+/g, ''), positions = new Set((PHOTO_TAGS.체위 as readonly string[]).map(flat))
  const asked = (tag: string) => wanted ? tag.split('+').map(x => positions.has(flat(x)) && flat(x) !== flat(wanted) ? wanted : x).join('+') : tag
  for (const p of picks) {
    const used = new Set(out.map(o => o.index))
    let i = p.t ? photoByTag(s, asked(p.t[1]!), used, bare, heat) : Number(p.m?.[1]) - 1
    if (p.t && i < 0 && asked(p.t[1]!) !== p.t[1]) i = photoByTag(s, p.t[1]!, used, bare, heat)
    if (!(i >= 0 && i < list.length) || (list[i]!.adult && !s.adultMode) || out.some(o => o.index === i)) continue
    if (!dressedPhoto(list, i)) bare = true
    if (list[i]!.adult) heat = true
    out.push({ index: i, after: p.after })
    if (out.length === MAX_PHOTOS) break
  }
  return out
}
