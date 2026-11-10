/**
 * 다인 작품 인물별 프로필 사진(11/10) — <dir>/<작품 slug 뒤쪽>__<인물 이름>.jpg 를 올리고 characters.ensemble_photos 에 { 이름: URL } 로 합친다(다른 인물 칸은 그대로).
 * 저장 경로는 slug·인물 순서로 고정(upsert) — 다시 돌려도 같은 자리에 덮어쓴다.
 *
 *   npx tsx --env-file=../../.env scripts/upload-cast-photos.mts <dir>            # 계획만
 *   npx tsx --env-file=../../.env scripts/upload-cast-photos.mts <dir> --apply    # Storage 업로드 + DB 반영
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const OWNER = 'f5a0dfcb-0e4c-443e-be17-c982234926c1' // 운영자 — upload-bl-photos.mts 와 같다
const BUCKET = 'character-images'
const dir = process.argv[2]
if (!dir) throw new Error('사진 폴더를 주세요')
const apply = process.argv.includes('--apply')

const byWork = new Map<string, Array<{ name: string; file: string }>>()
for (const file of readdirSync(dir).filter(f => f.endsWith('.jpg')).sort()) {
  const [work, name] = file.replace(/\.jpg$/, '').split('__')
  if (!work || !name) continue
  byWork.set(`official-m-${work}`, [...(byWork.get(`official-m-${work}`) ?? []), { name: name.normalize('NFC'), file }])
}
for (const [slug, list] of byWork) console.log(slug, list.map(l => l.name).join(', '))
if (!apply) { console.log('(dry run — --apply 로 올린다)'); process.exit(0) }

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음')
const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET)
const { eq } = await import('drizzle-orm')
const { db, characters } = await import('@miro/db')

for (const [slug, list] of byWork) {
  const [row] = await db.select({ id: characters.id, photos: characters.ensemblePhotos }).from(characters).where(eq(characters.slug, slug)).limit(1)
  if (!row) { console.log('skip (DB에 없음)', slug); continue }
  const next = { ...(row.photos ?? {}) }
  for (const [i, { name, file }] of list.entries()) {
    const path = `${OWNER}/official/${slug}/cast-${String(i + 1).padStart(2, '0')}.jpg`
    const { error } = await storage.upload(path, readFileSync(join(dir, file)), { contentType: 'image/jpeg', upsert: true })
    if (error) throw new Error(`upload ${path}: ${error.message}`)
    next[name] = `${storage.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
  }
  await db.update(characters).set({ ensemblePhotos: next }).where(eq(characters.id, row.id))
  console.log('updated', slug, Object.keys(next).join(', '))
}
process.exit(0)
