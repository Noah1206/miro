import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { describe, it, vi } from 'vitest'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db, aiUsage, characterRevisions, characterRuntimeStates, contactProfiles, roleplaySessions, users, userSettings } from '@miro/db'
import { cloneCharacterAsReality } from '@/lib/dev/reality-clone'
import * as observability from '@/lib/observe'
import * as agencyEngine from '../../../../packages/engine/src/agency'
import * as push from '@/lib/reality/push-outbox'
import { evaluateSession } from '@/lib/reality/evaluate'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import { GeminiProvider, extractJson } from '@miro/providers'
import { SimulationProposal } from '@miro/engine'

/**
 * One arm of the P0 baseline: a scripted synthetic user through the real app entry points. Deferred work
 * (usage settlement, compiles) is queued so wall time is what the user waits for, then flushed after each
 * unit and attributed by request ID. All accounting comes from the ai_usage rows the app itself writes.
 */
const OUT = process.env.MIRO_AGENCY_MEASURE_OUT
const EXPERIMENT = process.env.MIRO_AGENCY_MEASURE_EXPERIMENT ?? 'dry-run'
const SCRIPT = [
  '안녕, 오늘 하루는 좀 길었어.',
  '회사에서 발표를 했는데 반응이 별로였던 것 같아.',
  '너는 오늘 어떻게 지냈어?',
  '내일 저녁에 결과 나오면 먼저 연락해 줄래?',
  '아 맞다, 점심은 뭐 먹었어?',
  '생각해 보니 내일은 야근이라 연락은 괜찮아. 취소할게.',
  '대신 주말에 같이 산책할래?',
  '고마워. 이제 자러 갈게, 잘 자.',
]
/** Simulated idle gaps before a scheduler tick; the evaluator takes `now` as input. */
const PROACTIVE_AFTER_HOURS = [26, 50]

const deferred = vi.hoisted(() => ({ tasks: [] as Array<() => Promise<unknown>>, errors: [] as string[] }))
vi.mock('@/lib/defer', () => ({ afterResponse: async (task: () => Promise<unknown>) => { deferred.tasks.push(task) } }))

async function flush() {
  while (deferred.tasks.length) await deferred.tasks.shift()!().catch((e: Error) => { deferred.errors.push(e.message) })
}

type Call = ReturnType<typeof toCall>
const toCall = (r: typeof aiUsage.$inferSelect) => ({
  requestId: r.requestId, task: r.task, promptVersion: r.promptVersion, provider: r.provider, model: r.model, status: r.status,
  ok: r.ok, error: r.error, fallbackUsed: r.fallbackUsed, latencyMs: r.latencyMs, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
  costUSD: (r.actualCost ?? r.estimatedCost) == null ? null : Number(r.actualCost ?? r.estimatedCost),
})
const engineOf = (calls: Call[]) => calls.some(c => c.promptVersion?.startsWith('agency-')) ? 'agency' : calls.length ? 'legacy' : 'none'

