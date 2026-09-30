import { msg } from '@/lib/i18n'
/**
 * 장르 분류. 홈의 행과 상세의 '비슷한 작품' 이 같은 규칙을 쓴다 —
 * 규칙이 두 벌이면 한쪽만 고쳐져 어긋난다.
 *
 * `worlds.genre` 는 '현대 드라마 · 미스터리' 처럼 여러 장르가 붙어 오므로
 * 문자열 앞부분으로 자르지 않고 키워드 포함으로 가른다.
 */
export const MOODS = [msg('로맨스'), msg('얀데레'), msg('츤데레'), msg('순애'), msg('집착'), msg('힐링'), msg('일상'), msg('드라마'), msg('코미디'), msg('호러'), msg('미스터리'), msg('느와르'), msg('판타지'), msg('학원'), msg('오피스'), msg('소꿉친구')] as const

/** 관계 태그(2026-09-30 요청) — 만들기의 관계 탭에서 고르고(relationship_keywords) 홈 관계 섹션이 거른다. 소꿉친구는 장르(MOODS)에 있다. */
export const RELATIONS = [msg('친구'), msg('연인'), msg('짝사랑'), msg('썸'), msg('동료'), msg('상사'), msg('부하'), msg('선배'), msg('후배'), msg('라이벌'), msg('주인'), msg('노예'), msg('가족'), msg('계약')] as const

export const genreValues = (genre: string | null): string[] =>
  (genre ?? '').split('·').map(value => value.trim()).filter(Boolean)

export const GENRES: Array<{ key: string; title: string; match: string[] }> = [
  { key: 'romance', title: msg('로맨스'), match: ['로맨스', '연애'] },
  { key: 'thriller', title: msg('스릴러'), match: ['스릴러', '느와르', '범죄', '미스터리'] },
  { key: 'office', title: msg('오피스'), match: ['오피스', '직장'] },
  { key: 'fantasy', title: msg('판타지'), match: ['판타지', '무협', 'SF'] },
  { key: 'drama', title: msg('드라마'), match: ['드라마'] },
  { key: 'campus', title: msg('학원'), match: ['학원', '캠퍼스', '하이틴'] },
]

export const matchesGenre = (genre: string | null, match: string[]): boolean =>
  Boolean(genre && match.some((m) => genre.includes(m)))

/** 이 장르가 속한 분류들의 키워드를 모두 모은다 — '비슷한 작품' 의 검색어가 된다. */
export function genreKeywords(genre: string | null): string[] {
  if (!genre) return []
  return GENRES.filter((g) => matchesGenre(genre, g.match)).flatMap((g) => g.match)
}
