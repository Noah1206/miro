/**
 * 가린 사진 올리기(11/8) — ~/Desktop/miro-characters/_censored/<slug>/<파일>(tooling/image/censor.py·blur_editor.py 결과)을
 * 운영 Storage 의 같은 경로에 덮어쓰고, 그 사진을 가리키는 URL(대표·갤러리·인트로·상황 사진)의 버전 쿼리만 바꾼다.
 * 원본은 _upload_orig 에 한 번만 백업하고, _upload 도 가린 사진으로 바꿔 upload-bl-photos.mts 를 다시 돌려도 가린 사진이 올라간다.
 *
 *   npx tsx --env-file=../../.env scripts/upload-censored.mts
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const OWNER = 'f5a0dfcb-0e4c-443e-be17-c982234926c1' // upload-bl-photos.mts 와 같다
const BASE = join(homedir(), 'Desktop/miro-characters')
const storage = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).storage.from('character-images')
const { eq } = await import('drizzle-orm')
const { db, characters } = await import('@miro/db')

for (const slug of readdirSync(join(BASE, '_censored')).filter(d => d.startsWith('official-'))) {
  const files = readdirSync(join(BASE, '_censored', slug)).filter(f => f.endsWith('.jpg'))
  const [row] = files.length ? await db.select({ id: characters.id, images: characters.images, sampleDialogue: characters.sampleDialogue, situationImages: characters.situationImages }).from(characters).where(eq(characters.slug, slug)).limit(1) : []
  if (!row) { if (files.length) console.log('skip (DB 없음)', slug); continue }
  let json = JSON.stringify({ images: row.images, sampleDialogue: row.sampleDialogue, situationImages: row.situationImages })
  for (const f of files) {
    mkdirSync(join(BASE, '_upload_orig', slug), { recursive: true })
    const orig = join(BASE, '_upload_orig', slug, f)
    if (!existsSync(orig)) copyFileSync(join(BASE, '_upload', slug, f), orig)
    copyFileSync(join(BASE, '_censored', slug, f), join(BASE, '_upload', slug, f))
    // 갤러리의 언베일 사진만 unveil- 접두로 올라가 있다(upload-bl-photos.mts).
    const path = `${OWNER}/official/${slug}/${/^(u\d+|\d+u)\.jpg$/.test(f) ? `unveil-${f}` : f}`
    const { error } = await storage.upload(path, readFileSync(join(BASE, '_censored', slug, f)), { contentType: 'image/jpeg', upsert: true })
    if (error) throw new Error(`upload ${path}: ${error.message}`)
    const before = json
    json = json.replace(new RegExp(`(/${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(\\?v=\\d+)?"`, 'g'), `$1?v=${Date.now()}"`)
    console.log(slug, f, json === before ? '(DB 에 URL 없음)' : 'ok')
  }
  await db.update(characters).set(JSON.parse(json)).where(eq(characters.id, row.id))
}
process.exit(0)
