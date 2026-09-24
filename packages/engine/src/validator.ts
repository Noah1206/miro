import { POLICY } from '@miro/config'
import { allowedBlockTypes, validateNpcKnowledge, selectEvent, filterSalient } from '@miro/domain'
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

  return {
    blocks: validateBlocks(proposal, snapshot, issues),
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
    issues,
  }
}

/** 화자가 등장인물과 맞는지, 사용자를 대신 연기하지 않는지 확인한다. */
function validateBlocks(
  p: SimulationProposal,
  s: SimulationSnapshot,
  issues: ValidationIssue[],
): SimulationProposal['rp']['blocks'] {
  const known = new Set([s.character.identity.name, ...s.activeNpcs.map((n) => n.name)])
  const allowed = allowedBlockTypes(s.mode ?? 'chat')

  return p.rp.blocks.filter((b) => {
    // 전화 중에는 서술할 화면이 없다. 모드에 맞지 않는 블록은 버린다.
    if (!allowed.has(b.type)) {
      issues.push({ field: 'rp.blocks', reason: `${b.type} not allowed in ${s.mode ?? 'chat'}` })
      return false
    }
    // An inner voice belongs to this character alone. Other people's minds are not the character's knowledge.
    if (b.type === 'thought' && b.speaker && b.speaker !== s.character.identity.name) {
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
  })
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
