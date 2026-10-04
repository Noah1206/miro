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
import { SEEDS, type Seed } from './bl-characters.data.mts'

const OWNER = 'f5a0dfcb-0e4c-443e-be17-c982234926c1' // 운영자(ab40905045@gmail.com) — 권재혁 소유자와 같다
const DOC = new URL('../../../docs/bl-characters-2026-10-04.md', import.meta.url)
const args = new Set(process.argv.slice(2))

function check(s: Seed): string[] {
  const bad: string[] = []
  if (s.name.length > 10) bad.push('name>10')
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

const inserted: Array<{ id: string; name: string; revisionId: string | null }> = []
for (const s of SEEDS) {
  const [exists] = await db.select({ id: characters.id }).from(characters).where(eq(characters.slug, s.slug)).limit(1)
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
    sampleDialogue: s.sampleDialogue, lore: s.lore, initialRelationship: s.initialRelationship,
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
      await tx.insert(characters).values({ id, ownerId: OWNER, isOfficial: false, slug: s.slug, isDraft: false, isPublic: true, experienceType: 'reality', images: [], ...row })
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
