/**
 * 11/24 사진 설명으로 태그 보정 — AI 호출 없음. 설명에 체위·행위 이름이 적힌 사진은 그 이름을 태그로 삼는다(@miro/config correctedPhotoTags).
 * 이미 태그가 붙은 공식 작품 사진만 본다(태그 없는 사진은 건드리지 않는다 — 태그 방식이 아닌 작품이 반쯤 바뀌지 않게).
 *
 *   npx tsx --env-file=../../.env scripts/photo-tags-from-captions.mts            # 바뀔 내용 보기(쓰기 없음)
 *   npx tsx --env-file=../../.env scripts/photo-tags-from-captions.mts --apply    # DB 반영
 */
import { correctedPhotoTags } from '@miro/config'
const { db, characters, sql, eq } = await import('@miro/db')
const apply = process.argv.includes('--apply')
const rows = await db.select({ id: characters.id, name: characters.name, imgs: characters.situationImages }).from(characters)
  .where(sql`${characters.slug} like 'official-%' and jsonb_array_length(${characters.situationImages}) > 0`)
let total = 0, changed = 0
for (const r of rows) {
  let n = 0
  const imgs = r.imgs.map(e => {
    if (!e.tags?.length || !e.situation) return e
    total++
    const next = correctedPhotoTags(e.situation, e.tags)
    if (next.join('|') === e.tags.join('|')) return e
    n++
    if (!apply && n <= 3) console.log(`  ${r.name} | ${e.situation.slice(0, 44)} | ${e.tags.join(',')} → ${next.join(',')}`)
    return { ...e, tags: next }
  })
  changed += n
  if (n && apply) await db.update(characters).set({ situationImages: imgs }).where(eq(characters.id, r.id))
  if (n) console.log(`${r.name}: ${n}장 ${apply ? '보정' : '바뀔 예정'}`)
}
console.log(`${apply ? '보정 끝' : '미리 보기'}: 태그 있는 사진 ${total}장 중 ${changed}장`)
process.exit(0)
