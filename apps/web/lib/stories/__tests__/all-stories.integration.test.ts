import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, storyChanges, storyRuns, users } from '@miro/db'
import type { StoryState } from '@miro/domain'
import { testDatabaseUrl } from '../../../../../tooling/test-database'
import { STORY_DEFINITIONS } from '../content'
import { seedStories } from '../seed'
import { startRun, storyBySlug } from '../repo'
import { runStoryTurn } from '../turn'
import { storyMock } from '../mock'
import { INTERPRET_VERSION } from '../prompts'
import { pathsToEndings, type PathStep } from './paths'

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip
const made: string[] = []

/** 해석 단계만 정해진 행동을 돌려주는 모의 모델 — 장면 생성은 모의 서술. 저장·검증은 실제 코드 그대로. */
function scripted(step: PathStep) {
  return { generateStructured: async (o: { promptVersion?: string; prompt: string; system: string; schema: { parse(v: unknown): unknown } }) => {
    if (o.promptVersion === INTERPRET_VERSION) return o.schema.parse({ actions: step.actions.map(a => ({ character: null, option: null, pick: null, value: null, ...a })), clarify: null })
    return o.schema.parse(storyMock(o))
  } } as never
}

describeDb('다섯 작품 — 테스트 DB 에서 첫 장면부터 결말까지 실제 턴으로', () => {
  beforeAll(async () => { await seedStories(STORY_DEFINITIONS, { apply: true }) })
  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })

  it.each(STORY_DEFINITIONS.map(d => [d.slug, d] as const))('%s 완주', async (slug, def) => {
    const [u] = await db.insert(users).values({ email: `story-all-${randomUUID()}@example.test` }).returning({ id: users.id })
    made.push(u!.id)
    const story = await storyBySlug(slug)
    const run = await startRun(u!.id, story!.id, { name: '테스터', age: 30, honorific: '', details: {} }, { fresh: false, contactOptIn: true })
    const [ending, path] = [...pathsToEndings(def).entries()][0]!
    for (const step of path) {
      const out = await runStoryTurn({ userId: u!.id, runId: run.id, clientTurnId: `t-${randomUUID()}`, text: step.say, channel: 'scene' }, { llm: scripted(step) })
      expect(out.status, step.say).toBe('done')
    }
    const [after] = await db.select().from(storyRuns).where(eq(storyRuns.id, run.id))
    expect(after!.status).toBe('ended')
    expect((after!.state as StoryState).ending).toBe(ending)
    const changes = await db.select().from(storyChanges).where(eq(storyChanges.runId, run.id))
    expect(changes.filter(c => c.kind === 'event_complete')).toHaveLength(6)
    expect(changes.filter(c => c.kind === 'rejected')).toHaveLength(0)
  })
})
