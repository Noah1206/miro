import { and, eq, inArray, isNull } from 'drizzle-orm'
import { messages } from '@miro/db'
import type { MemoryCandidate } from '@miro/domain'
import type { UsageTransaction } from '@/lib/usage/guard'
import { characterCanSeeMessage } from '@/lib/messenger/inbox'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Recheck extraction citations at persistence, before accepting a replacement/deleting old memory. */
export async function groundedMemoryCandidates(tx: UsageTransaction, candidates: MemoryCandidate[], sessionId: string, currentMessageId: string): Promise<MemoryCandidate[]> {
  if (!candidates.length) return []
  const ids = [...new Set([currentMessageId, ...candidates.flatMap(m => m.sourceMessageId && UUID.test(m.sourceMessageId) ? [m.sourceMessageId] : [])])]
  const rows = await tx.select({ id: messages.id, content: messages.content, createdAt: messages.createdAt, role: messages.role }).from(messages).where(and(
    eq(messages.sessionId, sessionId), inArray(messages.role, ['user', 'character']), isNull(messages.hiddenAt), characterCanSeeMessage, inArray(messages.id, ids),
  ))
  const through = rows.find(m => m.id === currentMessageId && m.role === 'user')?.createdAt
  if (!through) return []
  const sources = new Map(rows.filter(m => m.createdAt <= through).map(m => [m.id, m.content]))
  // 캐릭터가 확정한 공유 과거만 캐릭터 발화를 출처로 남긴다(10/16) — 사용자 사실·선호·약속은 언제나 사용자 원문이어야 한다.
  const characterSaid = new Set(rows.filter(m => m.role === 'character').map(m => m.id))
  return candidates.filter(m => {
    const id = m.type === 'short_term_summary' ? currentMessageId : m.sourceMessageId ?? currentMessageId
    const source = sources.get(id)
    if (source === undefined) return false
    if (characterSaid.has(id) && (m.type !== 'shared_event' || m.replaces)) return false
    // Recalling an older statement is not a new correction. It cannot delete a newer memory.
    if (m.replaces && m.sourceMessageId && m.sourceMessageId !== currentMessageId) return false
    // Summaries have a merge anchor, not a single quotation. Legacy current-turn candidates
    // have no citation metadata; historical citations always require exact original text.
    if (m.type === 'short_term_summary') return true
    if (m.sourceMessageId && !m.sourceQuote?.trim()) return false
    return m.sourceQuote === undefined || (m.sourceQuote.trim().length >= 2 && source.includes(m.sourceQuote))
  }).map(m => ({ ...m, sourceMessageId: m.type === 'short_term_summary' ? currentMessageId : m.sourceMessageId ?? currentMessageId }))
}
