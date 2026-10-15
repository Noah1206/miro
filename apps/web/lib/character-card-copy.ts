type CardCopy = { genre?: string | null; relationshipKeywords: string[]; occupation?: string | null; startingContext?: string | null; tagline?: string | null; role?: string | null }

export function characterTags(c: CardCopy): string[] {
  const clean = (text: string) => text.trim().replace(/^#+/, '').replace(/\s+/g, '')
  const tags = [...new Set([...(c.genre ?? '').split(/[·,|]/), ...c.relationshipKeywords].map(clean).filter(Boolean))].slice(0, 5)
  for (const fallback of [c.occupation, c.role, '스토리', '캐릭터챗', '미로']) {
    if (tags.length >= 3) break
    const tag = fallback ? clean(fallback).slice(0, 18) : ''
    if (tag && !tags.includes(tag)) tags.push(tag)
  }
  return tags
}

/** Only authored public scene copy; private personality/lore never enters discovery cards. */
export function characterStorySummary(c: CardCopy): string {
  const text = (c.startingContext || c.tagline || c.role || '이 캐릭터와 나의 이야기가 시작됩니다.').replace(/[*_#]/g, '').replace(/\s+/g, ' ').trim()
  const first = text.match(/^.*?[.!?。！？](?:\s|$)/)?.[0]?.trim() ?? text
  return first.length > 72 ? `${first.slice(0, 71).trimEnd()}…` : first
}
