/** Intro entries share the existing JSON storage, with an explicit discriminator.
 * Unmarked legacy samples stay samples; they never become chat history implicitly.
 */
/** image: 인트로 장면 사진(공개 URL) — 있으면 그 줄 앞에 사진 메시지로 먼저 깔린다(공식 캐릭터 시드, 10/5). */
export type DialogueEntry = { role: 'character' | 'user' | 'narrator'; text: string; purpose?: 'intro'; image?: string }
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
    const { role, text, image } = entry as Record<string, unknown>
    if ((role !== 'character' && role !== 'narrator') || typeof text !== 'string' || !text.trim() || text.trim().length > 500) throw new Error('INTRO_INVALID')
    total += text.trim().length
    if (total > 2000) throw new Error('INTRO_TOO_LONG')
    // 편집기를 거쳐도 시드가 붙인 장면 사진이 사라지지 않게 — https 주소만 받는다.
    return { role, text: text.trim(), purpose: 'intro', ...(typeof image === 'string' && image.startsWith('https://') ? { image } : {}) }
  })
}
export function introMessages(sessionId: string, entries: readonly DialogueEntry[], opening?: string) {
  if (opening) return [{ sessionId, role: 'character' as const, kind: 'text' as const, content: opening, blocks: [], turnIndex: 0 }]
  const turns = introDialogue(entries).flatMap((t) => [
    ...(t.image ? [{ role: t.role, kind: 'photo' as const, content: t.image }] : []),
    { role: t.role, kind: 'text' as const, content: t.text },
  ])
  return turns.map((t, index) => ({ sessionId, ...t, blocks: [], turnIndex: index - turns.length }))
}
