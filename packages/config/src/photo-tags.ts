/**
 * 11/23 사진 태그 — 상황 사진마다 짧은 태그를 붙이고, 대화 AI 는 사진 목록(작품당 수백 줄) 대신 그 작품에 쓰인 태그만 보고 고른다.
 * 태그에 묶인 사진 가운데 어느 것을 띄울지는 서버가 정한다(옷차림 단계·방금 보인 사진·장소, engine validator).
 * 사용자: "이미지 태그 매핑으로 하면 더 정확하고 빠르게 선택 가능하지 않을까" — 258줄 목록에서 고르면 장소 단어에 끌려 틀리거나, 30장만 추리면 원하는 사진이 후보에서 빠졌다.
 * 사진을 올리면 비전 AI 가 아래 목록에서 1~3개를 고른다(apps/web/lib/photo-tags.ts). 맞는 게 없을 때만 짧은 새 태그를 쓴다.
 */
export const PHOTO_TAGS = {
  감정: ['평소', '미소', '활짝 웃음', '슬픔', '눈물', '화남', '삐짐', '당황', '부끄러움', '놀람', '겁먹음', '고민', '비웃음', '졸림', '달아오름'],
  일상: ['요리', '식사', '집안일', '공부·일', '운동', '휴대폰', '잠', '데이트', '술자리', '목욕', '포옹', '손잡기', '쓰다듬기', '키스', '웨딩', '임신', '아기'],
  노출: ['속옷 차림', '옷 벗기', '가슴 노출', '알몸', '엉덩이', '유혹 포즈', '셀카', '아헤가오'],
  애무: ['가슴 애무', '가슴 빨기', '엉덩이 애무', '손가락 애무', '핥기', '자위', '기구'],
  봉사: ['손으로', '입으로', '목 깊이', '가슴으로', '발로'],
  체위: ['정상위', '후배위', '기승위', '역기승위', '측위', '대면좌위', '들어서', '교배 프레스', '풀 넬슨', '엎드려', '서서 뒤로', '애널'],
  마무리: ['절정', '시오후키', '안에 사정', '입에 사정', '몸에 사정', '관계 뒤'],
  특수: ['여러 명', '구속', '샤워', '수유', '오줌', '통화 중'],
} as const
export const PHOTO_TAG_LIST: readonly string[] = Object.values(PHOTO_TAGS).flat()
/** 장면 전체가 달라지는 태그 — 이 태그가 붙은 사진은 AI 가 그 태그를 직접 고를 때만 띄운다('손가락 애무'를 골랐는데 여러 명·임신 사진이 뜨지 않게). 함께 고를 땐 "여러 명+후배위". */
export const PHOTO_CONTEXT_TAGS: readonly string[] = ['여러 명', '임신', '구속', '수유', '오줌', '아기', '웨딩']
/** 그 사진이 무슨 장면인지를 정하는 태그(특수 상황 + 체위 + 봉사) — 이런 태그가 붙은 사진은 AI 가 그 태그를 고를 때만 띄운다.
 *  '절정'이나 '달아오름'만 골랐는데 다른 체위 사진이 뜨지 않게: 체위 중의 절정은 "후배위+절정"으로 고른다. */
export const PHOTO_SCENE_TAGS: readonly string[] = [...PHOTO_CONTEXT_TAGS, ...PHOTO_TAGS.체위, ...PHOTO_TAGS.봉사]
export const PHOTO_TAG_LIMITS = { perPhoto: 4, length: 12 } as const
/** 저장할 태그 — 다듬고(공백 정리·길이), 중복을 빼고, 장당 4개까지. */
export function normalizePhotoTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.filter((t): t is string => typeof t === 'string').map(t => t.replace(/\s+/g, ' ').trim().slice(0, PHOTO_TAG_LIMITS.length)).filter(Boolean))].slice(0, PHOTO_TAG_LIMITS.perPhoto)
}
/** 태그를 보여 줄 순서 — 목록 순서대로, 목록에 없는 새 태그는 뒤에. */
export function orderPhotoTags(tags: Iterable<string>): string[] {
  const rank = (t: string) => { const i = PHOTO_TAG_LIST.indexOf(t); return i < 0 ? PHOTO_TAG_LIST.length : i }
  return [...new Set(tags)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'ko'))
}
