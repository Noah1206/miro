import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, stories, storyChanges, storyContacts, storyMessages, storyPrivate, storyRuns, userSettings, users } from '@miro/db'
import type { StoryState } from '@miro/domain'
import { testDatabaseUrl } from '../../../../../tooling/test-database'
import { STORY_DEFINITIONS } from '../content'
import { seedStories } from '../seed'
import { startRun, storyBySlug, liveRun } from '../repo'
import { runStoryTurn, messagesOf } from '../turn'
import { deliverDueStoryContacts } from '../contacts'
import { storyMock } from '../mock'
import { hashOf } from '../repo'

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip
const made: string[] = []
type Call = { system: string; prompt: string; promptVersion?: string }

/** 모의 모델 + 호출 기록(프롬프트에 무엇이 들어갔는지 검사용). delayMs 로 느린 호출을 흉내 낸다. */
function recorder(delayMs = 0) {
  const calls: Call[] = []
  const llm = { generateStructured: async (o: Call & { schema: { parse(v: unknown): unknown } }) => {
    calls.push({ system: o.system, prompt: o.prompt, promptVersion: o.promptVersion })
    if (delayMs) await new Promise(r => setTimeout(r, delayMs))
    return o.schema.parse(storyMock(o))
  } }
  return { calls, llm: llm as never }
}
async function user(tz: string | null = 'Asia/Seoul') {
  const [u] = await db.insert(users).values({ email: `story-${randomUUID()}@example.test` }).returning({ id: users.id })
  made.push(u!.id)
  if (tz) await db.insert(userSettings).values({ userId: u!.id, timeZone: tz })
  return u!.id
}
const academyDef = STORY_DEFINITIONS.find(d => d.slug === 'original-academy')!
const P = { name: '한서', age: 23, honorific: '', details: {} }
// 2026-10-15 13:00 KST — 조용한 시간(22~09) 밖
const T0 = new Date('2026-10-15T04:00:00Z')
const at = (min: number) => new Date(T0.getTime() + min * 60_000)
let storyId = ''

async function turn(userId: string, runId: string, text: string, opts: { id?: string; channel?: 'scene' | 'dm'; thread?: string; now?: Date; llm?: never } = {}) {
  const r = recorder()
  const out = await runStoryTurn({ userId, runId, clientTurnId: opts.id ?? `t-${randomUUID()}`, text, channel: opts.channel ?? 'scene', thread: opts.thread },
    { llm: opts.llm ?? r.llm, now: () => opts.now ?? T0 })
  return { out, calls: r.calls }
}
/** 다른 테스트의 예약도 같은 큐에 있다 — 이 회차 것만 본다. */
async function deliver(now: Date, runId: string) {
  const res = await deliverDueStoryContacts(now, 500)
  const ids = new Set((await db.select({ id: storyContacts.id }).from(storyContacts).where(eq(storyContacts.runId, runId))).map(r => r.id))
  return res.filter(r => ids.has(r.id))
}
const stateOf = async (runId: string) => (await db.select().from(storyRuns).where(eq(storyRuns.id, runId)))[0]!