describe.skipIf(!OUT)('P0 baseline arm', () => {
  it('runs the scripted session and records every unit', async () => {
    vi.spyOn(push, 'deliverRealityPush').mockResolvedValue(0)
    // Failure causes only reach logs; keep the ones that explain an outcome, per unit.
    const events: Array<Record<string, unknown>> = []
    const log = observability.observe
    vi.spyOn(observability, 'observe').mockImplementation((event, fields) => {
      if (/failed|fallback|unavailable|rejected|error/.test(event)) events.push({ event, ...fields })
      log(event, fields)
    })
    const drain = () => events.splice(0)
    // 운영은 모델 원문을 남기지 않는다. 측정에서만, 캐릭터챗 응답이 스키마에 떨어진 원문을 턴에 붙인다 — 9/26 형식 실패의 원인을 기록으로 보려고.
    const rawFailures: Array<{ promptVersion: string; issues: string[]; text: string }> = []
    const generate = GeminiProvider.prototype.generate
    vi.spyOn(GeminiProvider.prototype, 'generate').mockImplementation(async function (this: GeminiProvider, req) {
      const result = await generate.call(this, req)
      const version = String((req as { promptVersion?: string }).promptVersion ?? '')
      if (version.startsWith('dialogue:')) {
        // 앱과 같은 방식으로 읽는다 — 다 쓴 답의 빠진 괄호는 앱이 채우므로 실패가 아니다.
        const parsed = SimulationProposal.safeParse(extractJson(result.text, { closeUnclosed: result.truncated === false }))
        if (!parsed.success) rawFailures.push({ promptVersion: version, issues: parsed.error.issues.slice(0, 5).map(i => `${i.path.join('.') || '$'}:${i.code}`), text: result.text })
      }
      return result
    })
    // Synthetic replies only: what was decided, what was said, and why the check refused it.
    const realizations: Array<Record<string, unknown>> = []
    const verify = agencyEngine.verifyAgencyRealization
    vi.spyOn(agencyEngine, 'verifyAgencyRealization').mockImplementation(async (llm, input) => {
      const result = await verify(llm, input)
      realizations.push({ action: input.decision.action, decided: input.decision.candidate.description,
        said: input.blocks.map(b => `${b.speaker ?? b.type}: ${b.text}`), ok: result.ok, issues: result.issues.map(i => `${i.field} ${i.reason}`),
        ids: { decision: input.decision.id, candidate: input.decision.candidate.id }, rejected: input.decision.rejected,
        claims: result.claims.map(c => ({ kind: c.kind, quote: c.quote, actionIds: c.actionIds, evidenceIds: c.evidenceIds, ruleIds: c.ruleIds })) })
      return result
    })
    // One user per experiment: its monthly AI budget counter is the experiment's durable total cap.
    const email = `agency-measure-${EXPERIMENT}@example.test`
    const [found] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    const owner = found ?? (await db.insert(users).values({ email }).returning())[0]!
    await db.insert(userSettings).values({ userId: owner.id, timeZone: 'Asia/Seoul' }).onConflictDoNothing()
    // ECHO 는 pro 요금제만 고를 수 있다. 측정 환경(비운영)에서는 users.plan 이 요금제다.
    const chatModel = process.env.MIRO_AGENCY_MEASURE_CHAT_MODEL === 'pro' ? 'pro' : 'miro'
    if (chatModel === 'pro') await db.update(users).set({ plan: 'pro' }).where(eq(users.id, owner.id))
    const character = await cloneCharacterAsReality(process.env.MIRO_AGENCY_MEASURE_CHARACTER ?? 'thomas', { ownerId: owner.id })
    // In-app messages only: the agency path has no call/photo executor, so both arms compete on one channel.
    await db.update(contactProfiles).set({ enabled: true, activeHoursStart: '00:00', activeHoursEnd: '23:59', preferredChannel: 'message',
      callProbability: 0, videoCallProbability: 0, photoProbability: 0, voiceMessageProbability: 0 })
      .where(eq(contactProfiles.characterId, character.id))

    const mark = async () => Number((await db.select({ id: sql<string>`coalesce(max(${aiUsage.id}), 0)` }).from(aiUsage).where(eq(aiUsage.userId, owner.id)))[0]!.id)
    const since = async (from: number) => (await db.select().from(aiUsage)
      .where(and(eq(aiUsage.userId, owner.id), gt(aiUsage.id, from))).orderBy(asc(aiUsage.id))).map(toCall)
    const state = async (sessionId: string) => {
      const [session] = await db.select({ intent: roleplaySessions.pendingRealityIntent }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId))
      const [runtime] = await db.select({ state: characterRuntimeStates.state, nextWakeAt: characterRuntimeStates.nextWakeAt })
        .from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, sessionId))
      return { pendingRealityIntent: session?.intent ?? null, nextWakeAt: runtime?.nextWakeAt?.toISOString() ?? null,
        goals: runtime?.state.goals.map(g => ({ description: g.description, status: g.status, dueAt: g.dueAt ?? null, success: g.success })) ?? null }
    }

    const units: Array<Record<string, unknown> & { kind: string; calls: Call[] }> = []
    let from = await mark(), started = performance.now()
    const { sessionId } = await createRoleplaySession(owner.id, character.id)
    const sessionStartMs = performance.now() - started
    started = performance.now()
    await flush()
    const [revision] = await db.select({ status: characterRevisions.status, errorCode: characterRevisions.errorCode, attempts: characterRevisions.attempts })
      .from(characterRuntimeStates).innerJoin(characterRevisions, eq(characterRevisions.id, characterRuntimeStates.revisionId))
      .where(eq(characterRuntimeStates.sessionId, sessionId))
    if (revision) units.push({ kind: 'compile', wallMs: performance.now() - started, outcome: revision.status, errorCode: revision.errorCode, events: drain(), calls: await since(from) })

    let stopped: string | null = null
    for (const [index, input] of SCRIPT.entries()) {
      from = await mark()
      const requestId = randomUUID()
      started = performance.now()
      const outcome = await runConversationTurn({ userId: owner.id, sessionId, input, requestId, chatModel })
      const wallMs = performance.now() - started
      await flush()
      const calls = await since(from)
      const own = calls.filter(c => c.requestId === requestId)
      units.push({ kind: 'turn', index, input, wallMs, outcome: outcome.ok ? 'ok' : outcome.reason, engine: engineOf(own),
        text: outcome.ok ? outcome.responseText : null, blocks: outcome.ok ? outcome.blocks.map(b => ({ type: b.type, text: b.text })) : null,
        state: await state(sessionId), events: drain(), realization: realizations.splice(0), rawFailures: rawFailures.splice(0), calls: own,
        background: calls.filter(c => c.requestId !== requestId) })
      if (!outcome.ok && outcome.reason === 'budget') { stopped = 'budget'; break }
    }
    if (!stopped) for (const [index, hours] of PROACTIVE_AFTER_HOURS.entries()) {
      from = await mark()
      started = performance.now()
      // 예산이 바닥나 여기서 던지면 보고서가 통째로 사라진다(9/26: 앞선 턴의 실패 원문까지 잃었다). 결과로 남기고 멈춘다.
      let evaluated: Awaited<ReturnType<typeof evaluateSession>> | { outcome: string; error: string }
      try { evaluated = await evaluateSession(sessionId, new Date(Date.now() + hours * 3_600_000), { background: true }) }
      catch (e) { evaluated = { outcome: 'error', error: e instanceof Error ? e.message : String(e) } }
      const { text, ...result } = { text: null, ...evaluated }
      const wallMs = performance.now() - started
      await flush()
      const calls = await since(from)
      units.push({ kind: 'proactive', index, idleHours: hours, wallMs, outcome: result.outcome, result, engine: engineOf(calls), text, state: await state(sessionId), events: drain(), realization: realizations.splice(0), calls })
      if (result.outcome === 'error') { stopped = /budget/i.test(String((result as { error?: string }).error)) ? 'budget' : 'error'; break }
    }
    await writeFile(OUT!, JSON.stringify({ experiment: EXPERIMENT, agencyMode: process.env.MIRO_CHARACTER_AGENCY_MODE ?? 'off',
      sessionStartMs, stopped, deferredErrors: deferred.errors, units }, null, 2) + '\n')
  })
})
