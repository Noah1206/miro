/**
 * 공식 BL 캐릭터 사진을 운영에 올린다 — 갤러리(01~05) → characters.images, 인트로 장면 사진 → 첫 인트로 줄의 image.
 * 원본은 ~/Desktop/miro-characters/_upload/<slug>/{01..05,intro}.jpg (Higgsfield 생성본을 1600px JPEG로 줄인 것).
 * 저장 경로는 slug·파일명으로 고정(upsert) — 다시 돌려도 같은 URL에 덮어쓴다.
 *
 *   npx tsx scripts/upload-bl-photos.mts            # 계획만 출력
 *   npx tsx scripts/upload-bl-photos.mts --apply    # Storage 업로드 + DB 반영
 */
import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const OWNER = 'f5a0dfcb-0e4c-443e-be17-c982234926c1' // 운영자 — seed-bl-characters.mts 와 같다
const BUCKET = 'character-images'
const ROOT = join(homedir(), 'Desktop/miro-characters/_upload')
const apply = process.argv.includes('--apply')

const plan = readdirSync(ROOT).filter((d) => d.startsWith('official-')).sort().map((slug) => {
  const files = readdirSync(join(ROOT, slug))
  const gallery = files.filter((f) => /^0[1-5]\.jpg$/.test(f)).sort()
  if (!files.includes('intro.jpg') || gallery.length === 0) throw new Error(`missing photos: ${slug}`)
  return { slug, gallery, intro: 'intro.jpg' }
})
for (const p of plan) console.log(p.slug, 'gallery', p.gallery.join(','), '+ intro')
if (!apply) { console.log('(dry run — --apply 로 올린다)'); process.exit(0) }

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음')
const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET)

const { eq } = await import('drizzle-orm')
const { db, characters } = await import('@miro/db')

async function put(slug: string, file: string) {
  const path = `${OWNER}/official/${slug}/${file}`
  const { error } = await storage.upload(path, readFileSync(join(ROOT, slug, file)), { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`upload ${path}: ${error.message}`)
  // 같은 경로에 덮어쓰면 CDN이 옛 사진을 줄 수 있어 버전 쿼리를 붙인다.
  return `${storage.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
}

for (const p of plan) {
  const [row] = await db.select({ id: characters.id, dialogue: characters.sampleDialogue }).from(characters).where(eq(characters.slug, p.slug)).limit(1)
  if (!row) { console.log('skip (DB에 없음)', p.slug); continue }
  const images: string[] = []
  for (const f of p.gallery) images.push(await put(p.slug, f))
  const introUrl = await put(p.slug, p.intro)
  // 장면 사진은 첫 인트로 줄에만 — 나머지 줄의 옛 image 는 지운다.
  let first = true
  const dialogue = row.dialogue.map(({ image: _old, ...d }) => {
    if (d.purpose !== 'intro' || !first) return d
    first = false
    return { ...d, image: introUrl }
  })
  if (first) throw new Error(`no intro line: ${p.slug}`)
  await db.update(characters).set({ images, sampleDialogue: dialogue }).where(eq(characters.id, row.id))
  console.log('done', p.slug, images.length, 'photos + intro')
}
process.exit(0)
