/**
 * 공식 BL 캐릭터(bl-characters.data.mts)를 운영에 넣는다 — 권재혁과 같은 모양(운영자 소유·공개·미로·사진 없음).
 * 만들기 화면과 같은 행을 만든다: characters + worlds + contact_profiles(생활 리듬 authored) + visual identity + 자율성 판.
 * slug 로 중복을 막아서 다시 돌려도 두 번 들어가지 않는다.
 *
 *   npx tsx scripts/seed-bl-characters.mts --preview          # docs/bl-characters-2026-10-04.md 로 검토용 문서만
 *   npx tsx scripts/seed-bl-characters.mts                    # 길이·형식 검사만(dry run)
 *   npx tsx scripts/seed-bl-characters.mts --apply            # 운영 DB 에 넣기
 *   npx tsx scripts/seed-bl-characters.mts --apply --ai       # 넣고 나서 관계 성격표·자율성 컴파일까지(모델 호출, 캐릭터당 약 $0.02)
 *   npx tsx scripts/seed-bl-characters.mts --apply --update   # 이미 있는 slug 는 같은 id 로 내용을 덮어쓴다(대화방·관계는 그대로)
 */
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { SEEDS as SEEDS_1, type Seed } from './bl-characters.data.mts'
import { SEEDS_2 } from './bl-characters-2.data.mts'
import { SEEDS_3 } from './bl-characters-3.data.mts'
import { SEEDS_4_TIGER } from './bl-characters-4-tiger.data.mts'
import { SEEDS_4_TAEGYEONG } from './bl-characters-4-taegyeong.data.mts'
import { SEEDS_4_SION } from './bl-characters-4-sion.data.mts'
import { SEEDS_4_MU } from './bl-characters-4-mu.data.mts'
import { SEEDS_4_HANGYEOL } from './bl-characters-4-hangyeol.data.mts'
import { SEEDS_4_IDO } from './bl-characters-4-ido.data.mts'
import { SEEDS_MALE } from './male-characters.data.mts'
import { MALE_CHARACTERS_A } from './male-characters-a.data.mts'
import { MALE_CHARACTERS_B, SCENE_OPENINGS_B } from './male-characters-b.data.mts'
import { MALE_CHARACTERS_C } from './male-characters-c.data.mts'
import { MALE_CHARACTERS_D } from './male-characters-d.data.mts'
import { MALE_CHARACTERS_E } from './male-characters-e.data.mts'
import { SCENE_OPENINGS as SCENE_OPENINGS_BASE } from './scene-openings.data.mts'
import { MALE_BODY, MALE_COVER_UNVEIL, MALE_GUIDE, MALE_INTRO, MALE_PUBLIC, MALE_ROSTER, MALE_VOICES, MALE_SPEECH, MALE_START } from './male-characters-public.data.mts'
// 11/3 남성향 12명: 화면엔 짧은 소개 + 상세정보(키·몸무게·쓰리사이즈), 원래 긴 소개는 비공개 설정 맨 앞으로(AI 는 그대로 읽는다).
// 수치는 사진 생성용 외형(bodyProfile.detail)에도 붙인다.
function withMalePublic(s: Seed): Seed {
  let intro = MALE_PUBLIC[s.slug]; const body = MALE_BODY[s.slug]
  if (!intro) return s
  // 여러 명 나오는 카드는 등장인물 목록이 소개 글 아래에 보이고, 대표 한 명 수치(상세정보)는 목록과 겹쳐 뺀다.
  const roster = MALE_ROSTER[s.slug]
  if (roster) intro = `${intro}\n\n${roster}`
  const stats = !roster && body && `상세정보${body.who ? ` (${body.who})` : ''}\n${s.visual.bodyProfile.height} · ${body.kg}kg\n쓰리사이즈 B${body.b}/W${body.w}/H${body.h}cm · ${body.cup}컵`
  const start = MALE_START[s.slug], scenes = MALE_INTRO[s.slug]
  // 장면마다 서술 하나 + 대사 하나. 첫 줄은 원래 첫 줄의 장면 정보(시각·장소·상황)를 그대로 잇는다. 말투 예시 문답은 뺀다.
  const sampleDialogue = scenes ? Object.entries(scenes).flatMap(([scene, parts]) => {
    const first = s.sampleDialogue.find(d => d.purpose === 'intro' && d.scene === scene)
    if (!first) throw new Error(`${s.name}: unknown scene ${scene}`)
    const [narration, ...rest] = parts.slice(0, -1)
    return [{ ...first, role: 'narrator' as const, text: narration! },
      ...rest.map(text => ({ role: 'narrator' as const, purpose: 'intro' as const, scene, text })),
      { role: 'character' as const, purpose: 'intro' as const, scene, text: parts[parts.length - 1]! }]
  }) : s.sampleDialogue
  // 상세 화면은 말투+가치관을 한 줄로 보여 준다 — 화면엔 성격 묘사(MALE_SPEECH)만, 가치관은 비공개로.
  const speech = MALE_SPEECH[s.slug]
  return { ...s, sampleDialogue, speechStyle: speech ?? s.speechStyle, values: speech ? '' : s.values, personaGuide: MALE_GUIDE[s.slug] ?? s.personaGuide, ...MALE_VOICES[s.slug], ...(MALE_COVER_UNVEIL.has(s.slug) ? { coverUnveil: true as const } : {}),
    personality: stats ? `${intro}\n\n${stats}` : intro, startingContext: start ?? s.startingContext,
    secret: `[상세 설정]\n${s.personality}\n\n${speech ? `[가치관]\n${s.values}\n\n` : ''}${start ? `[시작 상황 상세]\n${s.startingContext}\n\n` : ''}${s.secret}`,
    visual: body ? { ...s.visual, bodyProfile: { ...s.visual.bodyProfile, detail: `${s.visual.bodyProfile.detail}, B${body.b}/W${body.w}/H${body.h}cm ${body.cup}컵` } } : s.visual }
}
// 11/3 남성향 12명: B 묶음은 두 번째 시작 상황의 장면 설명을 같은 파일에 둔다(C 는 인트로 줄에 직접, A 는 인트로 글만).
const SCENE_OPENINGS = { ...SCENE_OPENINGS_BASE, ...SCENE_OPENINGS_B }

