import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { and, asc, desc, eq, isNull, lt, sql } from 'drizzle-orm'
import { db, storyChanges, storyMessages, storyRuns, storyTurns } from '@miro/db'
import { applyActions, type StoryAction, type StoryDefinition, type StoryState } from '@miro/domain'
import { createAI } from '@miro/providers'
import { definitionOf, runFor, type Protagonist } from './repo'
import { DM_VERSION, INTERPRET_VERSION, NARRATE_VERSION, dmPrompt, interpretPrompt, narratePrompt, type LogLine } from './prompts'
import { storyMock } from './mock'
import { syncContacts } from './contacts'

const ACTION_TYPES = ['option', 'trust', 'affinity', 'contact', 'boundary', 'relation_outcome', 'exclusive', 'memory', 'promise', 'refuse_premise', 'accept_premise', 'time_skip'] as const
const DM_BLOCKED = new Set(['option', 'time_skip', 'relation_outcome', 'refuse_premise', 'accept_premise'])
const Interpreted = z.object({
  actions: z.array(z.object({ type: z.enum(ACTION_TYPES), character: z.string().nullable().optional(), option: z.string().nullable().optional(),
    pick: z.string().nullable().optional(), value: z.string().nullable().optional(), quote: z.string().max(400) })).max(12),
  clarify: z.string().max(300).nullable(),
})
const Scene = z.object({ blocks: z.array(z.object({ kind: z.enum(['narration', 'dialogue']), speaker: z.string().nullable(), text: z.string().min(1).max(2000) })).min(1).max(16) })
const Dm = z.object({ text: z.string().min(1).max(600) })

export const STALE_TURN_MS = 3 * 60_000
export type StoryMessageView = { id: string; channel: 'scene' | 'dm'; thread: string | null; role: string; speaker: string | null; content: string; blocks: unknown; createdAt: string; read: boolean }
export type TurnOutcome =
  | { status: 'done'; cached: boolean; messages: StoryMessageView[]; applied: unknown[]; rejected: unknown[]; clarify: string | null; ended: boolean }
  | { status: 'busy' | 'conflict' | 'not_found' | 'invalid' | 'failed'; error: string }

type LLM = { generateStructured: ReturnType<typeof createAI>['generateStructured'] }

/** 모델이 낸 행동을 엔진 형식으로. 모르는 인물·빈 값은 엔진이 거부한다. */
function toActions(raw: z.infer<typeof Interpreted>['actions'], channel: 'scene' | 'dm'): StoryAction[] {
  return raw.filter(a => channel === 'scene' || !DM_BLOCKED.has(a.type)).map(a => {
    const character = a.character ?? null
    switch (a.type) {
      case 'option': return { type: 'option', option: a.option ?? '', pick: a.pick ?? null, quote: a.quote }
      case 'contact': return { type: 'contact', character: character ?? '', value: a.value === 'allowed' ? 'allowed' : 'stopped', quote: a.quote }
      case 'boundary': case 'relation_outcome': case 'promise': return { type: a.type, character: character ?? '', value: a.value ?? '', quote: a.quote }
      case 'memory': return { type: 'memory', character, value: a.value ?? '', quote: a.quote }
      case 'exclusive': return { type: 'exclusive', character, quote: a.quote }
      case 'trust': case 'affinity': return { type: a.type, character: character ?? '', quote: a.quote }
      default: return { type: a.type, quote: a.quote }
    }
  }) as StoryAction[]
}

const view = (m: typeof storyMessages.$inferSelect): StoryMessageView => ({ id: m.id, channel: m.channel, thread: m.thread, role: m.role, speaker: m.speaker,
  content: m.content, blocks: m.blocks, createdAt: m.createdAt.toISOString(), read: m.readAt !== null || m.role !== 'character' })

export async function loadLog(runId: string, channel: 'scene' | 'dm', thread: string | null, limit: number): Promise<LogLine[]> {
  const rows = await db.select().from(storyMessages)
    .where(and(eq(storyMessages.runId, runId), eq(storyMessages.channel, channel), thread ? eq(storyMessages.thread, thread) : undefined))
    .orderBy(desc(storyMessages.createdAt)).limit(limit)
  return rows.reverse().map(r => ({ channel: r.channel, thread: r.thread, role: r.role, speaker: r.speaker, content: r.content }))
}

export async function messagesOf(runId: string): Promise<StoryMessageView[]> {
  return (await db.select().from(storyMessages).where(eq(storyMessages.runId, runId)).orderBy(asc(storyMessages.createdAt))).map(view)
}

/**
 * 스토리 턴. 순서: 턴 확보(중복·동시 요청 차단) → 해석(제안) → 엔진 검증·적용 → 장면/문자 생성 → 한 트랜잭션 저장.
 * 모델 호출은 트랜잭션 밖. 저장 때 회차 버전이 읽은 때와 다르면 쓰지 않는다.
 */
