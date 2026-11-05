type CardCopy = { genre?: string | null; relationshipKeywords: string[]; occupation?: string | null; startingContext?: string | null; tagline?: string | null; role?: string | null }

/** 11/6 사용자: 자극적인 단어가 해시태그 앞에 오게. 앞에 있을수록 먼저. 목록에 없는 태그는 원래 순서 그대로 뒤에. */
const HOT = ['NTR', 'NTL', '조교', '임신', '유부녀', '밀프', '하렘', '금단', '불륜', '얀데레', '집착', '노예', '주종역전', '처지역전', '복수', '혐관', '연상', '누나', '의붓', '동거', '비밀', '발정기', 'BSS']
const heat = (tag: string) => { const i = HOT.findIndex(h => tag.toUpperCase().includes(h.toUpperCase())); return i < 0 ? HOT.length : i }
/** 자극적인 태그를 앞으로(같은 급이면 원래 순서). 상세 화면 해시태그도 이걸 쓴다. */
export const hotFirst = (tags: string[]) => tags.map((t, i) => ({ t, i })).sort((a, b) => heat(a.t) - heat(b.t) || a.i - b.i).map(x => x.t)

export function characterTags(c: CardCopy): string[] {
  const clean = (text: string) => text.trim().replace(/^#+/, '').replace(/\s+/g, '')
  const all = [...new Set([...(c.genre ?? '').split(/[·,|]/), ...c.relationshipKeywords].map(clean).filter(Boolean))]
  const tags = hotFirst(all).slice(0, 5)
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
