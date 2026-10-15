import { createHash } from 'node:crypto'
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { db, stories, storyPrivate, storyRuns } from '@miro/db'
import { devApiAllowed } from '@miro/config'
import { initialState, toPublic, validateDefinition, type StoryDefinition, type StoryPublic, type StoryState } from '@miro/domain'

/** 결정적 직렬화(키 정렬) — 시드 해시가 키 순서에 흔들리지 않게. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v)
}
export const hashOf = (v: unknown) => createHash('sha256').update(stableJson(v)).digest('hex')

export type StoryCard = StoryPublic & { id: string; published: boolean }

/** 공개 목록 — story_private 는 읽지 않는다. 개발 환경에서만 미공개 작품도 보여 준다(배지로 구분). */
export async function listStories(): Promise<StoryCard[]> {
  const rows = await db.select({ id: stories.id, public: stories.public, published: stories.isPublished }).from(stories)
    .where(devApiAllowed() ? undefined : eq(stories.isPublished, true)).orderBy(asc(stories.sortOrder), asc(stories.createdAt))
  return rows.map(r => ({ ...(r.public as StoryPublic), id: r.id, published: r.published }))
}

export async function storyBySlug(slug: string): Promise<StoryCard | null> {
  const [r] = await db.select({ id: stories.id, public: stories.public, published: stories.isPublished }).from(stories).where(eq(stories.slug, slug)).limit(1)
  if (!r || (!r.published && !devApiAllowed())) return null
  return { ...(r.public as StoryPublic), id: r.id, published: r.published }
}

/** 서버 전용: 비공개 정의. 정의가 깨져 있으면 실행하지 않는다. */
export async function definitionOf(storyId: string): Promise<StoryDefinition> {
  const [r] = await db.select({ definition: storyPrivate.definition }).from(storyPrivate).where(eq(storyPrivate.storyId, storyId)).limit(1)
  if (!r) throw new Error('story_definition_missing')
  const def = r.definition as StoryDefinition
  const errs = validateDefinition(def)
  if (errs.length) throw new Error(`story_definition_invalid ${errs.slice(0, 3).join('; ')}`)
  return def
}

/** 폼이 따로 받는 칸 — 작품별 세부 칸에서 빼고 보인다. */
export const BASIC_FIELDS = ['이름', '나이', '호칭']
export const detailFields = (pub: StoryPublic) => pub.protagonist.fields.filter(f => !BASIC_FIELDS.includes(f))

export type Protagonist = { name: string; age: number; honorific: string; details: Record<string, string> }

export function parseProtagonist(pub: StoryPublic, input: { name?: string; age?: string | number; honorific?: string; details?: Record<string, string> }): Protagonist | { error: string } {
  const name = (input.name ?? '').trim().slice(0, 20) || pub.protagonist.defaultName
  const age = Number(input.age ?? pub.protagonist.minAge)
  if (!Number.isInteger(age) || age < pub.protagonist.minAge || age > 99) return { error: `나이는 만 ${pub.protagonist.minAge}세 이상으로 정해 주세요.` }
  const details: Record<string, string> = {}
  for (const f of detailFields(pub)) { const v = input.details?.[f]?.trim().slice(0, f === '내 성격과 배경' ? 500 : 120); if (v) details[f] = v }
  return { name, age, honorific: (input.honorific ?? '').trim().slice(0, 12), details }
}

export async function liveRun(userId: string, storyId: string) {
  const [r] = await db.select().from(storyRuns).where(and(eq(storyRuns.userId, userId), eq(storyRuns.storyId, storyId), ne(storyRuns.status, 'archived'))).limit(1)
  return r ?? null
}

export async function runFor(userId: string, runId: string) {
  const [r] = await db.select().from(storyRuns).where(and(eq(storyRuns.id, runId), eq(storyRuns.userId, userId))).limit(1)
  return r ?? null
}

export async function runsOf(userId: string) {
  return db.select({ id: storyRuns.id, storyId: storyRuns.storyId, runNo: storyRuns.runNo, status: storyRuns.status, updatedAt: storyRuns.updatedAt })
    .from(storyRuns).where(eq(storyRuns.userId, userId)).orderBy(desc(storyRuns.updatedAt))
}

/**
 * 회차 시작. fresh=false 면 살아 있는 회차를 그대로 돌려준다(이어하기). fresh=true 면 이전 회차를 archived 로 두고 새 회차를 만든다.
 * 동시에 두 번 눌러도 회차는 하나 — (user, story) 살아 있는 회차 고유 색인과 사용자·작품 잠금.
 */
export async function startRun(userId: string, storyId: string, protagonist: Protagonist, opts: { fresh: boolean; contactOptIn: boolean }) {
  const def = await definitionOf(storyId)
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`story-run:${userId}:${storyId}`}))`)
    const [live] = await tx.select().from(storyRuns).where(and(eq(storyRuns.userId, userId), eq(storyRuns.storyId, storyId), ne(storyRuns.status, 'archived'))).limit(1)
    if (live && !opts.fresh) return live
    if (live) await tx.update(storyRuns).set({ status: 'archived', updatedAt: new Date() }).where(eq(storyRuns.id, live.id))
    const [row] = await tx.select({ next: sql<number>`coalesce(max(${storyRuns.runNo}), 0) + 1` }).from(storyRuns)
      .where(and(eq(storyRuns.userId, userId), eq(storyRuns.storyId, storyId)))
    const state: StoryState = initialState(def)
    if (opts.contactOptIn) {
      state.contactOptIn = true
      for (const k of Object.keys(state.rel)) state.rel[k]!.contact = 'allowed'
    }
    const [run] = await tx.insert(storyRuns).values({ userId, storyId, runNo: Number(row?.next ?? 1), definitionVersion: def.version, protagonist, state }).returning()
    return run!
  })
}

export { toPublic }
