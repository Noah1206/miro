/**
 * 운영 캐릭터 사진 미리보기(11/2) — 앱의 Modal 사진 경로(외형 → 영어 태그 → image_api)와 같은 방식으로 캐릭터마다 3장:
 * 일반(카페) · 언베일 혼자 유혹 · 언베일 정상위. 운영 DB 는 읽기만, 결과는 output/preview/<slug>/ 에만(채팅방에 올리지 않음).
 *
 *   npx tsx --env-file=../../.env scripts/preview-photos.mts            # 19세 이상·공개(또는 운영자 소유) 캐릭터 전부
 *   npx tsx --env-file=../../.env scripts/preview-photos.mts --only=official-kang-seheon
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { and, eq, isNull } from 'drizzle-orm'
import { db, characters, characterVisualIdentities } from '@miro/db'
import { buildVisualPrompt } from '@miro/domain'
import { generateModalImage, styleFor, toImageTags } from '../lib/ai/modal-image'
import { levelTags } from '../lib/ai/local-image'
import { PHOTO_SCENES } from '../lib/photo-scenes'

const OWNER = 'f5a0dfcb-0e4c-443e-be17-c982234926c1'
const MAX_IMAGES = 105   // 승인 상한 $3 안(장당 약 $0.015 + 태그 변환)
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7)
const OUT = new URL('../../../output/preview/', import.meta.url).pathname

const rows = await db.select({ id: characters.id, slug: characters.slug, name: characters.name, age: characters.age, audience: characters.audience, images: characters.images,
  isPublic: characters.isPublic, ownerId: characters.ownerId }).from(characters).where(and(isNull(characters.deletedAt), eq(characters.isDraft, false)))
const targets = rows.filter(c => (c.isPublic || c.ownerId === OWNER) && Number.parseInt(String(c.age ?? ''), 10) >= 19 && (!only || c.slug === only))
const scene = (id: string) => PHOTO_SCENES.find(s => s.id === id)!
const jobs = targets.flatMap(c => [
  { c, file: '1-일반-카페', s: scene('d_cafe'), ctx: { location: 'cafe', time: 'afternoon', mood: 'calm' }, unveil: false },
  { c, file: '2-언베일-유혹', s: scene('u_tease'), ctx: { location: 'bedroom', time: 'night', mood: 'intimate' }, unveil: true },
  { c, file: '3-언베일-정상위', s: scene('u_missionary'), ctx: { location: 'bedroom', time: 'night', mood: 'intimate' }, unveil: true },
])
if (jobs.length > MAX_IMAGES) throw new Error(`${jobs.length}장 > 상한 ${MAX_IMAGES}`)
console.log(`${targets.length}명 · ${jobs.length}장`)

const tagCache = new Map<string, Promise<string>>()
async function lookTags(c: (typeof targets)[number]) {
  if (!tagCache.has(c.id)) tagCache.set(c.id, (async () => {
    const [v] = await db.select().from(characterVisualIdentities)
      .where(and(eq(characterVisualIdentities.characterId, c.id), eq(characterVisualIdentities.isActive, true))).limit(1)
    if (!v) return ''
    if (v.hasRealPersonReference) throw new Error('real person reference')
    // 장소·시간은 장면 태그가 정하므로 외형만 태그로 바꾼다.
    const look = buildVisualPrompt({ identity: v as never, characterName: c.name, kind: 'photo', context: { location: '', time: '', mood: '', outfit: '', visualVersion: v.version } })
    return toImageTags(look)
  })())
  return tagCache.get(c.id)!
}

let done = 0, failed = 0
async function run(job: (typeof jobs)[number]) {
  const dir = `${OUT}${job.c.slug ?? job.c.id}`
  const path = `${dir}/${job.file}.png`
  if (existsSync(path)) { done++; return }   // 다시 돌리면 이어서
  try {
    const level = job.unveil ? levelTags('explicit') : null
    const tags = [level?.positive, job.s.tags].filter(Boolean).join(', ')
    const png = await generateModalImage({ style: styleFor(job.c.audience), look: await lookTags(job.c), tags, unveil: !!level?.mature, couple: job.s.couple, extraNeg: level?.negative,
      seed: Math.floor(Math.random() * 2_000_000_000), refUrl: job.c.images?.[0] })
    mkdirSync(dir, { recursive: true }); writeFileSync(path, png)
    done++
  } catch (e) { failed++; console.log('fail', job.c.name, job.file, (e as Error).message.slice(0, 120)) }
  if ((done + failed) % 10 === 0) console.log(`${done + failed}/${jobs.length} (실패 ${failed})`)
}
const queue = [...jobs]
await Promise.all(Array.from({ length: 6 }, async () => { for (let j = queue.shift(); j; j = queue.shift()) await run(j) }))
console.log(`끝: ${done}장 저장, 실패 ${failed} → ${OUT}`)
process.exit(0)
