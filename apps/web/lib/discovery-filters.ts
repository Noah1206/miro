/** Shared by the home picker, search URL and server query. Labels are catalog keywords. */
// 11/8 남성향 전용 — 히로인·관계 중심 태그. 라벨이 카드 글(이름·소개·장르·키워드)에 들어 있으면 걸린다(discoveryTagNeedle 로 바꿔 찾기도).
export const DISCOVERY_GROUPS = [
  { id: 'mood', title: '분야/분위기', tags: ['현대물', '캠퍼스물', '오피스물', '판타지', '현대 판타지', '무협', '사극', '이세계물', '아포칼립스', '서바이벌', '일상', '로맨스', '러브코미디', '순애', '하렘', '시뮬레이션', '미스터리', '스릴러', '고수위', '개그', '힐링물'] },
  { id: 'heroine', title: '히로인', tags: ['누나', '연상', '연하', '밀프', '유부녀', '과부', '새엄마', '사모님', '친구 엄마', '선배', '후배', '상사', '여사친', '소꿉친구', '첫사랑', '전 여친', '퀸카', '일진녀', '아가씨', '영애', '성녀', '여기사', '악녀', '서큐버스', '수인', '구미호', '엘프'] },
  { id: 'character', title: '직업', tags: ['대학생', '교수', '과외 선생님', '간호사', '의사', '승무원', '트레이너', '비서', '회사원', '아이돌', '배우', '모델', '메이드', '경찰', '헌터', '마법사', '기사', '공주'] },
  { id: 'relation', title: '성격', tags: ['츤데레', '쿨데레', '얀데레', '다정한', '도도한', '까칠한', '싸가지', '수줍은', '순진한', '애교 많은', '유혹적인', '도발적인', '욕구불만', '질투 많은', '헌신적인', '집착하는', '갭모에', '자존심 센', '복종적인', '리드하는'] },
  { id: 'play', title: '관계/전개', tags: ['NTR', 'NTL', 'MTR', '금단', '불륜', '배덕', '비밀 연애', '계약 연애', '동거', '조교', '참교육', '혐관', '주종', '주종 역전', '처지 역전', '정조 역전', '재회', '짝사랑', '협박', '임신', '착정'] },
] as const

const knownTags = new Set<string>(DISCOVERY_GROUPS.flatMap(group => [...group.tags]))
export type DiscoveryGroupId = typeof DISCOVERY_GROUPS[number]['id']
export type DiscoveryGroup = { id: DiscoveryGroupId; title: string; tags: string[]; popularTags?: string[] }
export type DiscoveryCard = { name?: string; role?: string | null; tagline?: string | null; genre?: string | null; occupation?: string | null; relationshipKeywords: string[]; plays?: number }
const groupIds = new Set<string>(DISCOVERY_GROUPS.map(group => group.id))
export const discoveryTagLabel = (tag: string) => tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag
const validLabel = (label: string) => !!label.trim() && label.length <= 24 && !/[\x00-\x1f:·]/.test(label)
const validTag = (tag: string) => knownTags.has(tag) || (groupIds.has(tag.split(':')[0]!) && tag.includes(':') && validLabel(discoveryTagLabel(tag)))
export function discoveryTags(values: string[]): string[] | null {
  if (values.length > 32 || values.some(value => !validTag(value))) return null
  return [...new Set(values)].sort()
}

