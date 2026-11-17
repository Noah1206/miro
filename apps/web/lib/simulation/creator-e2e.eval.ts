import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'vitest'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db, aiUsage, characters, characterVisualIdentities, contactProfiles, messages, relationships, roleplaySessions, usageWindows, userPersonas, userSettings, users, worlds, worldStates } from '@miro/db'
import { defaultSessionPolicy } from '@miro/config'
import { parseCharacterForm } from '@/app/(main)/create/parse'
import { introMessages } from '@/lib/intro-dialogue'
import { inWrittenOrder } from './commit'
import { runConversationTurn } from './turn'
import { receiveMessenger, runMessengerInbox, messengerItems } from '@/lib/messenger/inbox'

/**
 * 사용자 제작 다인 작품 실측(11/17) — 만들기 화면과 같은 폼 파싱·저장(saveCharacter 의 DB 부분)으로 작품을 만들고,
 * 채팅방 5턴 + 문자 2통을 실제 모델로 돌린다. 인물별 화자·상태창·스탯·로어북·문자 보낸 사람을 파일로 남긴다(판정은 사람이).
 */
const OUT = process.env.MIRO_COMPARE_OUT
// 운영 구성(자율성 live, 강화 검토 off) — 공통 vitest 설정은 반대로 둔다(context-drift 와 같은 이유).
if (OUT) Object.assign(process.env, { MIRO_CHARACTER_AGENCY_MODE: 'live', MIRO_AGENCY_DEFAULT_POLICY: '', MIRO_FEATURE_STRICT_CONVERSATION_REVIEW: '0' })
const CAST = [
  { name: '서지안', intro: '카페 「온기」 사장, 29세. 차분하고 다정한 존댓말. 주인공에게 몰래 마음이 있다.', jealousy: 70, initiative: 40, emotionalExpression: 40 },
  { name: '한유나', intro: '카페 알바생, 22세. 시끄럽고 장난스러운 반말. 주인공을 오빠라고 부른다.', jealousy: 30, initiative: 80, emotionalExpression: 85 },
  { name: '도하린', intro: '단골손님, 31세 작가. 시니컬하고 짧게 말한다. 늘 창가 자리.', jealousy: 50, initiative: 50, emotionalExpression: 20 },
]
const LINES = [
  '안녕하세요, 오늘도 아메리카노 한 잔이요.',
  '유나야, 오늘 왜 이렇게 신났어?',
  '하린 씨는 오늘도 창가 자리네요. 요즘 뭐 쓰세요?',
  '근데 여기 비밀 메뉴 있다던데, 진짜예요?',
  '지안 씨, 오늘 마감하고 잠깐 얘기할 수 있어요?',
]

