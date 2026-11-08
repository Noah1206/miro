import type { DialogueEntry } from './intro-dialogue'

/** Atmosphere for the public sample exchanges. Exact question anchors avoid adding stale prose after an author edits the dialogue. */
// 11/8 여성향(BL) 캐릭터 삭제로 비움.
export const SAMPLE_ATMOSPHERE: Record<string, Array<{ question: string; text: string }>> = {
}

export function sampleWithAtmosphere(slug: string | null | undefined, turns: readonly DialogueEntry[]): DialogueEntry[] {
  const cues = slug && Object.hasOwn(SAMPLE_ATMOSPHERE, slug) ? SAMPLE_ATMOSPHERE[slug] : undefined
  if (!cues) return [...turns]
  return turns.flatMap((turn, index) => {
    const next = turns[index + 1]
    const cue = turn.role === 'user' && next?.role === 'character' && !turn.purpose && !next.purpose
      ? cues.find(item => item.question === turn.text.trim()) : undefined
    return cue ? [turn, { role: 'narrator' as const, text: cue.text }] : [turn]
  })
}