/** Broad choices stay discoverable. Only observed conversation counts create popularity badges. */
export function availableDiscoveryGroups(cards: DiscoveryCard[]): DiscoveryGroup[] {
  const groups: DiscoveryGroup[] = DISCOVERY_GROUPS.map(group => ({ id: group.id, title: group.title, tags: group.tags.map(tag => `${group.id}:${tag}`) }))
  const signals = cards.filter(card => Number.isFinite(card.plays) && card.plays! > 0).map(card => ({
    text: normalize([card.name, card.role, card.occupation, card.tagline, card.genre, ...card.relationshipKeywords].filter(Boolean).join(' ')),
    plays: card.plays!,
  }))
  for (const group of groups) {
    const scores = new Map(group.tags.map(tag => {
      const needles = discoveryTagNeedle(tag).split('/').map(normalize)
      const score = signals.reduce((sum, card) => sum + (needles.some(needle => card.text.includes(needle)) ? card.plays : 0), 0)
      return [tag, score] as const
    }))
    group.tags.sort((left, right) => scores.get(right)! - scores.get(left)!)
    const popular = group.tags.filter(tag => scores.get(tag)! > 0).slice(0, 3)
    if (popular.length) group.popularTags = popular
  }
  return groups.filter(group => group.tags.length)
}
const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase()

/** Facet counts retain the keyword and other groups; each option describes its own matching set. */
export function discoveryOptionCounts(cards: DiscoveryCard[], groups: DiscoveryGroup[], selected: string[], query = ''): Record<string, number> {
  const matchesTag = (text: string, tag: string) => discoveryTagNeedle(tag).split('/').some(needle => text.includes(normalize(needle)))
  const selectedGroups = discoveryTagGroups(selected)
  const keyword = normalize(query.trim().slice(0, 40))
  const entries = cards.map(card => ({
    text: normalize([card.name, card.role, card.occupation, card.tagline, card.genre, ...card.relationshipKeywords].filter(Boolean).join(' ')),
    // Keyword search intentionally uses the same fields as the catalog API.
    queryText: normalize([card.name, card.role, card.tagline, card.genre, ...card.relationshipKeywords].filter(Boolean).join(' ')),
  })).filter(card => !keyword || card.queryText.includes(keyword))
  return Object.fromEntries(groups.flatMap(group => {
    const ownTags = new Set(group.tags)
    const otherGroups = selectedGroups.filter(tags => !tags.some(tag => ownTags.has(tag) || tag.startsWith(`${group.id}:`) || group.tags.includes(`${group.id}:${tag}`)))
    const eligible = entries.filter(card => otherGroups.every(tags => tags.some(tag => matchesTag(card.text, tag))))
    return group.tags.map(tag => [tag, eligible.filter(card => matchesTag(card.text, tag)).length])
  }))
}

/** Alternatives match within each group; selections from different groups must all match. */
export function discoveryTagGroups(tags: string[]) {
  const picked = discoveryTags(tags)
  if (!picked) throw new Error('INVALID_TAG')
  return DISCOVERY_GROUPS.map(group => picked.filter(tag => tag.startsWith(`${group.id}:`) || (group.tags as readonly string[]).includes(tag))).filter(group => group.length)
}

export const discoveryTagNeedle = (tag: string) => ({
  현대물: '현대', 캠퍼스물: '캠퍼스/대학', 오피스물: '오피스/회사/직장/사내', 이세계물: '이세계/중세', 스릴러: '스릴', 개그: '코미디/개그', 힐링물: '힐링',
  러브코미디: '러브코미디/러브 코미디', 사극: '사극/조선', 아가씨: '아가씨/보스의 딸', '전 여친': '전 여친/전여친', 일진녀: '일진녀/일진',
  '과외 선생님': '과외', 기사: '기사/기사단', 대학생: '대학생/대학교/복학생', 회사원: '회사원/직장',
  다정한: '다정', 도도한: '도도/차도녀', 까칠한: '까칠', 수줍은: '수줍', 순진한: '순진', '애교 많은': '애교',
  유혹적인: '유혹', 도발적인: '도발', '질투 많은': '질투', 헌신적인: '헌신', 집착하는: '집착', '자존심 센': '자존심', 복종적인: '복종', 리드하는: '리드/주도',
  '주종 역전': '주종역전/주종 역전', '비밀 연애': '비밀 연애/비밀연애', '계약 연애': '계약', 
} as Record<string, string>)[discoveryTagLabel(tag)] ?? discoveryTagLabel(tag)
