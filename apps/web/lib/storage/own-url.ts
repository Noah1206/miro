/**
 * 11/10 저장할 사진 주소는 우리 저장소(character-images 공개 버킷)에 올린 것만 — 남의 서버 주소를 끼워 넣지 못하게.
 * 같은 사이트의 상대 경로(/로 시작, //는 아님)는 공식 작품 사진이라 그대로 둔다.
 * 브라우저(임시 저장·미리보기)엔 SUPABASE_URL 이 없어 https 만 본다 — 저장은 서버에서 다시 거른다.
 */
export function isOwnImageUrl(url: string): boolean {
  if (/^\/(?!\/)/.test(url)) return true
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '')
  if (!base) return /^https:\/\//.test(url)
  return url.startsWith(`${base}/storage/v1/object/public/character-images/`) && !url.includes('..')
}
