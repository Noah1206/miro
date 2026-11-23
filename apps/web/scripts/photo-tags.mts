/**
 * 11/23 기존 작품의 상황 사진에 태그 채우기 — 사진을 비전 AI 가 직접 보고 붙인다(lib/photo-tags.ts, 올릴 때 붙는 것과 같은 규칙).
 * 설명(situation)은 건드리지 않는다: 설명이 실제 그림과 다른 사진이 있어(설명 '시오후키'인데 그림은 가슴 애무) 설명에서 뽑지 않고 그림을 본다.
 * 모든 사진에 태그가 붙어야 그 작품이 태그로 고르기로 바뀐다(engine photoTagMode). 이미 태그가 있는 사진은 건너뛴다.
 *
 *   npx tsx --env-file=../../.env scripts/photo-tags.mts --plan                      # 작품별 남은 장수(쓰기 없음)
 *   npx tsx --env-file=../../.env scripts/photo-tags.mts --apply --slug <slug>        # 그 작품만 채워 DB 반영(40장마다 저장)
 *   … --max 300 : 이번에 채울 최대 장수(기본 400), --retag : 이미 있는 태그도 다시
 */
import { tagPhoto } from '../lib/photo-tags'
const { db, characters, sql, eq } = await import('@miro/db')
const argv = process.argv.slice(2), arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const slug = arg('--slug'), max = Number(arg('--max') ?? 400), retag = argv.includes('--retag')
/** --only a.jpg,b.jpg : 그 파일들만 다시 붙인다. */
const only = new Set((arg('--only') ?? '').split(',').filter(Boolean))
const rows = await db.select({ id: characters.id, slug: characters.slug, name: characters.name, imgs: characters.situationImages }).from(characters)
  .where(slug ? eq(characters.slug, slug) : sql`${characters.deletedAt} is null and jsonb_array_length(${characters.situationImages}) > 0`)
if (!argv.includes('--apply')) {
  for (const r of rows) { const left = r.imgs.filter(e => !e.tags?.length).length; if (left) console.log(`${r.slug ?? r.id}  ${r.name}  ${left}/${r.imgs.length}장 남음`) }
  process.exit(0)
}
if (!slug || rows.length !== 1) { console.error('--apply 는 --slug <작품> 하나씩'); process.exit(1) }
const work = rows[0]!, imgs = work.imgs.map(e => ({ ...e }))
const todo = imgs.map((e, i) => i).filter(i => only.size ? only.has(imgs[i]!.image.split('/').pop()!.split('?')[0]!) : retag || !imgs[i]!.tags?.length).slice(0, max)
console.log(`${work.name}: ${todo.length}장 채움(전체 ${imgs.length}장)`)
let next = 0, done = 0, failed = 0
const save = () => db.update(characters).set({ situationImages: imgs }).where(eq(characters.id, work.id))
const missed: number[] = []
const worker = async () => {
  while (next < todo.length) {
    const i = todo[next++]!, e = imgs[i]!
    const r = await tagPhoto(e.image, e.situation ?? '').catch(() => null)
    if (r) { e.tags = r.tags; e.outfit = r.outfit } else { failed++; missed.push(i) }
    if (++done % 40 === 0) { await save(); console.log(`  ${done}/${todo.length} (실패 ${failed})`) }
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
// 실패한 사진은 하나씩 천천히 두 번 더(동시에 몰려 막힌 경우).
for (let pass = 0; pass < 2 && missed.length; pass++) {
  const again = missed.splice(0)
  for (const i of again) { const e = imgs[i]!, r = await tagPhoto(e.image, e.situation ?? '').catch(() => null); if (r) { e.tags = r.tags; e.outfit = r.outfit; failed-- } else missed.push(i) }
}
if (missed.length) console.log('끝내 실패:', missed.map(i => imgs[i]!.image.split('/').pop()!.split('?')[0]).join(' '))
await save()
const left = imgs.filter(e => !e.tags?.length).length
console.log(`끝: ${done - failed}장 채움, 실패 ${failed}, 태그 없는 사진 ${left}장${left ? ' — 다시 돌리면 남은 것만 채운다' : ' (이 작품은 이제 태그로 고른다)'}`)
process.exit(0)