describe.skipIf(!OUT)('user-made ensemble work', () => {
  // 이어 돌리기(문자만): MIRO_CREATOR_SESSION=<방> MIRO_CREATOR_NOW=<ISO 시각> — 캐릭터 활동 시간 밖이면 답장이 아침으로 미뤄진다.
  it.skipIf(!process.env.MIRO_CREATOR_SESSION)('replies by text at a given time', async () => {
    const sessionId = process.env.MIRO_CREATOR_SESSION!, at = new Date(process.env.MIRO_CREATOR_NOW ?? Date.now())
    const [room] = await db.select({ userId: roleplaySessions.userId }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId))
    const out: Record<string, unknown>[] = []
    // 받는 사람이 다른 문자 두 통(MIRO_CREATOR_TEXTS=1) — 인물별로 따로 답하는지.
    if (process.env.MIRO_CREATOR_TEXTS) for (const input of ['유나야, 내일 아침에도 그 복숭아 시럽 있어?', '지안 씨, 새벽 라떼 내일 하나 부탁해도 돼요?'])
      await receiveMessenger({ userId: room!.userId, sessionId, input, requestId: randomUUID(), sentAt: at.toISOString() }, at)
    for (let i = 0; i < Number(process.env.MIRO_CREATOR_STEPS ?? 10); i++) await runMessengerInbox(new Date(at.getTime() + i * 4 * 60_000), { sessionId, limit: 1 })
    const items = await messengerItems(room!.userId, sessionId) ?? []
    for (const m of items) out.push({ role: m.role, kind: m.kind, content: m.content.slice(0, 200), speaker: m.blocks.map(b => (b as { speaker?: string }).speaker).find(Boolean) ?? null })
    const [cost] = await db.select({ usd: sql<string>`coalesce(sum(coalesce(${aiUsage.actualCost}, ${aiUsage.estimatedCost})), 0)` }).from(aiUsage).where(and(eq(aiUsage.userId, room!.userId), gt(aiUsage.id, 0)))
    await writeFile(OUT!, JSON.stringify({ usd: Number(cost!.usd), items: out }, null, 2))
  }, 30 * 60_000)

  it.skipIf(!!process.env.MIRO_CREATOR_SESSION)('creates via the create form and runs chat + messenger', async () => {
    const [owner] = await db.insert(users).values({ email: `creator-e2e-${Date.now()}@example.test` }).returning()
    const userId = owner!.id
    await db.insert(userSettings).values({ userId, timeZone: 'Asia/Seoul' })
    const now = new Date()
    await db.insert(usageWindows).values({ userId, plan: 'pro', startedAt: now, endsAt: new Date(now.getTime() + 30 * 86_400_000), limit: 100_000_000 })
    await db.insert(userPersonas).values({ userId, name: '민준', gender: 'male', description: '카페 근처 회사에 다니는 20대 후반 직장인. 매일 아침 「온기」에 들른다.' })

    // 만들기 화면이 보내는 폼과 같은 칸.
    const f = new FormData()
    const set = (k: string, v: string) => f.set(k, v)
    set('experienceType', 'reality'); set('intent', 'publish'); set('isPublic', 'off')
    set('name', '카페 온기'); set('title', '세 여자가 있는 동네 카페')
    set('personality', '[세계] 서울 성수동 골목의 작은 카페 「온기」. 사장 서지안, 알바생 한유나, 단골 작가 도하린이 매일 주인공을 맞는다. 장면마다 그 자리에 있는 인물만 말한다.')
    set('startingContext', '평일 아침 8시, 주인공이 「온기」 문을 연다. 지안은 카운터, 유나는 테이블을 닦고, 하린은 창가에 앉아 있다.')
    set('worldSetting', '서울 성수동. 현대. 카페 「온기」는 주인공 회사 1층 맞은편.')
    set('worldLocation', '카페 「온기」'); set('startingTime', '아침')
    set('ensembleCast', JSON.stringify(CAST))
    set('ensembleVoices', JSON.stringify(Object.fromEntries(CAST.map(c => [c.name, '']))))
    set('statusFormat', '📍 장소 | 🕐 시간\n☕ 오늘의 분위기: (한 줄)')
    set('stats', JSON.stringify([{ name: '지안 호감', min: 0, max: 100, default: 20 }, { name: '유나 호감', min: 0, max: 100, default: 30 }]))
    set('lore', JSON.stringify([{ name: '비밀 메뉴', keywords: ['비밀 메뉴'], content: '「온기」의 비밀 메뉴는 "새벽 라떼" — 지안이 단골에게만 만들어 주는 흑임자 꿀 라떼다. 메뉴판에는 없다.' }]))
    set('contactEnabled', 'on'); set('contactFrequency', '60'); set('preferredChannel', 'message')
    const p = parseCharacterForm(f)

    // saveCharacter 의 DB 부분(사진 업로드·로그인 확인만 뺌).
    const characterId = randomUUID()
    const { sessionId } = await db.transaction(async tx => {
      await tx.insert(characters).values({ id: characterId, ownerId: userId, isOfficial: false, ...p.character, images: [], voiceId: null,
        ensembleVoices: p.ensembleVoices, ensemblePhotos: p.ensemblePhotos, ensembleCast: p.ensembleCast, isDraft: false, experienceType: p.experienceType, isPublic: false })
      const [w] = await tx.insert(worlds).values({ characterId, ...p.world }).returning({ id: worlds.id })
      await tx.insert(contactProfiles).values({ characterId, ...p.contact })
      await tx.insert(characterVisualIdentities).values({ characterId, ...p.visual, referenceSource: 'text' })
      const [session] = await tx.insert(roleplaySessions).values({ userId, characterId, worldId: w!.id, policyVersion: defaultSessionPolicy(p.experienceType) }).returning({ id: roleplaySessions.id })
      await tx.insert(worldStates).values({ sessionId: session!.id, currentLocation: p.world.location ?? '어딘가', currentTime: p.startingTime ?? '저녁' })
      await tx.insert(relationships).values({ sessionId: session!.id, ...p.initialRelationship })
      const opening = introMessages(session!.id, p.character.sampleDialogue)
      if (opening.length) await tx.insert(messages).values(inWrittenOrder(opening))
      return { sessionId: session!.id }
    })

    const turns: Record<string, unknown>[] = []
    const texts: Record<string, unknown>[] = []
    try {
      for (const [i, input] of LINES.entries()) {
        const r = await runConversationTurn({ userId, sessionId, input })
        const blocks = r.ok ? r.blocks as Array<{ type: string; speaker?: string | null; text: string }> : []
        turns.push({ n: i + 1, input, ok: r.ok, reason: r.ok ? null : r.reason,
          speakers: [...new Set(blocks.map(b => b.speaker).filter(Boolean))], hasStatus: blocks.some(b => b.type === 'status'),
          status: blocks.find(b => b.type === 'status') ?? null, reply: r.ok ? r.responseText : null })
        if (!r.ok && (r.reason === 'budget' || r.reason === 'usage')) break
      }
      for (const input of ['유나야 오늘 퇴근하고 뭐 해?', '지안 씨, 아까 얘기 고마웠어요. 잘 들어가셨어요?']) {
        await receiveMessenger({ userId, sessionId, input, requestId: randomUUID() })
        await runMessengerInbox(new Date(), { sessionId, limit: 1 })
        const items = await messengerItems(userId, sessionId) ?? []
        const reply = [...items].reverse().find(m => m.role === 'character')
        texts.push({ input, reply: reply?.content ?? null, speaker: (reply?.blocks ?? []).map(b => (b as { speaker?: string }).speaker).find(Boolean) ?? null })
      }
    } finally {
      const [stored] = await db.select({ cast: characters.ensembleCast, stats: characters.stats, statusFormat: characters.statusFormat, lore: characters.lore }).from(characters).where(eq(characters.id, characterId))
      const statRows = await db.select({ blocks: messages.blocks }).from(messages).where(and(eq(messages.sessionId, sessionId), eq(messages.role, 'character'))).orderBy(asc(messages.createdAt))
      const [cost] = await db.select({ usd: sql<string>`coalesce(sum(coalesce(${aiUsage.actualCost}, ${aiUsage.estimatedCost})), 0)` }).from(aiUsage).where(and(eq(aiUsage.userId, userId), gt(aiUsage.id, 0)))
      await writeFile(OUT!, JSON.stringify({ usd: Number(cost!.usd), sessionId, stored: { cast: (stored?.cast ?? []).map(c => c.name), stats: stored?.stats, statusFormat: stored?.statusFormat, lore: stored?.lore?.length },
        turns, texts, characterMessages: statRows.length }, null, 2))
    }
  }, 60 * 60_000)
})
