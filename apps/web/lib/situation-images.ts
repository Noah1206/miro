import { selectLore } from '@miro/domain'

/** 상황별 사진(10/28) — 키워드가 대화에 나오면 그 사진을 채팅에 한 번 띄운다. 매칭은 로어북과 같은 규칙(조사 붙어도 찾음). */
export type SituationImage = { keywords: string[]; image: string }
export const SITUATION_LIMITS = { entries: 100, keywords: 5, keywordLength: 20 } as const

/** 폼 JSON → 저장할 목록. 키워드 없는 줄·https 가 아닌 사진은 버린다. */
export function normalizeSituationImages(input: unknown): SituationImage[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((raw) => {
    const o = (raw ?? {}) as { keywords?: unknown; image?: unknown }
    const image = typeof o.image === 'string' && o.image.startsWith('https://') ? o.image : ''
    const keywords = Array.isArray(o.keywords)
      ? [...new Set(o.keywords.filter((k): k is string => typeof k === 'string').map(k => k.trim().slice(0, SITUATION_LIMITS.keywordLength)).filter(Boolean))].slice(0, SITUATION_LIMITS.keywords)
      : []
    return image && keywords.length ? [{ keywords, image }] : []
  }).slice(0, SITUATION_LIMITS.entries)
}

/** 이번 턴(사용자 말 + 캐릭터 답)에 맞는 사진 하나. 이 대화방에서 이미 띄운 사진은 다시 고르지 않는다. */
export function pickSituationImage(entries: SituationImage[], text: string, shown: ReadonlySet<string>): string | null {
  const candidates = entries.filter(e => !shown.has(e.image))
  const [hit] = selectLore(candidates.map(e => ({ keywords: e.keywords, content: e.image })), text)
  return hit?.content ?? null
}
