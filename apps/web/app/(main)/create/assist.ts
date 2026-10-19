'use server'
import { randomUUID } from 'node:crypto'
import { POLICY } from '@miro/config'
import { DEFAULT_CHARACTER_STATE, localClock, type CharacterCore, type RelationshipState, type WorldState } from '@miro/domain'
import { responseJsonSchema, runTurn, UnsafeContentError, type RecentMessage, type SimulationSnapshot } from '@miro/engine'
import { AIBudgetDeniedError, buildMockDraft, CharacterDraft, createAI, generateCharacterDraft } from '@miro/providers'
import { requireUser } from '@/lib/auth'
import { msg } from '@/lib/i18n'
import { introDialogue } from '@/lib/intro-dialogue'
import { resolveRpLLM } from '@/lib/simulation/mock-llm'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
import { parseCharacterForm, TEST_CHAT_LIMIT } from './parse'

/** 자동 채우기 결과 — 만들기 폼의 칸 이름 그대로. 화면은 비어 있는 칸에만 넣는다. */
export type QuickFill = {
  name: string; title: string; personality: string; age: string; nationality: string; occupation: string; mbti: string
  hobbies: string[]; dislikes: string[]
  worldSetting: string; worldLocation: string; startingContext: string; startingTime: string; firstLine: string
  relationshipKeywords: string[]
  gender: string; build: string; height: string; detail: string
  eyes: string; nose: string; jaw: string; skin: string; distinctive: string
  hairColor: string; hairLength: string; hairStyle: string; expression: string; styleTags: string[]
}

const QUICK_FILL_KNOWN = ['name', 'title', 'personality', 'age', 'nationality', 'occupation', 'worldSetting', 'startingContext'] as const
const KNOWN_LABEL: Record<(typeof QUICK_FILL_KNOWN)[number], string> = {
  name: '이름', title: '소개', personality: '성격', age: '나이', nationality: '국적', occupation: '직업', worldSetting: '세계관', startingContext: '첫 장면',
}

/**
 * 한두 문장 설명 → 빈 칸을 채울 초안(10/19, 베이비챗·크랙의 '자동 생성'). 이미 적힌 칸은 설명에 붙여 보내 모델이 그 사실을 지키게 한다.
 * 사용자의 월 사용량은 차감하지 않는다 — 만들기를 돕는 준비 비용이다.
 */
export async function quickFill(description: string, known: Partial<Record<(typeof QUICK_FILL_KNOWN)[number], string>>): Promise<QuickFill> {
  const user = await requireUser()
  const text = description.trim().slice(0, 300)
  const facts = QUICK_FILL_KNOWN.flatMap(key => {
    const value = (known[key] ?? '').trim().slice(0, 600)
    return value ? [`${KNOWN_LABEL[key]}: ${value}`] : []
  })
  if (!text && facts.length === 0) throw new Error('DESCRIPTION_REQUIRED')
  installAIUsageSink()
  const llm = createAI({ mock: req => buildMockDraft(req.prompt), context: {
    userId: user.id, requestId: randomUUID(), workload: 'interactive', usageUnits: 0, origin: 'character:quick-fill',
  } })
  const d = await generateCharacterDraft(llm, [text || '아래 정해진 내용에 어울리는 인물', ...facts].join('\n'), { responseSchema: responseJsonSchema(CharacterDraft) })
  return {
    name: d.identity.name.replace(/^\[초안\]\s*/, '').slice(0, 10), title: d.identity.tagline, age: d.identity.age === null ? '' : String(d.identity.age),
    nationality: d.identity.nationality ?? '', occupation: d.identity.occupation ?? '', mbti: d.identity.mbti ?? '',
    personality: [d.personality.personality, d.personality.values, d.personality.speechStyle].filter(Boolean).join('\n').slice(0, 1000),
    hobbies: d.personality.hobbies, dislikes: d.personality.dislikes,
    worldSetting: d.world.worldSetting, worldLocation: d.world.location, startingContext: d.startingContext, startingTime: d.startingTime, firstLine: d.firstLine,
    relationshipKeywords: d.presentation.relationshipKeywords,
    gender: d.appearance.body.gender, build: d.appearance.body.build, height: d.appearance.body.height, detail: d.appearance.body.detail,
    eyes: d.appearance.baseFace.eyes, nose: d.appearance.baseFace.nose, jaw: d.appearance.baseFace.jaw, skin: d.appearance.baseFace.skin, distinctive: d.appearance.baseFace.distinctive,
    hairColor: d.appearance.hair.color, hairLength: d.appearance.hair.length, hairStyle: d.appearance.hair.style, expression: d.appearance.expression, styleTags: d.appearance.styleTags,
  }
}

export type TestTurnMessage = { role: 'user' | 'character'; text: string }
export type TestBlock = { type: string; text: string }

