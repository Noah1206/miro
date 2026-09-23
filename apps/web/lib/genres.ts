/**
 * 장르 분류. 홈의 행과 상세의 '비슷한 작품' 이 같은 규칙을 쓴다 —
 * 규칙이 두 벌이면 한쪽만 고쳐져 어긋난다.
 *
 * `worlds.genre` 는 '현대 드라마 · 미스터리' 처럼 여러 장르가 붙어 오므로
 * 문자열 앞부분으로 자르지 않고 키워드 포함으로 가른다.
 */
export const MOODS = ['로맨스', '얀데레', '츤데레', '순애', '집착', '힐링', '일상', '드라마', '코미디', '호러', '미스터리', '느와르', '판타지', '학원', '오피스', '소꿉친구'] as const

export const genreValues = (genre: string | null): string[] =>
  (genre ?? '').split('·').map(value => value.trim()).filter(Boolean)

export const GENRES: Array<{ key: string; title: string; match: string[] }> = [
  { key: 'romance', title: '로맨스', match: ['로맨스', '연애'] },
  { key: 'thriller', title: '스릴러', match: ['스릴러', '느와르', '범죄', '미스터리'] },
  { key: 'office', title: '오피스', match: ['오피스', '직장'] },
  { key: 'fantasy', title: '판타지', match: ['판타지', '무협', 'SF'] },
  { key: 'drama', title: '드라마', match: ['드라마'] },
  { key: 'campus', title: '학원', match: ['학원', '캠퍼스', '하이틴'] },
]

export const matchesGenre = (genre: string | null, match: string[]): boolean =>
  Boolean(genre && match.some((m) => genre.includes(m)))

/** 이 장르가 속한 분류들의 키워드를 모두 모은다 — '비슷한 작품' 의 검색어가 된다. */
export function genreKeywords(genre: string | null): string[] {
  if (!genre) return []
  return GENRES.filter((g) => matchesGenre(genre, g.match)).flatMap((g) => g.match)
}