// 기본이 아닌 도입부의 첫 인트로 줄에 그 장면의 첫 장면 설명·시각·장소를 붙인다(10/6, lib/intro-dialogue sceneOpening).
function withSceneOpenings(s: Seed): Seed {
  const map = SCENE_OPENINGS[s.slug] ?? {}
  const seen = new Set<string>()
  return { ...s, sampleDialogue: s.sampleDialogue.map((d) => {
    if (d.purpose !== 'intro' || !d.scene || seen.has(d.scene) || !map[d.scene]) return d
    seen.add(d.scene)
    return { ...d, ...map[d.scene] }
  }) }
}

// 1차 11명(10/4) + 2차 3명(10/5) + 3차 6명(10/18). slug 로 중복을 막으니 다시 돌려도 새 것만 들어간다.
// 4차(10/19): 작품 6개의 서브공 19명 — 작품 세계를 이어받은 1:1 캐릭터.
// --only=<slug> 이면 그 캐릭터 하나만 다룬다(11/1, 다른 미반영 slug 가 같이 들어가지 않게).
const ONLY = process.argv.find(a => a.startsWith('--only='))?.slice(7)
const ALL: Seed[] = [...SEEDS_1, ...SEEDS_2, ...SEEDS_3, ...SEEDS_4_TIGER, ...SEEDS_4_TAEGYEONG, ...SEEDS_4_SION, ...SEEDS_4_MU, ...SEEDS_4_HANGYEOL, ...SEEDS_4_IDO, ...SEEDS_MALE, ...MALE_CHARACTERS_A, ...MALE_CHARACTERS_B, ...MALE_CHARACTERS_C, ...MALE_CHARACTERS_D, ...MALE_CHARACTERS_E].filter(s => !ONLY || s.slug === ONLY).map(withSceneOpenings).map(withMalePublic)   // --only 를 먼저 걸러 다른 작품의 쓰다 만 데이터에 막히지 않게(11/4)
const SEEDS = ONLY ? ALL.filter(s => s.slug === ONLY) : ALL
if (ONLY && !SEEDS.length) throw new Error(`no seed ${ONLY}`)