/**
 * 등록 전 테스트 채팅 한 턴(10/19). 폼의 글 칸을 그대로 캐릭터로 삼아 실제 대사 파이프라인(runTurn)을 돌리되 아무것도 저장하지 않는다.
 * ponytail: 기억·자율성·사건 규칙의 축적, 사용량 차감은 없다 — 성격·말투·첫 장면이 맞는지 보는 용도. 한 초안당 TEST_CHAT_LIMIT 턴.
 */
export async function testTurn(entries: Array<[string, string]>, history: TestTurnMessage[], input: string): Promise<{ blocks: TestBlock[] } | { error: string }> {
  const user = await requireUser()
  const text = input.trim().slice(0, 500)
  if (!text) return { error: msg('메시지를 입력해 주세요.') }
  if (history.filter(m => m.role === 'user').length >= TEST_CHAT_LIMIT) return { error: msg('테스트 대화는 10번까지예요. 게시하면 계속 이야기할 수 있어요.') }

  const form = new FormData()
  for (const [key, value] of entries) if (typeof key === 'string' && typeof value === 'string') form.append(key, value)
  form.set('intent', 'draft')
  if (!String(form.get('name') ?? '').trim()) form.set('name', '이름')
  let p: ReturnType<typeof parseCharacterForm>
  try { p = parseCharacterForm(form) } catch { return { error: msg('설정을 읽지 못했어요. 칸을 확인해 주세요.') } }
  const name = p.character.name
  const now = new Date()
  const character: CharacterCore = {
    id: 'preview', ownerId: user.id, isOfficial: false,
    identity: { name, age: p.character.age, nationality: p.character.nationality, occupation: p.character.occupation, mbti: p.character.mbti },
    personality: {
      personality: p.character.personality, values: null, speechStyle: null, userNickname: null,
      hobbies: p.character.hobbies, dislikes: p.character.dislikes,
      jealousy: p.character.jealousy, initiative: p.character.initiative, emotionalExpression: p.character.emotionalExpression,
      relationshipProfile: p.character.relationshipProfile ?? null,
    },
    worldRole: { socialPosition: null, startingContext: p.character.startingContext, sampleDialogue: p.character.sampleDialogue, lore: p.character.lore },
    visualIdentityId: null, contactProfileId: null,
    appearance: { ...p.visual, outfitProfile: {} },
  }
  const world: WorldState = {
    id: 'preview', sessionId: 'preview', version: 0, currentLocation: p.world.location ?? '어딘가', currentTime: p.startingTime ?? '저녁',
    currentSceneId: null, worldStatus: null, activeEventIds: [], activeNpcIds: [], unresolvedWorldEvents: [], updatedAt: now,
  }
  const { bonding: _bonding, ...dims } = p.initialRelationship
  const relationship: RelationshipState = { id: 'preview', sessionId: 'preview', version: 0, ...dims, unresolvedEventIds: [], updatedAt: now }
  const recentMessages: RecentMessage[] = [
    ...introDialogue(p.character.sampleDialogue).map(t => ({ role: t.role, content: t.text } as RecentMessage)),
    ...history.slice(-20).map(m => ({ role: m.role, content: m.text.slice(0, 2000) } as RecentMessage)),
  ]
  const snapshot: SimulationSnapshot = {
    character, world, worldSetting: p.world.worldSetting, worldGenre: p.world.genre, relationship, scene: null, memories: [], recentMessages,
    activeEvents: [], recentlyResolvedEvents: [], activeNpcs: [], recentRealityContacts: [], turnCount: history.filter(m => m.role === 'user').length,
    experienceType: p.experienceType, characterState: DEFAULT_CHARACTER_STATE, clock: localClock(now, POLICY.reality.defaultTimeZone),
  }
  const llm = resolveRpLLM(name, { userId: user.id, requestId: randomUUID(), workload: 'interactive', usageUnits: 0, origin: 'character:test-chat' })
  try {
    const result = await runTurn({ llm, snapshot, userInput: text })
    const blocks = result.transition.blocks.filter(b => b.type !== 'thought').map(b => ({ type: String(b.type), text: b.text }))
    if (!blocks.length || result.providerMode === 'fallback') return { error: msg('지금은 답을 만들지 못했어요. 잠시 뒤 다시 보내 주세요.') }
    return { blocks }
  } catch (e) {
    if (e instanceof UnsafeContentError) return { error: msg('이 내용으로는 대화를 이어갈 수 없어요. 다른 상황으로 이야기해 주세요.') }
    if (e instanceof AIBudgetDeniedError) return { error: msg('지금은 테스트 대화를 열 수 없어요. 잠시 뒤 다시 시도해 주세요.') }
    return { error: msg('지금은 답을 만들지 못했어요. 잠시 뒤 다시 보내 주세요.') }
  }
}
