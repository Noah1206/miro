import { eq, inArray } from 'drizzle-orm'
import { db, characters, contactProfiles } from '@miro/db'
import { defaultRoutine } from '@miro/domain'
import { cloneCharacterAsReality } from '@/lib/dev/reality-clone'

/** 시드 캐릭터의 reality 복제본. 구현은 lib/dev/reality-clone.ts — E2E 의 dev 라우트와 같다. */
const cloned: string[] = []

/**
 * 복제본은 하루 종일 연락이 닿는 생활 리듬으로 시작한다. 기본 리듬(활동 시간 밖은 잠)을 두면 결과가 벽시계에 달려
 * 자정이 넘으면 통화가 '받지 않음' 으로 끝나 통화 테스트가 흔들렸다(9/27 00시). 바쁜 캐릭터가 필요한 테스트는 직접 바꾼다.
 * 시각을 고정해 활동 시간 규칙을 검증하는 테스트는 routine: 'default' 로 기본 리듬(활동 시간 밖은 잠)을 쓴다.
 * 어느 쪽이든 리듬을 직접 저장한다 — 비어 있으면 첫 판정이 배경에서 AI 생성을 띄운다(테스트 DB 에 사용량이 남고, 키가 있으면 실호출).
 */
export const ALWAYS_FREE = { version: 1, source: 'authored', note: null, generatedAt: '2026-09-27T00:00:00.000Z',
  blocks: [{ days: [], start: '00:00', end: '23:59', label: '자유 시간', availability: 'free' }] }

export async function cloneAsReality(slug: string, opts: { ownerId?: string; routine?: 'free' | 'default' } = {}) {
  const c = await cloneCharacterAsReality(slug, { ownerId: opts.ownerId })
  cloned.push(c.id)
  const [p] = await db.select({ start: contactProfiles.activeHoursStart, end: contactProfiles.activeHoursEnd }).from(contactProfiles).where(eq(contactProfiles.characterId, c.id))
  const routine = opts.routine === 'default' ? defaultRoutine({ start: p!.start, end: p!.end }, new Date().toISOString()) : ALWAYS_FREE
  await db.update(contactProfiles).set({ routine }).where(eq(contactProfiles.characterId, c.id))
  return c
}

/** afterAll 에서 부른다. 세션·연락은 캐릭터를 따라 지워진다. */
export async function dropRealityClones(): Promise<void> {
  if (cloned.length) await db.delete(characters).where(inArray(characters.id, cloned.splice(0)))
}