const OWNER = 'f5a0dfcb-0e4c-443e-be17-c982234926c1' // 운영자(ab40905045@gmail.com) — 권재혁 소유자와 같다
const DOC = new URL('../../../docs/bl-characters-2026-10-04.md', import.meta.url)
const args = new Set(process.argv.slice(2))

function check(s: Seed): string[] {
  const bad: string[] = []
  if (s.name.length > 20) bad.push('name>20')
  if (s.tagline.length > 40) bad.push(`tagline ${s.tagline.length}>40`)
  if (s.startingContext.length > 600) bad.push(`startingContext ${s.startingContext.length}>600`)
  // 일반 전용(고등학생) 캐릭터는 직업에 '고등학생'을 그대로 써서 언베일이 막히게 한다 — 그 검사만 건너뛴다.
  if (!s.general && Number(s.age) < 19) bad.push('age<19')
  if (!s.general && /미성년|초등학|중학생|고등학생|고교생|청소년/.test([s.age, s.occupation, s.tagline, s.personality].join(' '))) bad.push('minor word')
  if (s.general && !/고등학생/.test(s.occupation)) bad.push('general but occupation lacks 고등학생')
  for (const [i, d] of s.sampleDialogue.entries()) if (d.text.length > 500) bad.push(`dialogue[${i}] ${d.text.length}>500`)
  if (s.sampleDialogue.length > 20) bad.push('dialogue>20')
  if (s.lore.length > 20) bad.push('lore>20')
  if (s.hobbies.length > 6 || s.dislikes.length > 6) bad.push('tags>6')
  if (s.contact.routine.blocks.length > 14) bad.push('routine>14')
  const scenes = new Set(s.sampleDialogue.filter(d => d.purpose === 'intro').map(d => d.scene ?? ''))
  for (const [name, o] of Object.entries(SCENE_OPENINGS[s.slug] ?? {})) {
    if (!scenes.has(name)) bad.push(`scene opening for unknown scene ${name}`)
    if (o.context.length > 600) bad.push(`scene ${name} context ${o.context.length}>600`)
  }
  return bad
}

function markdown(s: Seed): string {
  const intro = s.sampleDialogue.filter(d => d.purpose === 'intro').map(d => d.role === 'narrator' ? `> ${d.text}` : `**${s.name}:** ${d.text}`).join('\n\n')
  const sample = s.sampleDialogue.filter(d => !d.purpose).map(d => `- ${d.role === 'user' ? '유저' : s.name}: ${d.text}`).join('\n')
  const routine = s.contact.routine.blocks.map(b => `- ${b.days.length ? b.days.map(d => '일월화수목금토'[d]).join('') : '매일'} ${b.start}~${b.end} ${b.label} (${b.availability})`).join('\n')
  return `## ${s.name} — ${s.tagline}${s.general ? ' (일반 전용 · 언베일 불가)' : ''}

**${s.age}세 · ${s.occupation} · ${s.mbti}** · 질투 ${s.jealousy} / 주도 ${s.initiative} / 감정표현 ${s.emotionalExpression} · 시작 관계 ${JSON.stringify(s.initialRelationship)}

### 공개 소개 (${s.personality.length}자)
${s.personality}

### 비공개 설정 (${s.secret.length}자 — 프롬프트에만)
${s.secret}

**가치관:** ${s.values}
**말투:** ${s.speechStyle}
**호칭:** ${s.userNickname} · **좋아함:** ${s.hobbies.join(', ')} · **싫어함:** ${s.dislikes.join(', ')}

### 시작 상황 (${s.startingContext.length}자, 시작 시각 ${s.startingTime})
${s.startingContext}

### 인트로 (${s.sampleDialogue.filter(d => d.purpose === 'intro').reduce((n, d) => n + d.text.length, 0)}자)
${intro}

### 말투 예시
${sample}

### 로어 (${s.lore.length})
${s.lore.map(l => `- **${l.keywords.join('·')}** — ${l.content}`).join('\n')}

### 세계
${s.world.location} · ${s.world.genre}
${s.world.worldSetting}

### 생활 리듬 (연락 빈도 ${s.contact.contactFrequency}, 답장 ${s.contact.replyDelayMinutes}분, 활동 ${s.contact.activeHoursStart}~${s.contact.activeHoursEnd})
${s.contact.routine.note}
${routine}
`
}

