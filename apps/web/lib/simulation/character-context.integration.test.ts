import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, characters, worlds, characterVisualIdentities, messages } from '@miro/db'
import { buildContext } from '@miro/engine'
import { parseCharacterForm } from '@/app/(main)/create/parse'
import { loadRealityContext } from '@/lib/reality/context'
import { createRoleplaySession } from './start'
import { loadSession } from './snapshot'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip

describeDb('creator fields shared by dialogue and proactive context', () => {
  const userIds: string[] = []
  afterAll(async () => {
    for (const id of userIds) await db.delete(users).where(eq(users.id, id))
  })

  it('loads the same saved character, current visual identity, world, and role-attributed history', async () => {
    const [owner, other] = await db.insert(users).values([
      { email: `context-owner-${randomUUID()}@example.test` },
      { email: `context-other-${randomUUID()}@example.test` },
    ]).returning()
    userIds.push(owner!.id, other!.id)
    const form = new FormData()
    for (const [key, value] of Object.entries({
      name: '서린', personality: '약속을 지키지만 누구에게나 다정하지 않다.', age: '29', nationality: '한국',
      occupation: '복원사', mbti: 'intj', hobbies: '독서,산책', dislikes: '거짓말', jealousy: '21', initiative: '36', emotionalExpression: '42',
      worldSetting: '잊힌 기억을 수리하는 공방', mood: '미스터리', startingContext: '비가 내리는 저녁 공방 앞에서 만났다.',
      eyes: '회색 눈', distinctive: '왼쪽 눈썹 흉터', hairColor: '은색', hairLength: '짧음', hairStyle: '옆으로 넘김',
      build: 'slim', gender: 'female', height: '171cm', detail: '곧은 자세', styleTags: '단정함,작업복', expression: '차분한 표정',
      sampleDialogue: JSON.stringify([{ role: 'character', text: 'SAMPLE_ONLY' }]),
      introDialogue: JSON.stringify([{ role: 'narrator', text: 'INTRO_NARRATOR_SECRET' }, { role: 'character', text: '어서 와요.' }]),
    })) form.set(key, value)
    const parsed = parseCharacterForm(form)
    const [c] = await db.insert(characters).values({ ...parsed.character, ownerId: owner!.id, isPublic: true,
      values: '약속', speechStyle: '짧은 존대', userNickname: '선배', socialPosition: '공방의 주인' }).returning()
    await db.insert(worlds).values({ characterId: c!.id, ...parsed.world })
    await db.insert(characterVisualIdentities).values([
      { characterId: c!.id, version: 1, baseFace: { distinctive: 'OLD_VISUAL' } },
      { characterId: c!.id, version: 2, ...parsed.visual },
      { characterId: c!.id, version: 3, isActive: false, baseFace: { distinctive: 'INACTIVE_VISUAL' } },
    ])
    const session = await createRoleplaySession(owner!.id, c!.id)
    const otherSession = await createRoleplaySession(other!.id, c!.id)
    const [npc, contact] = await db.insert(messages).values([
      { sessionId: session.sessionId, role: 'npc', content: 'NPC_CLAIM', blocks: [{ type: 'npc', speaker: '지수', text: 'NPC_CLAIM' }], turnIndex: 1 },
      { sessionId: session.sessionId, role: 'character', kind: 'reality_message', content: 'OWN_PRIOR_CONTACT', turnIndex: 2 },
      { sessionId: session.sessionId, role: 'system', content: 'SYSTEM_PRIVATE', turnIndex: 3 },
      { sessionId: session.sessionId, role: 'user', content: 'MODERATED_PRIVATE', hiddenAt: new Date(), turnIndex: 4 },
      { sessionId: otherSession.sessionId, role: 'user', content: 'OTHER_SESSION_PRIVATE', turnIndex: 1 },
    ]).returning()
    const loaded = await loadSession(session.sessionId, owner!.id)
    const proactive = await loadRealityContext(session.sessionId, owner!.id, '약속')
    expect(loaded).not.toBeNull()
    expect(proactive).not.toBeNull()
    const { identity, personality, worldRole, appearance } = loaded!.snapshot.character
    expect(proactive!.authoredCharacter).toEqual({ identity, personality, worldRole, appearance })
    expect(proactive!.authoredCharacter).not.toHaveProperty('ownerId')
    expect(proactive!.worldSetting).toBe(parsed.world.worldSetting)
    expect(proactive!.worldGenre).toBe(parsed.world.genre)
    expect(proactive!.recentMessages.map(m => m.id)).toEqual(loaded!.snapshot.recentMessages.map(m => m.id))
    const compiled = buildContext(loaded!.snapshot)
    for (const value of ['한국', 'INTJ', '선배', '공방의 주인', '회색 눈', '은색', '171cm', '단정함', 'SAMPLE_ONLY']) {
      expect(compiled.system).toContain(value)
      expect(JSON.stringify(proactive!.authoredCharacter)).toContain(value)
    }
    expect(loaded!.snapshot.recentMessages.find(m => m.content === 'INTRO_NARRATOR_SECRET')).toMatchObject({ role: 'narrator', knowledgeScope: 'omniscient' })
    expect(proactive!.recentMessages.find(m => m.id === npc!.id)).toMatchObject({ role: 'npc', npcName: '지수' })
    expect(proactive!.recentMessages.find(m => m.id === contact!.id)).toMatchObject({ kind: 'reality_message', at: contact!.createdAt.toISOString() })
    expect(compiled.prompt).toContain('NPC (지수): NPC_CLAIM')
    expect(compiled.prompt).toContain('내레이터 (전지적 서술 · 캐릭터 지식 아님): INTRO_NARRATOR_SECRET')
    for (const excluded of ['SYSTEM_PRIVATE', 'MODERATED_PRIVATE', 'OTHER_SESSION_PRIVATE', 'OLD_VISUAL', 'INACTIVE_VISUAL']) {
      expect(JSON.stringify(loaded)).not.toContain(excluded)
      expect(JSON.stringify(proactive)).not.toContain(excluded)
    }
    expect(loaded!.snapshot.character.worldRole.sampleDialogue).toEqual([{ role: 'character', text: 'SAMPLE_ONLY' }])
    expect(await loadRealityContext(session.sessionId, other!.id, '약속')).toBeNull()
    expect(await loadSession(session.sessionId, other!.id)).toBeNull()
  })
})
