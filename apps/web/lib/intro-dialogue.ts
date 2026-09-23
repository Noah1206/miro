/** Intro entries share the existing JSON storage, with an explicit discriminator.
 * Unmarked legacy samples stay samples; they never become chat history implicitly.
 */
export type DialogueEntry = { role: 'character' | 'user' | 'narrator'; text: string; purpose?: 'intro' }
export function introDialogue(entries: readonly DialogueEntry[]) {
  return entries.filter((t) => t.purpose === 'intro' && (t.role === 'character' || t.role === 'narrator'))
}
export function sampleDialogue(entries: readonly DialogueEntry[]) {
  return entries.filter((t) => t.purpose !== 'intro')
}
export function parseIntroDialogue(raw: string): DialogueEntry[] {
  let entries: unknown
  try { entries = JSON.parse(raw) } catch { throw new Error('INTRO_INVALID') }
  if (!Array.isArray(entries) || entries.length > 20) throw new Error('INTRO_INVALID')
  let total = 0
  return entries.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('INTRO_INVALID')
    const { role, text } = entry as Record<string, unknown>
    if ((role !== 'character' && role !== 'narrator') || typeof text !== 'string' || !text.trim() || text.trim().length > 500) throw new Error('INTRO_INVALID')
    total += text.trim().length
    if (total > 2000) throw new Error('INTRO_TOO_LONG')
    return { role, text: text.trim(), purpose: 'intro' }
  })
}
export function introMessages(sessionId: string, entries: readonly DialogueEntry[], opening?: string) {
  const turns = opening ? [{ role: 'character' as const, text: opening }] : introDialogue(entries)
  return turns.map((t, index) => ({ sessionId, role: t.role, kind: 'text' as const, content: t.text, blocks: [], turnIndex: opening ? 0 : index - turns.length }))
}