const problems = SEEDS.map(s => [s.name, check(s)] as const).filter(([, b]) => b.length)
if (problems.length) { console.error('형식 오류:', problems); process.exit(1) }

// 11/3 남성향 12명 검토 문서: --male-preview → docs/male-characters-2026-11-03.md
if (args.has('--male-preview')) {
  const twelve = [...MALE_CHARACTERS_A, ...MALE_CHARACTERS_B, ...MALE_CHARACTERS_C].map(withSceneOpenings).map(withMalePublic)
  const doc = new URL('../../../docs/male-characters-2026-11-03.md', import.meta.url)
  writeFileSync(doc, `# 남성향 공식 캐릭터 12명 — 전문 (2026-11-03)\n\n\`apps/web/scripts/male-characters-{a,b,c}.data.mts\` 에서 만든 검토용 문서. 고칠 건 데이터 파일에서 고친다.\n\n${twelve.map(markdown).join('\n---\n\n')}`)
  console.log('wrote', doc.pathname); process.exit(0)
}

if (args.has('--preview')) {
  writeFileSync(DOC, `# 공식 BL 캐릭터 11명 — 전문 (2026-10-04)\n\n\`apps/web/scripts/bl-characters.data.mts\` 에서 만든 검토용 문서. 고칠 건 데이터 파일에서 고친다.\n\n${SEEDS.map(markdown).join('\n---\n\n')}`)
  console.log('wrote', DOC.pathname); process.exit(0)
}

for (const s of SEEDS) console.log(s.slug, s.name, `소개 ${s.personality.length}자`, `비공개 ${s.secret.length}자`, `인트로 ${s.sampleDialogue.filter(d => d.purpose === 'intro').reduce((n, d) => n + d.text.length, 0)}자`, `로어 ${s.lore.length}`)
if (!args.has('--apply')) { console.log('(dry run — --apply 로 넣는다)'); process.exit(0) }

const { eq } = await import('drizzle-orm')
const { db, characters, worlds, contactProfiles, characterVisualIdentities } = await import('@miro/db')
const { parseRoutine } = await import('@miro/domain')
const { captureAgencyRevision } = await import('../lib/agency/revisions')

// 장면 사진(upload-bl-photos 가 붙인 image)은 데이터 파일에 없다 — 덮어쓸 때 같은 도입부의 첫 인트로 줄에 되살린다(10/6, 한 번 날렸다).
function keepSceneImages(next: Seed['sampleDialogue'], prev: Array<{ purpose?: string; scene?: string; image?: string }>) {
  const images = new Map(prev.filter(d => d.purpose === 'intro' && d.image).map(d => [d.scene ?? '', d.image!]))
  return next.map((d) => {
    const image = d.purpose === 'intro' ? images.get(d.scene ?? '') : undefined
    if (!image) return d
    images.delete(d.scene ?? '')
    return { ...d, image }
  })
}