export async function runStoryTurn(input: { userId: string; runId: string; clientTurnId: string; text: string; channel: 'scene' | 'dm'; thread?: string | null },
  deps: { llm?: LLM; now?: () => Date } = {}): Promise<TurnOutcome> {
  const text = input.text.trim()
  if (!text || text.length > 1000) return { status: 'invalid', error: 'text_length' }
  if (!/^[\w-]{8,80}$/.test(input.clientTurnId)) return { status: 'invalid', error: 'client_turn_id' }
  const run = await runFor(input.userId, input.runId)
  if (!run) return { status: 'not_found', error: 'run' }
  if (run.status === 'archived') return { status: 'invalid', error: 'archived_run' }
  const def = await definitionOf(run.storyId)
  const thread = input.channel === 'dm' ? input.thread ?? '' : null
  if (input.channel === 'dm' && !def.characters.some(c => c.key === thread)) return { status: 'invalid', error: 'thread' }
  const now = deps.now ?? (() => new Date())
  const inputHash = createHash('sha256').update(`${input.channel}|${thread ?? ''}|${text}`).digest('hex')

  const claim = await claimTurn(run.id, input.clientTurnId, input.channel, thread, inputHash, now())
  if ('outcome' in claim) return claim.outcome
  const turnId = claim.turnId

  try {
    const [fresh] = await db.select().from(storyRuns).where(eq(storyRuns.id, run.id))
    const state = fresh!.state as StoryState
    const protagonist = fresh!.protagonist as Protagonist
    const llm = deps.llm ?? createAI({ mock: storyMock, context: { userId: input.userId, workload: 'interactive', origin: `story:${input.channel}` } })
    const sceneLog = await loadLog(run.id, 'scene', null, 16)
    const threadLog = thread ? await loadLog(run.id, 'dm', thread, 12) : []

    const ip = interpretPrompt(def, state, protagonist, text, input.channel === 'dm' ? threadLog : sceneLog, input.channel, thread)
    const interpreted = Interpreted.parse(await llm.generateStructured({ task: 'world_update', schema: Interpreted, system: ip.system, prompt: ip.prompt, promptVersion: INTERPRET_VERSION, maxTokens: 1200 }))
    const userMessageId = randomUUID()
    const result = applyActions(def, state, toActions(interpreted.actions, input.channel), text, userMessageId)

    let reply: { role: 'scene' | 'character'; speaker: string | null; content: string; blocks: unknown }
    if (input.channel === 'scene') {
      const np = narratePrompt(def, state, result.state, protagonist, text, sceneLog, result.applied, result.rejected, interpreted.clarify, result.completed)
      const scene = Scene.parse(await llm.generateStructured({ task: 'dialogue', schema: Scene, system: np.system, prompt: np.prompt, promptVersion: NARRATE_VERSION, maxTokens: 2400 }))
      const names = new Map(def.characters.map(c => [c.key, c.name]))
      const blocks = scene.blocks.map(b => ({ ...b, speaker: b.speaker && names.has(b.speaker) ? b.speaker : null }))
      reply = { role: 'scene', speaker: null, blocks, content: blocks.map(b => (b.speaker ? `${names.get(b.speaker)}: ${b.text}` : b.text)).join('\n\n') }
    } else {
      const dp = dmPrompt(def, result.state, protagonist, thread!, text, threadLog, sceneLog, result.rejected)
      const dm = Dm.parse(await llm.generateStructured({ task: 'dialogue', schema: Dm, system: dp.system, prompt: dp.prompt, promptVersion: DM_VERSION, maxTokens: 600 }))
      reply = { role: 'character', speaker: thread, content: dm.text, blocks: null }
    }

    return await commitTurn({ def, runId: run.id, turnId, userMessageId, input: { ...input, text, thread }, state: result.state, applied: result.applied,
      rejected: result.rejected, clarify: interpreted.clarify, reply, now: now() })
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 200) : 'unknown'
    await db.update(storyTurns).set({ status: 'failed', error, finishedAt: new Date() }).where(eq(storyTurns.id, turnId))
    return { status: 'failed', error }
  }
}

