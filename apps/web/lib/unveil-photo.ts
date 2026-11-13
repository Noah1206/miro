/**
 * 11/13 사용자: 언베일을 안 켜도 홈 카드에서 '나만 보는 그녀' 알몸 사진이 넘어갔다 — 일반 이름(03.jpg 등)으로 올라간 노출 사진.
 * 자동 판별(anime_rating·nudenet)로 공식 작품 사진 480장을 훑고 눈으로 확인해 노출·성행위 사진만 골랐다.
 * ponytail: 파일 목록이라 새 사진은 올릴 때 `unveil-` 이름을 붙여야 한다(upload-bl-photos u1.jpg·NNu.jpg 규칙).
 */
const EXPLICIT_FILES = /\/official\/(official-m-only-me\/(03|32|33)|official-m-baby-contract\/03|official-m-others-gf\/intro\.[2456]|official-m-wall-friend\/intro(\.2)?)\.jpg(\?|$)/
/** 언베일 수위 갤러리 사진(11/4) — 올릴 때 파일 이름을 `unveil-…` 로 붙인다(upload-bl-photos u1.jpg…). 언베일을 안 켠 사람에겐 이 사진만 흐린다. */
export const isUnveilPhoto = (src: string | null | undefined) => !!src && (/\/unveil-[^/?]+(\?|$)/.test(src) || EXPLICIT_FILES.test(src))

if (process.argv[1]?.endsWith('unveil-photo.ts')) {
  const u = (f: string) => `https://x.supabase.co/storage/v1/object/public/character-images/o/official/${f}?v=1`
  console.assert(isUnveilPhoto(u('official-m-only-me/03.jpg')) && isUnveilPhoto(u('official-m-wall-friend/intro.jpg')) && isUnveilPhoto(u('official-m-others-gf/intro.5.jpg')) && isUnveilPhoto(u('official-m-x/unveil-u1.jpg')))
  console.assert(!isUnveilPhoto(u('official-m-only-me/01.jpg')) && !isUnveilPhoto(u('official-m-only-me/30.jpg')) && !isUnveilPhoto(u('official-m-others-gf/intro.3.jpg')) && !isUnveilPhoto(null))
}
