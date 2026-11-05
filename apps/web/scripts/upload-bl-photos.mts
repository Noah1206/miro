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

// --only=<slug> 이면 그 캐릭터만(11/1, 비공개 private-* 캐릭터 포함).
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
const plan = readdirSync(ROOT).filter((d) => only ? d === only : d.startsWith('official-')).sort().map((slug) => {
  const files = readdirSync(join(ROOT, slug))
  const gallery = files.filter((f) => /^(0[1-9]|[1-9]\d)\.(jpg|webp)$/.test(f)).sort()   // 11/5 01~99(천마환생 인물 카드 40장)   // 01.webp = 움직이는 대표 사진(11/4)
  if (gallery.length === 0) throw new Error(`missing photos: ${slug}`)
  // 인트로 장면 사진은 없을 수 있다(10/19 작품 메인공 6명 — 대표 사진 01만).
  // u1.jpg… = 언베일 수위 갤러리 사진(11/4) — unveil-u1.jpg 로 올려 언베일을 안 켠 사람에겐 흐린다(lib/unveil-photo).
  // 11/4 하렘 카드는 히로인마다 여러 장이라 u1~u99 까지(숫자 순서).
  const unveil = files.filter((f) => /^u\d{1,2}\.jpg$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
  return { slug, gallery, unveil, intro: files.includes('intro.jpg') ? 'intro.jpg' : null }
})
for (const p of plan) console.log(p.slug, 'gallery', p.gallery.join(','), p.unveil.length ? `+ unveil ${p.unveil.join(',')}` : '', p.intro ? '+ intro' : '(no intro)')
if (!apply) { console.log('(dry run — --apply 로 올린다)'); process.exit(0) }

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음')
const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET)

const { eq } = await import('drizzle-orm')
const { db, characters } = await import('@miro/db')

async function put(slug: string, file: string, as = file) {
  const path = `${OWNER}/official/${slug}/${as}`
  const { error } = await storage.upload(path, readFileSync(join(ROOT, slug, file)), { contentType: file.endsWith('.webp') ? 'image/webp' : 'image/jpeg', upsert: true })
  if (error) throw new Error(`upload ${path}: ${error.message}`)
  // 같은 경로에 덮어쓰면 CDN이 옛 사진을 줄 수 있어 버전 쿼리를 붙인다.
  return `${storage.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
}

for (const p of plan) {
  const [row] = await db.select({ id: characters.id, dialogue: characters.sampleDialogue }).from(characters).where(eq(characters.slug, p.slug)).limit(1)
  if (!row) { console.log('skip (DB에 없음)', p.slug); continue }
  // 상황별 사진(11/2) — situations.json 이 있으면 s-<id>.jpg 를 올리고 characters.situation_images 를 통째로 바꾼다(adult = 언베일 턴에만).
  const sitFile = join(ROOT, p.slug, 'situations.json')
  if (readdirSync(join(ROOT, p.slug)).includes('situations.json')) {
    const list = JSON.parse(readFileSync(sitFile, 'utf8')) as Array<{ id: string; keywords: string[]; situation: string; adult: boolean }>
    const situationImages = []
    for (const s of list) {
      if (!readdirSync(join(ROOT, p.slug)).includes(`s-${s.id}.jpg`)) continue
      situationImages.push({ keywords: s.keywords, situation: s.situation, image: await put(p.slug, `s-${s.id}.jpg`), ...(s.adult ? { adult: true as const } : {}) })
    }
    await db.update(characters).set({ situationImages }).where(eq(characters.id, row.id))
    console.log('situations', p.slug, situationImages.length, `(adult ${situationImages.filter(s => s.adult).length})`)
  }
  const images: string[] = []
  for (const f of p.gallery) images.push(await put(p.slug, f))
  for (const f of p.unveil) images.push(await put(p.slug, f, `unveil-${f}`))
  if (!p.intro) {
    await db.update(characters).set({ images }).where(eq(characters.id, row.id))
    console.log('done', p.slug, images.length, 'photos')
    continue
  }
  // 장면 사진은 장면마다 첫 인트로 줄에만 — intro.jpg 가 첫 장면, intro-2.jpg 가 둘째 장면(11/4). 나머지 줄의 옛 image 는 지운다.
  const files = readdirSync(join(ROOT, p.slug))
  const scenes = [...new Set(row.dialogue.filter(d => d.purpose === 'intro').map(d => d.scene ?? ''))]
  const urls = new Map<string, string>()
  for (const [i, scene] of scenes.entries()) {
    const f = i === 0 ? p.intro : `intro-${i + 1}.jpg`
    if (files.includes(f)) urls.set(scene, await put(p.slug, f))
  }
  const done = new Set<string>()
  const dialogue = row.dialogue.map(({ image: _old, ...d }) => {
    const scene = d.scene ?? ''
    if (d.purpose !== 'intro' || done.has(scene) || !urls.has(scene)) return d
    done.add(scene)
    return { ...d, image: urls.get(scene)! }
  })
  if (!done.size) throw new Error(`no intro line: ${p.slug}`)
  await db.update(characters).set({ images, sampleDialogue: dialogue }).where(eq(characters.id, row.id))
  console.log('done', p.slug, images.length, 'photos + intro')
}
process.exit(0)