async function claimTurn(runId: string, clientTurnId: string, channel: 'scene' | 'dm', thread: string | null, inputHash: string, now: Date): Promise<{ turnId: string } | { outcome: TurnOutcome }> {
  try {
    return await db.transaction(async tx => {
      const [run] = await tx.select({ version: storyRuns.version }).from(storyRuns).where(eq(storyRuns.id, runId)).for('update')
      await tx.update(storyTurns).set({ status: 'failed', error: 'stale_lease', finishedAt: now })
        .where(and(eq(storyTurns.runId, runId), eq(storyTurns.status, 'running'), lt(storyTurns.createdAt, new Date(now.getTime() - STALE_TURN_MS))))
      const [existing] = await tx.select().from(storyTurns).where(and(eq(storyTurns.runId, runId), eq(storyTurns.clientTurnId, clientTurnId)))
      if (existing) {
        if (existing.inputHash !== inputHash) return { outcome: { status: 'conflict', error: 'client_turn_id_reused' } as TurnOutcome }
        if (existing.status === 'done') {
          const r = existing.result as { messageIds: string[]; applied: unknown[]; rejected: unknown[]; clarify: string | null; ended: boolean }
          const msgs = (await tx.select().from(storyMessages).where(eq(storyMessages.turnId, existing.id)).orderBy(asc(storyMessages.createdAt))).map(view)
          return { outcome: { status: 'done', cached: true, messages: msgs, applied: r.applied, rejected: r.rejected, clarify: r.clarify, ended: r.ended } as TurnOutcome }
        }
        if (existing.status === 'running') return { outcome: { status: 'busy', error: 'turn_running' } as TurnOutcome }
        await tx.update(storyTurns).set({ status: 'running', error: null, baseVersion: run!.version, createdAt: now }).where(eq(storyTurns.id, existing.id))
        return { turnId: existing.id }
      }
      const [t] = await tx.insert(storyTurns).values({ runId, clientTurnId, channel, thread, inputHash, baseVersion: run!.version, createdAt: now }).returning({ id: storyTurns.id })
      return { turnId: t!.id }
    })
  } catch (e) {
    // 회차당 진행 중 턴 하나(부분 고유 색인) — 동시에 들어온 다른 요청.
    if ((e as { code?: string }).code === '23505') return { outcome: { status: 'busy', error: 'turn_running' } }
    throw e
  }
}

async function commitTurn(a: { def: StoryDefinition; runId: string; turnId: string; userMessageId: string; input: { userId: string; text: string; channel: 'scene' | 'dm'; thread: string | null }
  state: StoryState; applied: ReturnType<typeof applyActions>['applied']; rejected: ReturnType<typeof applyActions>['rejected']; clarify: string | null
  reply: { role: 'scene' | 'character'; speaker: string | null; content: string; blocks: unknown }; now: Date }): Promise<TurnOutcome> {
  return db.transaction(async tx => {
    const [run] = await tx.select().from(storyRuns).where(eq(storyRuns.id, a.runId)).for('update')
    const [turn] = await tx.select().from(storyTurns).where(eq(storyTurns.id, a.turnId))
    if (!run || !turn || turn.status !== 'running' || run.version !== turn.baseVersion) {
      await tx.update(storyTurns).set({ status: 'failed', error: 'stale_state', finishedAt: a.now }).where(eq(storyTurns.id, a.turnId))
      return { status: 'busy', error: 'stale_state' } as TurnOutcome
    }
    const ended = a.state.current === 'ended'
    const base = { runId: a.runId, turnId: a.turnId, channel: a.input.channel, thread: a.input.thread }
    const [userMsg] = await tx.insert(storyMessages).values({ ...base, id: a.userMessageId, role: 'user', content: a.input.text, createdAt: a.now }).returning()
    const [replyMsg] = await tx.insert(storyMessages).values({ ...base, role: a.reply.role, speaker: a.reply.speaker, content: a.reply.content, blocks: a.reply.blocks,
      readAt: a.reply.role === 'character' ? a.now : null, createdAt: new Date(a.now.getTime() + 1) }).returning()
    const changes = [...a.applied.map(c => ({ kind: c.kind, detail: c.detail })), ...a.rejected.map(r => ({ kind: 'rejected', detail: { action: r.action, reason: r.reason } }))]
    if (changes.length) await tx.insert(storyChanges).values(changes.map(c => ({ runId: a.runId, turnId: a.turnId, messageId: a.userMessageId, kind: c.kind, detail: c.detail })))
    // 답장을 보낸다는 건 그 스레드를 읽었다는 뜻이다.
    if (a.input.channel === 'dm') await tx.update(storyMessages).set({ readAt: a.now })
      .where(and(eq(storyMessages.runId, a.runId), eq(storyMessages.channel, 'dm'), eq(storyMessages.thread, a.input.thread!), isNull(storyMessages.readAt)))
    await tx.update(storyRuns).set({ state: a.state, version: sql`${storyRuns.version} + 1`, status: ended ? 'ended' : run.status === 'ended' ? 'ended' : 'active',
      updatedAt: a.now, ...(a.input.channel === 'scene' ? { lastSceneInputAt: a.now } : {}) }).where(eq(storyRuns.id, a.runId))
    await syncContacts(tx, a.def, a.runId, a.state, a.turnId, a.now)
    const result = { messageIds: [userMsg!.id, replyMsg!.id], applied: a.applied, rejected: a.rejected, clarify: a.clarify, ended }
    await tx.update(storyTurns).set({ status: 'done', result, finishedAt: a.now }).where(eq(storyTurns.id, a.turnId))
    return { status: 'done', cached: false, messages: [view(userMsg!), view(replyMsg!)], applied: a.applied, rejected: a.rejected, clarify: a.clarify, ended } as TurnOutcome
  })
}
