import { cookies, headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db, alphaSessions } from '@miro/db'
import { INITIAL_STATE, type RelationshipState } from './relationship'
import { YUJIN } from './character'
import type { AlphaMessage } from './prompt'

const COOKIE = 'miro_alpha'
const DAYS = 30

export type AlphaSession = {
  id: string
  ip: string | null
  state: RelationshipState
  memories: string[]
  messages: AlphaMessage[]
  userMessages: number
  wowAt: Date | null
  realityAt: Date | null
  cliffAt: Date | null
  createdAt: Date
}

export async function clientIp(): Promise<string | null> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
}

/** 쿠키의 세션. 없거나 지워졌으면 null — 호출자가 /alpha 로 돌려보낸다. */
export async function getAlphaSession(): Promise<AlphaSession | null> {
  const id = (await cookies()).get(COOKIE)?.value
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const [row] = await db.select().from(alphaSessions).where(eq(alphaSessions.id, id)).limit(1)
  if (!row) return null
  return { ...row, state: row.state as unknown as RelationshipState }
}

/** 체험 시작 — 유진의 첫 메시지가 이미 와 있는 상태로 세션을 만들고 쿠키를 준다. */
export async function createAlphaSession(): Promise<AlphaSession> {
  const ip = await clientIp()
  const opening: AlphaMessage = { role: 'character', text: YUJIN.opening, at: new Date().toISOString() }
  const [row] = await db.insert(alphaSessions).values({ ip, state: INITIAL_STATE, messages: [opening] }).returning()
  const jar = await cookies()
  jar.set(COOKIE, row!.id, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
    expires: new Date(Date.now() + DAYS * 86_400_000),
  })
  return { ...row!, state: row!.state as unknown as RelationshipState }
}

export async function saveAlphaSession(s: AlphaSession): Promise<void> {
  await db.update(alphaSessions).set({
    state: s.state, memories: s.memories, messages: s.messages, userMessages: s.userMessages,
    wowAt: s.wowAt, realityAt: s.realityAt, cliffAt: s.cliffAt, lastSeenAt: new Date(),
  }).where(eq(alphaSessions.id, s.id))
}
