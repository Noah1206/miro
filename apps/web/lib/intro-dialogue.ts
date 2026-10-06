import { personalize } from './personalize'
/** Intro entries share the existing JSON storage, with an explicit discriminator.
 * Unmarked legacy samples stay samples; they never become chat history implicitly.
 */
/**
 * image: 인트로 장면 사진(공개 URL) — 있으면 그 줄 앞에 사진 메시지로 먼저 깔린다(공식 캐릭터 시드, 10/5).
 * scene: 시작 상황 이름(10/5, 위프처럼 여러 도입부 중 고른다). 같은 scene 의 인트로 줄이 한 도입부다.
 * 처음 나오는 scene 이 기본 도입부 — scene 이 없는 줄('')도 하나의 도입부로 친다(사용자가 만든 캐릭터).
 * context·time·location: 기본이 아닌 도입부의 첫 줄에 붙는 그 장면의 첫 장면 설명·시작 시각·장소(10/6).
 * 기본 도입부는 캐릭터의 startingContext·startingTime·세계 장소를 그대로 쓴다.
 */
export type DialogueEntry = {
  role: 'character' | 'user' | 'narrator'; text: string; purpose?: 'intro'; image?: string; scene?: string
  context?: string; time?: string; location?: string
}
const isIntro = (t: DialogueEntry) => t.purpose === 'intro' && (t.role === 'character' || t.role === 'narrator')
/** 도입부 이름들 — 인트로 줄에 나온 순서대로. 첫 번째가 기본. */
export function introScenes(entries: readonly DialogueEntry[]): string[] {
  return [...new Set(entries.filter(isIntro).map((t) => t.scene ?? ''))]
}
/** 고른 도입부(없거나 모르는 이름이면 기본)의 인트로 줄. */
export function introDialogue(entries: readonly DialogueEntry[], scene?: string) {
  const scenes = introScenes(entries)
  const pick = scene !== undefined && scenes.includes(scene) ? scene : scenes[0]
  return entries.filter((t) => isIntro(t) && (t.scene ?? '') === pick)
}
/** 고른 도입부의 장면 정보. 기본 도입부·모르는 이름·적힌 게 없으면 null — 캐릭터 기본값을 쓴다. */
export function sceneOpening(entries: readonly DialogueEntry[], scene?: string | null) {
  const scenes = introScenes(entries)
  if (!scene || scene === scenes[0] || !scenes.includes(scene)) return null
  const first = entries.find((t) => isIntro(t) && t.scene === scene && (t.context || t.time || t.location))
  return first ? { context: first.context, time: first.time, location: first.location } : null
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
/** userName 이 있으면 서술 줄의 "당신"을 그 이름으로(lib/personalize). 캐릭터 대사는 그대로. */
export function introMessages(sessionId: string, entries: readonly DialogueEntry[], opening?: string, opts: { scene?: string; userName?: string | null } = {}) {
  if (opening) return [{ sessionId, role: 'character' as const, kind: 'text' as const, content: opening, blocks: [], turnIndex: 0 }]
  const turns = introDialogue(entries, opts.scene).flatMap((t) => [
    ...(t.image ? [{ role: t.role, kind: 'photo' as const, content: t.image }] : []),
    { role: t.role, kind: 'text' as const, content: t.role === 'narrator' ? personalize(t.text, opts.userName) : t.text },
  ])
  return turns.map((t, index) => ({ sessionId, ...t, blocks: [], turnIndex: index - turns.length }))
}
