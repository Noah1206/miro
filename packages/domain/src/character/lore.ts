/**
 * 로어북 — 캐릭터가 알고 있지만 매 턴 실어 보낼 필요는 없는 배경 지식.
 * "민준이 누구야?" 처럼 물어봤을 때만 그 항목이 프롬프트에 붙는다.
 *
 * 성격은 매 턴 들어가고(정체성), 로어는 불렸을 때만 들어간다(지식). 이 구분이 핵심이다 —
 * 전부 매 턴 실으면 예산을 먹고, 안 실으면 캐릭터가 자기 세계를 모른다.
 */
export type LoreEntry = {
  /** 이 항목을 불러내는 낱말. 비어 있으면 항상 후보(always 항목). */
  keywords: string[]
  content: string
}

export const LORE_LIMITS = { entries: 24, keywords: 8, keywordLength: 24, content: 600, selected: 4 } as const

/**
 * 이번 턴에 실을 항목.
 *
 * keywords 가 빈 항목은 언제나 실린다(세계관 상수). 나머지는 겹치는 키워드 수로 정렬한다.
 * 같은 수면 먼저 적은 항목이 앞선다 — 만든 사람의 순서가 중요도다.
 */
export function selectLore(entries: LoreEntry[], query: string, limit = LORE_LIMITS.selected): LoreEntry[] {
  const haystack = normalizeQuery(query)
  const always = entries.filter((e) => e.keywords.length === 0)
  const scored = entries
    .map((e, order) => ({ e, order, hits: e.keywords.filter((k) => hits(k, haystack)).length }))
    .filter((x) => x.e.keywords.length > 0 && x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.order - b.order)
    .map((x) => x.e)
  return [...always, ...scored].slice(0, limit)
}

/**
 * 한국어는 조사가 낱말에 붙는다 — "민준이가", "민준한테", "민준." 이 모두 "민준" 을 불러야 한다.
 * terms() 의 낱말 분리는 조사를 완전히 떼지 못하고 한 글자 낱말을 버리므로(기억 검색은 부분일치라
 * 괜찮았다), 여기서는 구분자를 지운 문자열에 대고 부분일치로 찾는다.
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/[\s,.!?~·、。'"“”()\[\]]+/g, '')
}

/** "민준 형" 처럼 여러 낱말인 키워드는 조각 하나만 걸려도 부른다. */
function hits(keyword: string, haystack: string): boolean {
  const parts = keyword.toLowerCase().split(/[\s,]+/).map((p) => normalizeQuery(p)).filter(Boolean)
  return parts.some((p) => haystack.includes(p))
}

/** 저장 전 정리. 빈 항목과 한도 초과를 여기서 자른다 — 폼과 시드가 같은 규칙을 쓴다. */
export function normalizeLore(input: unknown): LoreEntry[] {
  if (!Array.isArray(input)) return []
  return input
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null
      const o = raw as { keywords?: unknown; content?: unknown }
      const content = typeof o.content === 'string' ? o.content.trim().slice(0, LORE_LIMITS.content) : ''
      if (!content) return null
      const keywords = Array.isArray(o.keywords)
        ? [...new Set(o.keywords.filter((k): k is string => typeof k === 'string')
            .map((k) => k.trim().slice(0, LORE_LIMITS.keywordLength)).filter(Boolean))].slice(0, LORE_LIMITS.keywords)
        : []
      return { keywords, content }
    })
    .filter((e): e is LoreEntry => e !== null)
    .slice(0, LORE_LIMITS.entries)
}