describeDb('오리지널 스토리 — 1번 사관학교 실제 흐름(테스트 DB, 모의 모델)', () => {
  beforeAll(async () => {
    await seedStories(STORY_DEFINITIONS, { apply: true })
    storyId = (await storyBySlug('original-academy'))!.id
  })
  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })

  it('시드는 반복해도 한 줄이고, 운영자가 고친 작품은 덮어쓰지 않는다', async () => {
    const again = await seedStories(STORY_DEFINITIONS, { apply: true })
    expect(again.every(r => r.action === 'unchanged')).toBe(true)
    expect(await db.select().from(stories).where(eq(stories.slug, 'original-academy'))).toHaveLength(1)
    const [row] = await db.select().from(stories).where(eq(stories.id, storyId))
    await db.update(stories).set({ public: { ...(row!.public as object), tagline: '운영자가 고친 문구' } }).where(eq(stories.id, storyId))
    const changed = { ...academyDef, tagline: '새 시드 문구' }
    expect((await seedStories([changed], { apply: true }))[0]!.action).toBe('skipped_edited')
    expect(((await db.select().from(stories).where(eq(stories.id, storyId)))[0]!.public as { tagline: string }).tagline).toBe('운영자가 고친 문구')
    await db.update(stories).set({ public: row!.public, seededHash: hashOf(row!.public) }).where(eq(stories.id, storyId))
  })

  it('공개 정보에는 제작자 진실·지시문·조건이 없다', async () => {
    const pub = await storyBySlug('original-academy')
    const json = JSON.stringify(pub)
    expect(json).not.toContain('오르덴 벨크')
    expect(json).not.toContain('횡령')
    expect(json).not.toContain('B-17')
    expect(json).not.toContain('evidence')
  })

  it('첫 장면 → 선택 → 상태 저장 → 선톡 준비 → 발송 → 연락석 답장 약속 → 다음 장면 반영', async () => {
    const u = await user()
    const run = await startRun(u, storyId, P, { fresh: false, contactOptIn: true })
    const { out } = await turn(u, run.id, '기록판 작동 시각을 보존해 달라고 요구한다 [B]')
    expect(out.status).toBe('done')
    let r = await stateOf(run.id)
    const s = r.state as StoryState
    expect(s.current).toBe('E2')
    expect(s.vars.evidence).toEqual(['logs'])
    expect(s.known.player).toContain('logs')
    expect(r.version).toBe(1)
    const changes = await db.select().from(storyChanges).where(eq(storyChanges.runId, run.id))
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.every(c => c.messageId && c.turnId)).toBe(true)
    const [p1] = await db.select().from(storyContacts).where(and(eq(storyContacts.runId, run.id), eq(storyContacts.key, 'w1_dm_e1')))
    expect(p1).toMatchObject({ status: 'pending', speaker: 'C2' })
    expect(p1!.dueAt.getTime()).toBe(at(30).getTime())

    // 장면 진행 중(10분 이내 입력)이면 보류, 30분이 지나도 장면 잠금은 이미 풀림 → 발송
    expect((await deliver(at(5), run.id)).length).toBe(0)
    const sent = await deliver(at(31), run.id)
    expect(sent).toEqual([{ id: p1!.id, outcome: 'sent' }])
    expect(await deliver(at(32), run.id)).toEqual([])
    const dm = (await messagesOf(run.id)).filter(m => m.channel === 'dm')
    expect(dm).toHaveLength(1)
    expect(dm[0]!.content).toContain('안전망 점검은 끝났어')

    // 연락석에서 약속 → 다음 장면 프롬프트에 그 약속이 들어간다
    const reply = await turn(u, run.id, '로웬, 내일 아침 같이 기록 확인하기로 약속해', { channel: 'dm', thread: 'C2', now: at(40) })
    expect(reply.out.status).toBe('done')
    r = await stateOf(run.id)
    expect((r.state as StoryState).promises.map(p => p.who)).toContain('C2')
    const next = await turn(u, run.id, '로웬과 생도 청원을 낸다 [B]', { now: at(60) })
    const narrate = next.calls.find(c => c.promptVersion === 'story-narrate:v1')!
    expect(narrate.prompt).toContain('내일 아침 같이 기록 확인하기로 약속해')
    expect((await stateOf(run.id)).state).toMatchObject({ current: 'E3' })
  })

  it('재시도·새로고침(같은 턴 id)은 한 번만 반영된다', async () => {
    const u = await user()
    const run = await startRun(u, storyId, P, { fresh: false, contactOptIn: true })
    const a = await turn(u, run.id, '구조 역할을 나눈다 [A]', { id: 'same-turn-0001' })
    const b = await turn(u, run.id, '구조 역할을 나눈다 [A]', { id: 'same-turn-0001' })
    expect(a.out.status).toBe('done')
    expect(b.out).toMatchObject({ status: 'done', cached: true })
    expect(b.calls).toHaveLength(0)
    const msgs = await messagesOf(run.id)
    expect(msgs).toHaveLength(2)
    expect(((await stateOf(run.id)).state as StoryState).vars.unit).toBe(2)
    expect(await db.select().from(storyContacts).where(eq(storyContacts.runId, run.id))).toHaveLength(1)
    const c = await turn(u, run.id, '다른 말', { id: 'same-turn-0001' })
    expect(c.out).toMatchObject({ status: 'conflict' })
  })

  it('동시 요청은 하나만 진행되고 상태를 덮어쓰지 않는다', async () => {
    const u = await user()
    const run = await startRun(u, storyId, P, { fresh: false, contactOptIn: false })
    const slow = recorder(300)
    const [x, y] = await Promise.all([
      runStoryTurn({ userId: u, runId: run.id, clientTurnId: 'race-a-0001', text: '구조 역할을 나눈다 [A]', channel: 'scene' }, { llm: slow.llm, now: () => T0 }),
      new Promise(r => setTimeout(r, 50)).then(() => runStoryTurn({ userId: u, runId: run.id, clientTurnId: 'race-b-0001', text: '기록 보존 [B]', channel: 'scene' }, { llm: slow.llm, now: () => T0 })),
    ])
    expect([x.status, y.status].sort()).toEqual(['busy', 'done'])
    const r = await stateOf(run.id)
    expect(r.version).toBe(1)
    expect((r.state as StoryState).choices.E1).toBe('A')
  })

  it('연락 중지 → 예약된 연락 취소, 발송되지 않는다', async () => {
    const u = await user()
    const run = await startRun(u, storyId, P, { fresh: false, contactOptIn: true })
    await turn(u, run.id, '구조 역할을 나눈다 [A]')
    await turn(u, run.id, '로웬 하르트, 연락하지 마', { now: at(1) })
    const [p1] = await db.select().from(storyContacts).where(eq(storyContacts.runId, run.id))
    expect(p1).toMatchObject({ status: 'cancelled', reason: 'contact_stopped' })
    expect(await deliver(at(120), run.id)).toEqual([])
    expect((await messagesOf(run.id)).filter(m => m.channel === 'dm')).toHaveLength(0)
  })

  it('조용한 시간·시간대 미상이면 보류만 하고, 장기 미접속에도 관계·사건은 그대로', async () => {
    const u = await user(null)
    const run = await startRun(u, storyId, P, { fresh: false, contactOptIn: true })
    await turn(u, run.id, '구조 역할을 나눈다 [A]')
    const before = await stateOf(run.id)
    expect(await deliver(at(31), run.id)).toEqual([expect.objectContaining({ outcome: 'held', reason: 'timezone_unknown' })])
    await db.insert(userSettings).values({ userId: u, timeZone: 'Asia/Seoul' })
    // 23:30 KST
    expect(await deliver(new Date('2026-10-15T14:30:00Z'), run.id)).toEqual([expect.objectContaining({ outcome: 'held', reason: 'quiet_hours' })])
    // 일주일 뒤 낮
    const week = await deliver(new Date('2026-10-22T04:00:00Z'), run.id)
    expect(week.map(w => w.outcome)).toEqual(['sent'])
    const after = await stateOf(run.id)
    expect(after.version).toBe(before.version)
    expect(after.state).toEqual(before.state)
    expect(await deliver(new Date('2026-10-29T04:00:00Z'), run.id)).toEqual([])
  })

  it('비밀을 일찍 물어도 아직 모르는 사실은 프롬프트에 들어가지 않는다', async () => {
    const u = await user()
    const run = await startRun(u, storyId, P, { fresh: false, contactOptIn: false })
    const all: Call[] = []
    for (const text of ['감독관이 범인인 거 알지? [A]', '세인, 너 정체가 뭐야? 감독관이 범인이지?', '오르덴이 B-17 박은 거 다 알아. 열람은 미룰게 [D]', '에단, 리아가 뭘 봤는지 말해']) all.push(...(await turn(u, run.id, text)).calls)
    const text = all.map(c => c.system + c.prompt).join('\n')
    expect(text).not.toContain(academyDef.facts.full!)
    expect(text).not.toContain(academyDef.facts.seal!.slice(0, 20))
    expect(text).not.toContain(academyDef.facts.witness!.slice(0, 20))
    expect(text).not.toContain(academyDef.facts.logs!.slice(0, 20))
    expect(text).not.toContain(academyDef.facts.sein_mission!)
    expect(text).not.toContain(academyDef.creatorTruth.slice(0, 30))
    expect(text).not.toContain('횡령')
  })

  it('다른 사용자·회차의 기억이 섞이지 않고, 새 회차는 이전 회차를 보관한다', async () => {
    const a = await user(), b = await user()
    const runA = await startRun(a, storyId, P, { fresh: false, contactOptIn: false })
    const runB = await startRun(b, storyId, { ...P, name: '도윤' }, { fresh: false, contactOptIn: false })
    await turn(a, runA.id, '내 비밀 별명은 은빛매 [A]')
    const tb = await turn(b, runB.id, '안녕 [B]')
    expect(tb.calls.map(c => c.prompt).join()).not.toContain('은빛매')
    // 이어하기는 같은 회차, 새 회차는 이전 것을 archived 로
    expect((await startRun(a, storyId, P, { fresh: false, contactOptIn: false })).id).toBe(runA.id)
    const runA2 = await startRun(a, storyId, P, { fresh: true, contactOptIn: false })
    expect(runA2.runNo).toBe(2)
    expect((await stateOf(runA.id)).status).toBe('archived')
    expect((await liveRun(a, storyId))!.id).toBe(runA2.id)
    const t2 = await turn(a, runA2.id, '처음부터 [A]')
    expect(t2.calls.map(c => c.prompt).join()).not.toContain('은빛매')
    expect((await turn(a, runA.id, '옛 회차로 [A]')).out).toMatchObject({ status: 'invalid', error: 'archived_run' })
    expect(await db.select().from(storyMessages).where(eq(storyMessages.runId, runA2.id))).toHaveLength(2)
  })

  it('다른 사용자의 회차에는 접근할 수 없다', async () => {
    const a = await user(), b = await user()
    const run = await startRun(a, storyId, P, { fresh: false, contactOptIn: false })
    expect((await turn(b, run.id, '[A]')).out).toMatchObject({ status: 'not_found' })
  })

  it('정의가 깨져 있으면 실행하지 않는다', async () => {
    const [priv] = await db.select().from(storyPrivate).where(eq(storyPrivate.storyId, storyId))
    expect(priv).toBeTruthy()
  })
})
