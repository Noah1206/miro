import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { afterAll, describe, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, memories, roleplaySessions, users } from '@miro/db'
import { DEFAULT_CHARACTER_STATE, detectSemanticEvents, deriveCharacterState, modulateByPersonality } from '@miro/domain'
import * as engine from '@miro/engine'
import { cloneCharacterAsReality } from '@/lib/dev/reality-clone'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import { relationship, snapshot } from '../../../../packages/engine/src/__tests__/fixtures'

/**
 * Executable reproductions of current-core (flag off) failures listed in docs/character-agency-plan.md §2
 * and the 2026-09-24 audit. `reproduced: true` means the failure still happens on the default path.
 * No model is called: rules and recorded proposals only. The agency column names the replay test that
 * covers the same property; it is not re-run here. Run by ai/evals/agency/baseline.ts; skipped elsewhere.
 */
const OUT = process.env.MIRO_AGENCY_FAILURES_OUT
type Case = { id: string; plan: string; summary: string; reproduced: boolean; detail: unknown; agency: string }
const cases: Case[] = []
const owners: string[] = []

describe.skipIf(!OUT)('current-core failure reproductions', () => {
  afterAll(async () => {
    for (const id of owners) await db.delete(users).where(eq(users.id, id))
    await writeFile(OUT!, JSON.stringify(cases, null, 2) + '\n')
  })

  it('regex semantic events ignore negation and topic', () => {
    const inputs = ['다른 사람한테 물어볼게', '다른 사람이랑은 술 안 마셨어', '미안하다는 말은 안 할 거야']
    const detail = inputs.map(text => ({ text, events: detectSemanticEvents(text) }))
    cases.push({ id: 'semantic-regex', plan: '§2 의미 사건', summary: '부정문·무관한 말을 높은 confidence 관계 사건으로 기록',
      reproduced: detail.every(d => d.events.some(e => e.confidence >= .8)), detail,
      agency: '관계 변화는 새 사용자 발화와 작성 규칙이 있어야 반영 (planner.test "bounds relationship progression to a fresh user utterance…")' })
  })

  it('mood goals are shared and replaced every turn', () => {
    const rel = relationship()
    const jealous = deriveCharacterState(DEFAULT_CHARACTER_STATE, rel, [{ type: 'mentioned_other_romantic_interest', confidence: .9 }])
    const next = deriveCharacterState(jealous, rel, [])
    cases.push({ id: 'mood-goals', plan: '§2 감정별 공통 목표', summary: '목표가 성격과 무관한 기분표에서 나오고 다음 턴에 사라짐',
      reproduced: jealous.currentGoals.length === 1 && next.currentGoals.length === 0,
      detail: { afterJealousTurn: jealous.currentGoals, afterNextTurn: next.currentGoals },
      agency: '서버 ID와 생명주기를 가진 목표가 무관한 턴에도 유지 (agency.test "preserves goals across unrelated turns…")' })
  })

  it('outward expression scales internal attachment', () => {
    const reserved = modulateByPersonality({ attachment: 4 }, { jealousy: 50, emotionalExpression: 10 })
    const expressive = modulateByPersonality({ attachment: 4 }, { jealousy: 50, emotionalExpression: 90 })
    cases.push({ id: 'expression-attachment', plan: '§2 표현 수치가 내부 변화 조절', summary: '말수가 적은 인물은 같은 일에도 애착이 덜 오름',
      reproduced: reserved.attachment !== expressive.attachment,
      detail: { emotionalExpression10: reserved.attachment, emotionalExpression90: expressive.attachment },
      agency: '내부 감정과 표현을 분리하고 표현 수치로 변화량을 줄이지 않음 (agency.test 같은 테스트)' })
  })

  it('a renamed character reads its own past lines as an NPC', () => {
    const { prompt } = engine.buildContext(snapshot({ recentMessages: [{ role: 'character', content: '내일 연락할게요.',
      blocks: [{ type: 'dialogue', speaker: '톰', text: '내일 연락할게요.' }] }] }))
    cases.push({ id: 'rename-history', plan: '감사 결함 6', summary: '이름을 바꾸면 캐릭터의 지난 대사가 NPC 대사로 표시됨',
      reproduced: prompt.includes('NPC (톰): 내일 연락할게요.'), detail: prompt.split('\n').filter(l => l.includes('내일 연락할게요')),
      agency: '해결 안 됨: 증거 로더도 이름이 다른 대사를 제외함' })
  })

  it('world changes are accepted as free text', () => {
    const proposal = { ...engine.buildMockProposal('', { characterName: '토마스' }), worldDelta: { currentLocation: '달 뒷면', currentTime: '어제' } }
    const transition = engine.validateProposal(proposal, snapshot())
    cases.push({ id: 'world-free-text', plan: '§2 세계 변경 문자열 검증', summary: '선행조건 없이 장소·시간 변경을 그대로 승인',
      reproduced: transition.worldDelta?.currentLocation === '달 뒷면', detail: transition.worldDelta,
      agency: '세계·장면 변경을 전부 거부 — 틀린 변경은 막지만 정당한 변경 경로도 없음 (orchestrator.agency.test "blocks renderer world mutations…")' })
  })

  it('a promise is lost on the next turn and memories cite the user message', async () => {
    const [owner] = await db.insert(users).values({ email: `p0-failures-${randomUUID()}@example.test` }).returning()
    owners.push(owner!.id)
    const character = await cloneCharacterAsReality('thomas', { ownerId: owner!.id })
    const { sessionId } = await createRoleplaySession(owner!.id, character.id)
    const promise = '캐릭터가 내일 저녁에 먼저 연락하겠다고 약속했다'
    const original = engine.buildMockProposal
    let turn = 0
    const spy = vi.spyOn(engine, 'buildMockProposal').mockImplementation((prompt, opts) => ({ ...original(prompt, opts),
      ...(turn === 1 ? {
        realityIntent: { channel: 'message' as const, reason: '내일 저녁 먼저 연락하기로 한 약속', urgency: .6 },
        memoryCandidates: [{ type: 'promise' as const, content: promise, importance: .9, persistence: .9, confidence: 1, tags: [] }],
      } : {}) }))
    const intents: unknown[] = []
    let userMessageId: string | undefined
    let characterMessageId: string | undefined
    try {
      for (const input of ['내일 저녁에 먼저 연락해 줄래?', '점심은 뭐 먹었어?']) {
        turn++
        const outcome = await runConversationTurn({ userId: owner!.id, sessionId, input })
        if (!outcome.ok) throw new Error(`turn failed: ${outcome.reason}`)
        if (turn === 1) {
          userMessageId = outcome.messages?.find(m => m.role === 'user')?.id
          characterMessageId = outcome.messages?.find(m => m.role === 'character')?.id
        }
        const [session] = await db.select({ intent: roleplaySessions.pendingRealityIntent }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId))
        intents.push(session!.intent)
      }
    } finally { spy.mockRestore() }
    const [memory] = await db.select({ source: memories.sourceMessageId }).from(memories)
      .where(and(eq(memories.sessionId, sessionId), eq(memories.content, promise)))
    cases.push({ id: 'promise-overwritten', plan: '§2 pendingRealityIntent', summary: '약속으로 생긴 연락 예약이 무관한 다음 턴에 지워짐',
      reproduced: intents[0] != null && intents[1] == null, detail: { afterPromiseTurn: intents[0], afterLunchTurn: intents[1] },
      agency: '약속은 세션 상태의 목표로 남고 기한에 깨움 (reality agency.integration "a real-time due goal can wake…")' })
    cases.push({ id: 'memory-provenance', plan: '§2 기억 출처', summary: '캐릭터가 한 약속의 기억 출처가 사용자 메시지로 저장됨',
      reproduced: Boolean(memory && memory.source === userMessageId && userMessageId !== characterMessageId),
      detail: { memorySource: memory?.source ?? null, userMessageId, characterMessageId },
      agency: '에이전시 경로는 기억을 쓰지 않음 — 잘못된 출처는 없지만 기억도 쌓이지 않음' })
  })
})