const inserted: Array<{ id: string; name: string; revisionId: string | null }> = []
for (const s of SEEDS) {
  const [exists] = await db.select({ id: characters.id, dialogue: characters.sampleDialogue, deletedAt: characters.deletedAt }).from(characters).where(eq(characters.slug, s.slug)).limit(1)
  // 운영에서 지운 캐릭터는 되살리지 않는다(10/18, 도윤재·강무진).
  if (exists?.deletedAt) { console.log('skip (삭제됨)', s.name, exists.id); continue }
  if (exists && !args.has('--update')) { console.log('skip (있음)', s.name, exists.id); continue }
  const routine = parseRoutine(s.contact.routine, 'authored', new Date().toISOString())
  if (!routine) throw new Error(`routine invalid: ${s.name}`)
  const id = exists?.id ?? randomUUID()
  const row = {
    name: s.name, age: s.age, nationality: s.nationality ?? '한국', occupation: s.occupation, mbti: s.mbti, tagline: s.tagline,
    personality: s.personality, secret: s.secret, values: s.values, speechStyle: s.speechStyle, userNickname: s.userNickname,
    hobbies: s.hobbies, dislikes: s.dislikes,
    jealousy: s.jealousy, initiative: s.initiative, emotionalExpression: s.emotionalExpression,
    relationshipKeywords: s.relationshipKeywords, startingContext: s.startingContext, startingTime: s.startingTime,
    sampleDialogue: keepSceneImages(s.sampleDialogue, exists?.dialogue ?? []), lore: s.lore, initialRelationship: s.initialRelationship,
    personaGuide: s.personaGuide ?? '', coverUnveil: s.coverUnveil ?? false,
    ...(s.voice ? { voiceId: s.voice } : {}), ...(s.ensembleVoices ? { ensembleVoices: s.ensembleVoices } : {}),
  }
  const { routine: _r, ...contact } = s.contact
  const revision = await db.transaction(async (tx) => {
    if (exists) {
      // 같은 id 로 덮어쓴다 — 대화방·관계·사진은 그대로. 세계·연락 성향·외형은 캐릭터당 한 행이라 통째로 바꾼다.
      await tx.update(characters).set(row).where(eq(characters.id, id))
      await tx.update(worlds).set({ era: s.world.era ?? null, location: s.world.location, genre: s.world.genre, worldSetting: s.world.worldSetting }).where(eq(worlds.characterId, id))
      await tx.update(contactProfiles).set({ routine, ...contact }).where(eq(contactProfiles.characterId, id))
      await tx.update(characterVisualIdentities).set({ ...s.visual }).where(eq(characterVisualIdentities.characterId, id))
    } else {
      await tx.insert(characters).values({ id, ownerId: OWNER, isOfficial: false, slug: s.slug, isDraft: false, isPublic: !s.private, audience: s.audience ?? 'female', experienceType: 'reality', images: [], ...row })
      await tx.insert(worlds).values({ characterId: id, era: s.world.era ?? null, location: s.world.location, genre: s.world.genre, worldSetting: s.world.worldSetting })
      await tx.insert(contactProfiles).values({ characterId: id, enabled: true, preferredChannel: 'message', videoCallProbability: 0, routine, ...contact })
      await tx.insert(characterVisualIdentities).values({ characterId: id, ...s.visual, referenceSource: 'text' })
    }
    return captureAgencyRevision(tx, id, { explicitFields: ['personality.jealousy', 'personality.initiative', 'personality.emotionalExpression'] })
  })
  inserted.push({ id, name: s.name, revisionId: revision?.id ?? null })
  console.log(exists ? 'updated' : 'inserted', s.name, id, 'revision', revision?.id ?? '-')
}

if (args.has('--ai') && inserted.length) {
  const { refreshRelationshipProfile } = await import('../lib/relationship-profile')
  const { compileAgencyRevision } = await import('../lib/agency/runtime')
  const { resolveRpLLM } = await import('../lib/simulation/mock-llm')
  for (const c of inserted) {
    const profile = await refreshRelationshipProfile(c.id, OWNER).catch((e: Error) => `failed: ${e.message}`)
    const compiled = c.revisionId
      ? await compileAgencyRevision(c.revisionId, resolveRpLLM('캐릭터 설정', { userId: OWNER, requestId: randomUUID(), workload: 'background', usageUnits: 0 })).catch((e: Error) => `failed: ${e.message}`)
      : 'no revision'
    console.log(c.name, 'profile', profile, 'agency', compiled)
  }
}
process.exit(0)
