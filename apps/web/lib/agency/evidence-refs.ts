import { isCommunicationPreference, type AgencyState, type Memory } from '@miro/domain'

/** Reserve original preference sources before bounded historical references can crowd them out. */
export function agencyEvidenceMessageRefs(input: {
  sessionId: string; characterId: string; memories: readonly Memory[]; state: AgencyState; readMessageIds?: readonly string[]
}): string[] {
  const openGoals = input.state.goals.filter(goal => ['active', 'proposed', 'suspended'].includes(goal.status))
  const openIds = new Set(openGoals.map(goal => goal.id))
  const activeBeliefs = input.state.beliefs.filter(belief => belief.status === 'active')
  const pending = input.state.actions.filter(action => ['authorized', 'queued'].includes(action.status)
    || (action.fulfillsGoalIds ?? []).some(id => openIds.has(id)))
  const scoped = input.memories.filter(memory => memory.sessionId === input.sessionId && memory.characterId === input.characterId && memory.sourceMessageId)
  const preferenceSources = scoped.filter(memory => memory.confidence >= .6 && isCommunicationPreference(memory)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8).map(memory => memory.sourceMessageId!)
  const refs = [
    ...preferenceSources, ...(input.readMessageIds ?? []),
    ...openGoals.flatMap(goal => goal.evidenceIds), ...activeBeliefs.flatMap(belief => belief.evidenceIds),
    ...pending.flatMap(action => action.outcomeEvidenceId ? [action.outcomeEvidenceId] : []),
    ...scoped.map(memory => memory.sourceMessageId!),
  ].map(id => id.replace(/:(?:queued|sent)$/, '')).filter(id => /^[0-9a-f-]{36}$/i.test(id))
  return [...new Set(refs)].slice(0, 64)
}
