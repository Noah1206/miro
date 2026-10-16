import { agencyEvidence, agencyUserUtterance, terms, type AgencyDecisionContext } from '@miro/domain'
import { feature } from '@miro/config'
import type { AgencyGroundedContext } from './agency/planner'
import type { SimulationSnapshot } from './context'

export type UserGroundingEvidence = {
  id: string
  kind: 'user_statement' | 'authored_context' | 'character_words' | 'persona_background'
  text: string
  occurredAt?: string | null
}

export class ConversationGroundingRejectedError extends Error {
  constructor() { super('conversation_grounding_rejected') }
}
export class ConversationReviewContextBudgetError extends Error {
  constructor() { super('conversation_review_context_budget_exceeded') }
}

export const USER_GROUNDING_RULE = 'Do not invent a previous user statement, personal history, shared milestone, consent, choice, physical action or observed property of the user/their belongings. Possessing or mentioning an object does not mean showing it, holding it or establishing its appearance. A setting that the user sent letters does not establish what those letters said. A past the authored setting says you shared may be recalled from your own memory with detail, but every detail must match what the user and you already said about it in this conversation or in remembered facts — the user’s own account wins. Respond warmly to the actual detail without manufacturing a past connection. Preserve the character’s own gestures, tastes, motives, ordinary initiative, questions and clearly tentative interpretations; no generic uncertainty disclaimer is needed. Let a new preference change this character’s concrete next response instead of routinely announcing “기억해 둘게”; avoid repeating the same prop gesture from the preceding turn when it adds nothing.'

/** Names and indirect claims cannot be reliably detected by keyword: review every visible draft. */
export function needsUserGroundingReview(blocks: ReadonlyArray<{ type: string; text: string }>): boolean {
  return feature('strictConversationReview') && blocks.some(block => block.text.trim().length > 0)
}

export function snapshotUserGrounding(snapshot: SimulationSnapshot, input: string): UserGroundingEvidence[] {
  const user = snapshot.recentMessages.filter(m => m.role === 'user' && m.knowledgeScope !== 'omniscient')
    .map((m, i) => ({ id: m.id ?? `recent-user:${i}`, kind: 'user_statement' as const, text: m.content, occurredAt: m.at }))
  const recalled = snapshot.memories.filter(m => m.sessionId === snapshot.relationship.sessionId && m.characterId === snapshot.character.id && m.sourceMessageId && m.sourceText)
    .map(m => ({ id: m.sourceMessageId!, kind: m.sourceRole === 'character' ? 'character_words' as const : 'user_statement' as const, text: m.sourceText!, occurredAt: m.sourceOccurredAt?.toISOString() }))
  const own = snapshot.recentMessages.filter(m => m.role === 'character').slice(-3).map((m, i) => ({ id: m.id ?? `recent-character:${i}`,
    kind: 'character_words' as const, text: (m.blocks?.length ? m.blocks.filter(b => b.type === 'dialogue').map(b => b.text).join('\n') : m.content), occurredAt: m.at }))
  const authored = [snapshot.character.personality.personality, snapshot.character.worldRole.startingContext, snapshot.worldSetting,
    ...(snapshot.userPersona ? [`이름: ${snapshot.userPersona.name}`, snapshot.userPersona.gender ? `성별: ${snapshot.userPersona.gender}` : null] : [])].filter((text): text is string => !!text)
    .map((text, i) => ({ id: `authored:${i}`, kind: 'authored_context' as const, text }))
  const persona: UserGroundingEvidence[] = snapshot.userPersona?.description
    ? [{ id: 'persona-background', kind: 'persona_background', text: snapshot.userPersona.description }] : []
  return [...recalled, ...authored, ...persona, ...own, ...user, { id: 'current-user-input', kind: 'user_statement', text: input }]
}

export function agencyUserGrounding(context: AgencyDecisionContext & AgencyGroundedContext): UserGroundingEvidence[] {
  const messages = context.evidence.flatMap(e => {
    const source = agencyEvidence(e.id, context)
    return source?.kind === 'message' ? [{ id: source.id, kind: agencyUserUtterance(source.id, context) ? 'user_statement' as const : 'character_words' as const,
      text: source.quote, occurredAt: source.occurredAt }] : []
  })
  const authored = Object.entries(context.authored?.fields ?? {}).filter(([field]) => /personality\.personality|worldSetting|startingContext|userPersona/.test(field))
    .map(([id, text]): UserGroundingEvidence => ({ id, kind: /userPersona/.test(id) ? 'persona_background' : 'authored_context', text }))
  return [...authored, ...messages]
}

/** The small reviewer sees exact excerpts and their scope, never an unsourced summary as proof. */
export function boundedUserGrounding(evidence: readonly UserGroundingEvidence[], draft: string): UserGroundingEvidence[] {
  const distinct = [...new Map(evidence.map(item => [item.id, item])).values()]
  const query = terms(draft)
  const score = (item: UserGroundingEvidence) => query.reduce((n, term) => n + (item.text.includes(term) ? Math.min(5, term.length) : 0), 0)
  const current = distinct.find(item => item.id === 'current-user-input')
  const ranked = distinct.filter(item => item !== current).map((item, index) => ({ item, score: score(item), index }))
    .sort((a, b) => b.score - a.score || Number(b.item.kind === 'user_statement') - Number(a.item.kind === 'user_statement') || b.index - a.index)
  // Highest-priority first, so the byte guard removes unrelated history before the exact old
  // book/drink/appointment source that the draft is trying to recall.
  return [...(current ? [current] : []), ...ranked.slice(0, current ? 11 : 12).map(entry => entry.item)].map(item => {
    if (item.id === 'current-user-input' || item.text.length <= 600) return item
    const matched = query.map(term => item.text.indexOf(term)).filter(at => at >= 0)
    const start = Math.max(0, (matched.length ? Math.min(...matched) : 0) - 100)
    return { ...item, text: `${start ? '[excerpt] ' : ''}${item.text.slice(start, start + 600)}${start + 600 < item.text.length ? ' [excerpt ends; omitted text unknown]' : ''}` }
  })
}
