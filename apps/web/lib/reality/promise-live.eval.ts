import { writeFile } from 'node:fs/promises'
import { describe, it } from 'vitest'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db, aiUsage, characters, contactProfiles, rechargeGrants, realityContacts, roleplaySessions, userMoments, userPersonas, userSettings, users } from '@miro/db'
import { defaultRoutine, PROMISE_REASON, promisedContact, type RealityIntent } from '@miro/domain'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import { precompileAgencyRevisions } from '@/lib/agency/revisions'
import { evaluateSession } from './evaluate'

/**
 * 첫 대화 약속 실측(10/19). 첫 답이 가까운 일정을 묻고 "이따 ~에 문자할게" 를 약속하는지 → 사용자가 일정을 답하면 일정이 잡히는지
 * → 약속 시각이 되면 실제로 먼저 연락이 가는지. 시간은 세션의 과거 시각과 약속 시각을 앞당겨 흐르게 한다(판단은 실제 지금).
 */
// 공통 vitest 설정(자율성 off·legacy·강화 검토 on)을 운영 값으로 되돌린다 — 앞 실측(10/19)은 이 덮어쓰기로 운영과 다른 경로를 탔다.
process.env.MIRO_CHARACTER_AGENCY_MODE = 'live'
process.env.MIRO_AGENCY_DEFAULT_POLICY = 'agency:v1'
process.env.MIRO_FEATURE_STRICT_CONVERSATION_REVIEW = '0'
const OUT = process.env.MIRO_PROMISE_EVAL_OUT
const TARGETS = (process.env.MIRO_PROMISE_EVAL_CHARACTERS ?? 'taeyun,thomas,yujin').split(',').filter(Boolean)
const FIRST = '안녕하세요. 오늘 처음 뵙네요.'
const ANSWER = '내일 오후 3시에 면접 있어요. 좀 떨려요.'

async function elapse(sessionId: string, minutes: number) {
  const by = sql`make_interval(mins => ${minutes})`
  await db.execute(sql`UPDATE roleplay_sessions SET last_interaction_at = last_interaction_at - ${by}, reality_checked_at = reality_checked_at - ${by} WHERE id = ${sessionId}`)
  await db.execute(sql`UPDATE messages SET created_at = created_at - ${by} WHERE session_id = ${sessionId}`)
  const [s] = await db.select({ p: roleplaySessions.pendingRealityIntent }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId))
  const p = s!.p as RealityIntent | null
  if (p?.notBefore) await db.update(roleplaySessions).set({ pendingRealityIntent: { ...p, notBefore: new Date(Date.parse(p.notBefore) - minutes * 60_000).toISOString() } }).where(eq(roleplaySessions.id, sessionId))
}

const KEEP_ONLY = process.env.MIRO_PROMISE_EVAL_SESSION

describe.skipIf(!OUT || !KEEP_ONLY)('promise keeping only (existing session)', () => {
  // 이미 약속한 대화방에 약속 의도를 둔 것처럼(턴이 남기는 것과 같은 값) — 약속 시각이 지나면 실제로 연락이 가는가.
  it('sends the promised contact once its time has come', async () => {
    const sessionId = KEEP_ONLY!
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: PROMISE_REASON, urgency: 0.9, promise: true,
      notBefore: new Date(Date.now() - 60_000).toISOString() } }).where(eq(roleplaySessions.id, sessionId))
    await elapse(sessionId, 120)
    const r = await evaluateSession(sessionId, new Date(), { background: true }).catch((e: Error) => ({ outcome: 'error', reason: e.message }))
    const again = await evaluateSession(sessionId, new Date(), { background: true }).catch((e: Error) => ({ outcome: 'error', reason: e.message }))
    const contacts = await db.select({ status: realityContacts.status, dedupeKey: realityContacts.dedupeKey, payload: realityContacts.payload }).from(realityContacts).where(eq(realityContacts.sessionId, sessionId))
    const [s] = await db.select({ p: roleplaySessions.pendingRealityIntent }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId))
    await writeFile(OUT!, JSON.stringify({ first: r, second: again, pendingAfter: s!.p, contacts: contacts.map(c => ({ status: c.status, dedupeKey: c.dedupeKey, text: (c.payload as { text?: string } | null)?.text ?? null })) }, null, 2))
  })
})

