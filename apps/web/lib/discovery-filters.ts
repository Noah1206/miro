/** Shared by the home picker, search URL and server query. Labels are catalog keywords. */
export const DISCOVERY_GROUPS = [
  { id: 'mood', title: '분야/분위기', tags: ['SF', '개그', '고수위', '궁정물', '느와르', '달달물', '동양풍', '드라마', '러브코미디', '로맨스', '로판', '무협', '미스터리', '병맛', '서스펜스', '서양풍', '성장물', '수인물', '스포츠', '시대극', '액션', '오컬트', '이세계물', '일상', '잔잔물', '재회물', '추리', '판타지', '학원', '현대물', '호러/스릴러', '힐링물', '캠퍼스물'] },
  { id: 'character', title: '캐릭터', tags: ['학생', '교수', '선생님', '의사', '간호사', '경찰', '형사', '소방관', '군인', '변호사', '검사', '회사원', '대표/CEO', '비서', '연구원', '개발자', '셰프', '바리스타', '예술가', '작가', '배우', '아이돌', '연예인', '운동선수', '집사', '지배인', '복원가', '조직 간부', '재벌', '조폭', '중년', '황제', '왕자', '귀족', '기사', '성기사', '마법사', '암살자', '용병', '모험가', '헌터', '사제', '연금술사', '엘프', '수인', '늑대인간', '뱀파이어', '드래곤', '천사', '악마', '정령', '이종족', '인외존재', '천사/악마', '히어로'] },
  { id: 'gong', title: '공', tags: ['강공', '계략공', '까칠공', '냉혈공', '능글공', '능력공', '다정공', '대형견공', '동정공', '무심공', '미남공', '미인공', '사랑꾼공', '상처공', '순정공', '순진공', '아저씨공', '연상공', '연하공', '울보공', '유혹공', '재벌공', '존댓말공', '집착공', '짝사랑공', '츤데레공', '평범공', '헌신공', '후회공'] },
  { id: 'su', title: '수', tags: ['가난수', '감자수', '강수', '계략수', '굴림수', '귀염수', '까칠수', '능글수', '능력수', '다정수', '단정수', '도망수', '명랑수', '무심수', '무자각수', '미남수', '미인수', '상처수', '성실수', '소심수', '순진수', '아방수', '연상수', '연하수', '외유내강수', '유혹수', '잔망수', '적극수', '직진수', '짝사랑수', '츤데레수', '평범수', '허당수', '헌신수', '후회수'] },
  { id: 'relation', title: '성향', tags: ['다정한', '무심한', '까칠한', '능글맞은', '장난스러운', '능청스러운', '차가운', '차분한', '냉정한', '수줍은', '솔직한', '직진하는', '헌신적인', '순정적인', '질투 많은', '집착하는', '소유욕 강한', '보호적인', '의존적인', '자존심 센', '츤데레', '얀데레', '리드하는', '도발적인', '신중한', '능숙한', '서툰', '상처 있는', '비밀스러운', '위험한', '서서히 마음 여는', '먼저 다가오는'] },
] as const

// Keep old bookmarked relationship filters usable after the section became personality/tendency choices.
const legacyRelations = ['가이드버스', '가족', '게임', '결혼', '계약관계', '군대/군부물', '기억상실', '다각관계', '동거', '리맨물', '리버시블', '반려동물', '복수', '부부', '빙의', '사내연애', '사제지간', '삼각관계', '선후배', '소꿉친구', '순애', '신분차이', '쌍방구원', '썸', '아포칼립스', '애증', '역키잡', '역하렘', '연애', '영혼바뀜', '오메가버스', '오피스물', '오해/착각', '우정', '육아', '이웃', '전쟁', '조선', '집착', '짝사랑', '차원이동', '첫경험', '첫사랑', '초능력', '친구', '키잡', '트라우마', '하렘', '환생', '회귀']
const knownTags = new Set<string>([...DISCOVERY_GROUPS.flatMap(group => [...group.tags]), ...legacyRelations])
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
  const groups: DiscoveryGroup[] = DISCOVERY_GROUPS.map(group => ({ id: group.id, title: group.title, tags: group.id !== 'gong' && group.id !== 'su' ? group.tags.map(tag => `${group.id}:${tag}`) : [] }))
  const add = (id: DiscoveryGroupId, raw: string) => {
    const label = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ')
    if (!validLabel(label)) return
    const group = groups.find(group => group.id === id)!
    const key = `${id}:${label}`
    if (!group.tags.includes(key)) group.tags.push(key)
  }
  for (const card of cards) {
    for (const keyword of card.relationshipKeywords) {
      const label = keyword.trim().replace(/^#+/, '').replace(/\s+/g, '')
      const known = DISCOVERY_GROUPS.find(group => group.tags.some(tag => normalize(tag) === normalize(label)))
      if (known?.id === 'gong' || known?.id === 'su') add(known.id, keyword)
      else if (!known && !legacyRelations.includes(label) && label.length >= 3) {
        if (label.endsWith('공')) add('gong', keyword)
        else if (label.endsWith('수')) add('su', keyword)
      }
    }
  }
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
    const otherGroups = selectedGroups.filter(tags => !tags.some(tag => ownTags.has(tag) || tag.startsWith(`${group.id}:`) || group.tags.includes(`${group.id}:${tag}`) || (group.id === 'relation' && legacyRelations.includes(tag))))
    const eligible = entries.filter(card => otherGroups.every(tags => tags.some(tag => matchesTag(card.text, tag))))
    return group.tags.map(tag => [tag, eligible.filter(card => matchesTag(card.text, tag)).length])
  }))
}

/** Alternatives match within each group; selections from different groups must all match. */
export function discoveryTagGroups(tags: string[]) {
  const picked = discoveryTags(tags)
  if (!picked) throw new Error('INVALID_TAG')
  return DISCOVERY_GROUPS.map(group => picked.filter(tag => tag.startsWith(`${group.id}:`) || (group.tags as readonly string[]).includes(tag) || (group.id === 'relation' && legacyRelations.includes(tag)))).filter(group => group.length)
}

export const discoveryTagNeedle = (tag: string) => ({
  개그: '코미디', 달달물: '달달', 수인물: '수인', 현대물: '현대', 힐링물: '힐링',
  캠퍼스물: '캠퍼스', 계약관계: '계약', 사내연애: '오피스', 오피스물: '오피스', 선후배: '선배',
  학생: '학생/대학생/대학원생', 선생님: '선생님/교사', '대표/CEO': '대표/CEO/경영자',
  '조직 간부': '조직간부/조직의중간간부/조직원/조폭',
  다정한: '다정', 무심한: '무심', 까칠한: '까칠', 능글맞은: '능글', 장난스러운: '장난', 능청스러운: '능청',
  차가운: '차가운/차갑/차가움', 차분한: '차분', 냉정한: '냉정', 수줍은: '수줍', 솔직한: '솔직',
  직진하는: '직진', 헌신적인: '헌신', 순정적인: '순정', '질투 많은': '질투', 집착하는: '집착',
  '소유욕 강한': '소유욕', 보호적인: '보호', 의존적인: '의존', 리드하는: '리드/주도', 도발적인: '도발',
  신중한: '신중', 능숙한: '능숙', 서툰: '서툰/서투', '상처 있는': '상처', 비밀스러운: '비밀',
  '서서히 마음 여는': '서서히열리는/서서히마음여는', '먼저 다가오는': '먼저연락오는/먼저다가오는',
} as Record<string, string>)[discoveryTagLabel(tag)] ?? discoveryTagLabel(tag)
