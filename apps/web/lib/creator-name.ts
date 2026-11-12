import { styleFor } from '@/lib/ai/modal-image'

/**
 * 11/12 사용자: 작품마다 크리에이터 이름이 보이게 — 카드와 상세 화면의 해시태그 아래.
 * 회원이 만든 작품은 그 회원의 닉네임. 운영 계정이 올린 작품(slug official-*)은 그림체마다 다른 필명으로 보인다(그림체 = 한 작가라는 느낌).
 * 필명은 운영 계정의 필명일 뿐 별도 계정이 아니다 — 응원·보상은 지금처럼 운영 계정으로 간다.
 */
const PEN_NAMES: Record<string, string> = {
  'itim-noob': '달무리', 'kdh-noob': '새벽잉크', 'fa-noob': '모카', 'acdm-noob': '유리온실', 'isg-noob': '밤편지',
  'syh-noob': '설화담', srn: '먹빛', mojz: '청람', miro: 'MIRO',
}
/** 사진 버튼 그림체 표(WORK_STYLE)에는 없지만 그림체를 아는 작품 — 회장님·얼음 선배는 itim, 아르덴은 acdm, 며느리는 isg. */
const KNOWN: Record<string, string> = Object.fromEntries([
  // 미로 오리지널(앱을 의인화한 캐릭터들)은 미로가 직접 만든 것으로 보인다 — 한 필명(달무리)에 21작품이 몰려서 따로 뺐다.
  ...['miro', 'veil', 'fairies', 'librarian', 'painter', 'exchange', 'artisan', 'tailor', 'bell', 'novelist', 'clock', 'cartographer'].map(s => [`official-m-${s}`, 'miro']),
  ...['council', 'inner-senior'].map(s => [`official-m-${s}`, 'itim-noob']),
  ['official-m-arden', 'acdm-noob'], ['official-m-baby-contract', 'isg-noob'],
])
/**
 * 그림체를 모르는 작품은 한 이름에 몰리지 않게 여러 필명에 나눈다(사용자: "다양하게") — slug 로 정해져 같은 작품은 늘 같은 이름.
 * ponytail: 그림체가 같은 작품끼리 같은 이름이라는 보장은 없다 — 작품별 그림체가 정해지면 KNOWN 에 적는다.
 */
const POOL = { male: ['라일락', '은하수', '복숭아티', '초승달', '민트초코', '해무', '별사탕'], female: ['물망초', '달빛조각', '체리블라썸', '안개꽃', '백야', '노을빛'] } as const
const pick = (slug: string, names: readonly string[]) => names[[...slug].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % names.length]!

export function creatorName(c: { slug?: string | null; audience?: 'male' | 'female' | null }, ownerName?: string | null): string {
  if (!c.slug?.startsWith('official-')) return ownerName?.trim() ?? ''
  const audience = c.audience ?? 'male'
  const style = KNOWN[c.slug] ?? styleFor(audience, c.slug)
  return PEN_NAMES[style] ?? pick(c.slug, POOL[audience])
}