describe.skipIf(!OUT || !!KEEP_ONLY)('first meeting promise live eval', () => {
  it('asks a near plan, promises a text, and keeps the promise', async () => {
    const [owner] = await db.insert(users).values({ email: `promise-eval-${Date.now()}@example.test` }).returning()
    await db.insert(userSettings).values({ userId: owner!.id, timeZone: 'Asia/Seoul' })
    // 무료 계정은 잔액이 0 이라 첫 대화가 막힌다 — 실측용 잔액(원가 상한은 따로 AI 예산이 막는다).
    await db.insert(rechargeGrants).values({ userId: owner!.id, amount: 100_000, source: 'grant' })
    await db.insert(userPersonas).values({ userId: owner!.id, name: '지민', gender: 'female', description: '서울에 사는 20대 후반 회사원.' })
    const cost = async () => (await db.select({ c: sql<string>`coalesce(sum(coalesce(${aiUsage.actualCost}, ${aiUsage.estimatedCost})), 0)` }).from(aiUsage).where(eq(aiUsage.userId, owner!.id)))[0]!.c
    // 운영은 크론이 캐릭터 판을 미리 컴파일한다 — 첫 턴이 기존 경로로 새지 않게 여기서도 먼저.
    await precompileAgencyRevisions(10)
    const report: Record<string, unknown>[] = []
    let stopped: string | null = null
    for (const slug of TARGETS) {
      const [character] = await db.select().from(characters).where(eq(characters.slug, slug))
      // 시드에는 생활 리듬이 없다 — 비워 두면 판정이 리듬을 AI 로 만든다. 기본 리듬을 둔다.
      const [p] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, character!.id))
      await db.update(contactProfiles).set({ enabled: true, routine: defaultRoutine({ start: p!.activeHoursStart, end: p!.activeHoursEnd }, new Date().toISOString()) }).where(eq(contactProfiles.characterId, character!.id))
      const { sessionId } = await createRoleplaySession(owner!.id, slug)
      const pending = async () => (await db.select({ p: roleplaySessions.pendingRealityIntent }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)))[0]!.p as RealityIntent | null
      const unit: Record<string, unknown> = { character: character!.name }
      const first = await runConversationTurn({ userId: owner!.id, sessionId, input: FIRST })
      if (!first.ok) { unit.first = first; report.push(unit); if (first.reason === 'budget' || first.reason === 'usage') { stopped = first.reason; break } continue }
      unit.firstReply = first.responseText
      unit.promised = promisedContact(first.responseText)
      unit.intentAfterFirst = await pending()
      await elapse(sessionId, 2)
      const second = await runConversationTurn({ userId: owner!.id, sessionId, input: ANSWER })
      unit.secondReply = second.ok ? second.responseText : second
      unit.intentAfterSecond = await pending()
      // 일정 뽑기는 응답 커밋과 함께 저장된다.
      unit.moments = (await db.select({ about: userMoments.about, eventAt: userMoments.eventAt, cheerAt: userMoments.cheerAt, askAt: userMoments.askAt }).from(userMoments).where(eq(userMoments.sessionId, sessionId)))
      const intent = await pending()
      if (intent?.promise && intent.notBefore) {
        // 판단 시각을 약속 시각으로 둔다(실제 시계가 밤이면 캐릭터는 '아침에 하기로 했다'며 기다린다 — 그건 맞는 판단이다).
        const at = new Date(Date.parse(intent.notBefore) + 60_000)
        const r = await evaluateSession(sessionId, at, { background: true }).catch((e: Error) => ({ outcome: 'error', reason: e.message }))
        const contacts = await db.select({ reason: realityContacts.reason, status: realityContacts.status, dedupeKey: realityContacts.dedupeKey, payload: realityContacts.payload })
          .from(realityContacts).where(and(eq(realityContacts.sessionId, sessionId), gt(realityContacts.createdAt, new Date(Date.now() - 3_600_000)))).orderBy(asc(realityContacts.createdAt))
        unit.promiseOutcome = r
        unit.contacts = contacts.map(c => ({ status: c.status, dedupeKey: c.dedupeKey, text: (c.payload as { text?: string } | null)?.text ?? null }))
        unit.intentAfterContact = await pending()
      }
      unit.costUSD = await cost()
      report.push(unit)
    }
    await writeFile(OUT!, JSON.stringify({ stopped, totalUSD: await cost(), units: report }, null, 2))
  })
})
