import { applyRelationshipDelta, RELATIONSHIP_DIMENSIONS, type StateTransitionRecord } from '@miro/domain'
import type { SimulationSnapshot } from './context'
import type { TurnPolicy } from './policy'
import type { ValidatedTransition } from './validator'

/**
 * 상태 전이 승인(agency-core-transition-plan §3.3·§3.4). 검증기를 지난 제안을 정책으로 한 번 더 걸러 실제로 적용할 변경과
 * 원장 기록을 만든다. 순수 함수 — DB 도, 모델도 부르지 않는다.
 *
 * 관계를 움직이는 소유자는 정책마다 하나다(§3.2): legacy 는 규칙(codeDelta), agency 는 appraisal. 같은 사건을 두 번 더하지 않는다.
 * 원장에는 상태 필드의 전후만 적는다. 검증기의 자유 문구(예: 모르는 화자 이름)는 필드만 남기고 버린다.
 */
export function approveTransition(transition: ValidatedTransition, snapshot: SimulationSnapshot, policy: TurnPolicy, opts: {
  /** 관계 delta 의 출처. legacy 는 규칙, agency 는 appraisal. */
  relationshipOwner: 'rules' | 'appraisal'
  decisionId?: string
} = { relationshipOwner: 'rules' }): { transition: ValidatedTransition; records: StateTransitionRecord[] } {
  const actor = snapshot.character.id
  const records: StateTransitionRecord[] = []
  const t = { ...transition }
  const note = (r: Omit<StateTransitionRecord, 'actor' | 'clock'> & { actor?: string; clock?: 'real' | 'narrative' }) =>
    records.push({ actor, clock: 'narrative', ...(opts.decisionId ? { decisionId: opts.decisionId } : {}), ...r })

  for (const issue of transition.issues) note({ field: issue.field, rule: 'validator_rejected', status: 'rejected' })

  // 일반 캐릭터: 대사·관계·기억만. 세계·장면·사건·NPC·선연락은 어느 등급에서도 없다(§3.1). 제안이 있었으면 거부로 남긴다.
  if (!policy.permissions.worldChange) {
    for (const [field, present] of [['world', t.worldDelta], ['scene', t.sceneDelta], ['event', t.newEvent], ['eventUpdates', t.eventUpdates.length],
      ['npcIntroductions', t.npcIntroductions.length], ['npcActions', t.npcActions.length]] as const) {
      if (present) note({ field, rule: 'chat_boundary', status: 'rejected' })
    }
    t.worldDelta = null; t.sceneDelta = null; t.newEvent = null; t.eventUpdates = []; t.npcIntroductions = []; t.npcActions = []
  }
  if (!policy.permissions.proactiveContact && t.realityIntent) { note({ field: 'session.pendingRealityIntent', rule: 'chat_boundary', status: 'rejected' }); t.realityIntent = null }

  const w = snapshot.world
  if (t.worldDelta?.currentLocation && t.worldDelta.currentLocation !== w.currentLocation) note({ field: 'world.currentLocation', before: w.currentLocation, after: t.worldDelta.currentLocation, rule: 'world_delta', status: 'applied' })
  if (t.worldDelta?.currentTime && t.worldDelta.currentTime !== w.currentTime) note({ field: 'world.currentTime', before: w.currentTime, after: t.worldDelta.currentTime, rule: 'world_delta', status: 'applied' })
  if (t.worldDelta?.worldStatus && t.worldDelta.worldStatus !== w.worldStatus) note({ field: 'world.worldStatus', before: w.worldStatus, after: t.worldDelta.worldStatus, rule: 'world_delta', status: 'applied' })
  if (t.sceneDelta) note({ field: 'world.scene', before: snapshot.scene?.id ?? null, after: { location: t.sceneDelta.location ?? null, time: t.sceneDelta.time ?? null, mood: t.sceneDelta.mood ?? null, weather: t.sceneDelta.weather ?? null }, rule: 'scene_delta', status: 'applied' })
  if (t.newEvent) note({ field: 'event.new', after: t.newEvent.candidate.type, rule: 'event_created', status: 'applied' })
  for (const u of t.eventUpdates) note({ field: `event.${u.eventId}.status`, before: snapshot.activeEvents.find(e => e.id === u.eventId)?.status ?? null, after: u.status, rule: 'event_updated', status: 'applied', target: u.eventId })
  for (const n of t.npcIntroductions) note({ field: 'npc.new', after: n.role, rule: 'npc_introduced', status: 'applied' })
  for (const a of t.npcActions) note({ field: `npc.${a.npcId}.action`, rule: 'npc_acted', status: 'applied', target: a.npcId, actor: a.npcId })

  const next = applyRelationshipDelta(snapshot.relationship, t.relationshipDelta)
  const rule = opts.relationshipOwner === 'appraisal' ? 'relationship_appraisal' : 'relationship_rules'
  for (const dim of RELATIONSHIP_DIMENSIONS) {
    if (next[dim] !== snapshot.relationship[dim]) note({ field: `relationship.${dim}`, before: snapshot.relationship[dim], after: next[dim], rule, status: 'applied', actor: opts.relationshipOwner === 'appraisal' ? actor : 'rules', clock: 'real' })
  }
  if (t.relationshipDelta.stage && t.relationshipDelta.stage !== snapshot.relationship.stage) {
    note({ field: 'relationship.stage', before: snapshot.relationship.stage, after: t.relationshipDelta.stage, rule: opts.relationshipOwner === 'appraisal' ? 'stage_derived' : 'stage_rules', status: 'applied', actor: 'rules', clock: 'real' })
  }
  if (t.realityIntent) note({ field: 'session.pendingRealityIntent', after: { channel: t.realityIntent.channel, notBefore: t.realityIntent.notBefore ?? null }, rule: 'reality_intent', status: 'applied', clock: 'real' })
  return { transition: t, records }
}
