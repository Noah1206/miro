import { afterAll, describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, accountDeletions, authSessions, characters, messages, pushSubscriptions, relationships, reports, roleplaySessions, users, worldStates, worlds } from '@miro/db'
import { POLICY } from '@miro/config'
import { listSessions, purgeDeleted, setArchived, softDelete } from '../archive'
import { submitReport } from '../reports'
import { deleteAccount, deletionImpact } from '../account'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip

describeDb('archive / reports / account', () => {
  const made: string[] = []
  async function user() {
    const [u] = await db.insert(users).values({ email: `op-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id); return u!.id
  }
  async function session(userId: string) {
    const [c] = await db.select({ id: characters.id, worldId: worlds.id }).from(characters).innerJoin(worlds, eq(worlds.characterId, characters.id)).where(eq(characters.slug, 'thomas')).limit(1)
    const [s] = await db.insert(roleplaySessions).values({ userId, characterId: c!.id, worldId: c!.worldId }).returning({ id: roleplaySessions.id })
    await db.insert(worldStates).values({ sessionId: s!.id, currentLocation: '런던', currentTime: '저녁' })
    await db.insert(relationships).values({ sessionId: s!.id, trust: 88 })
    const [m] = await db.insert(messages).values({ sessionId: s!.id, role: 'character', content: '…', turnIndex: 1 }).returning({ id: messages.id })
    return { sessionId: s!.id, messageId: m!.id }
  }
  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })

  it('the archive list never carries relationship numbers', async () => {
    const u = await user(); await session(u)
    const [row] = await listSessions(u, 'active')
    expect(row!.location).toBe('런던')
    expect(JSON.stringify(row)).not.toMatch(/trust|88/)
  })

  it('archive → archived tab; restore → active', async () => {
    const u = await user(); const { sessionId } = await session(u)
    await setArchived(u, sessionId, true)
    expect(await listSessions(u, 'active')).toHaveLength(0)
    expect(await listSessions(u, 'archived')).toHaveLength(1)
    await setArchived(u, sessionId, false)
    expect(await listSessions(u, 'active')).toHaveLength(1)
  })

  it('delete is soft, idempotent, and keeps state for the retention window', async () => {
    const u = await user(); const { sessionId } = await session(u)
    expect(await softDelete(u, sessionId)).toBe('deleted')
    expect(await softDelete(u, sessionId)).toBe('already')       // 반복 요청은 중복 처리하지 않는다
    expect(await listSessions(u, 'active')).toHaveLength(0)
    expect(await listSessions(u, 'archived')).toHaveLength(0)
    const [r] = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))
    expect(r).toBeDefined()                                        // 아직 복구 가능
    expect(await purgeDeleted(new Date())).toBe(0)                 // 보존 기간 안
    const later = new Date(Date.now() + (POLICY.retention.deletedSessionDays + 1) * 86_400_000)
    expect(await purgeDeleted(later)).toBeGreaterThanOrEqual(1)
    expect(await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))).toHaveLength(0)
  })

  it('a stranger cannot delete my session', async () => {
    const a = await user(); const b = await user(); const { sessionId } = await session(a)
    expect(await softDelete(b, sessionId)).toBe('not_found')
  })

  it('a report snapshots the content and rejects duplicates', async () => {
    const u = await user(); const { sessionId, messageId } = await session(u)
    const r = await submitReport(u, { type: 'message', id: messageId }, 'harassment', '설명')
    expect(r.ok).toBe(true)
    const [row] = await db.select().from(reports).where(eq(reports.reporterId, u))
    expect(row!.sessionId).toBe(sessionId)
    expect(row!.targetSnapshot).toMatchObject({ content: '…', role: 'character' })
    expect(row!.status).toBe('pending')
    expect(await submitReport(u, { type: 'message', id: messageId }, 'other', '')).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('a report on content I cannot access is refused', async () => {
    const a = await user(); const b = await user(); const { messageId } = await session(a)
    expect(await submitReport(b, { type: 'message', id: messageId }, 'safety', '')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('the report survives deletion of the message', async () => {
    const u = await user(); const { messageId } = await session(u)
    await submitReport(u, { type: 'message', id: messageId }, 'safety', '')
    await db.delete(messages).where(eq(messages.id, messageId))
    const [row] = await db.select().from(reports).where(eq(reports.reporterId, u))
    expect(row!.targetSnapshot).toMatchObject({ content: '…' })
  })

  it('account deletion shows impact, then blocks login and hides everything', async () => {
    const u = await user(); await session(u)
    await db.insert(characters).values({ ownerId: u, name: '내 캐릭터', personality: 'p' })
    await db.insert(authSessions).values({ userId: u, token: randomBytes(16).toString('hex'), expiresAt: new Date(Date.now() + 1e6) })
    await db.insert(pushSubscriptions).values({ userId: u, endpoint: `https://p/${u}`, p256dh: 'x', auth: 'y' })

    const impact = await deletionImpact(u)
    expect(impact).toMatchObject({ sessions: 1, createdCharacters: 1 })

    expect(await deleteAccount(u)).toBe('completed')
    expect(await deleteAccount(u)).toBe('already')
    const [row] = await db.select().from(users).where(and(eq(users.id, u), isNull(users.deletedAt)))
    expect(row).toBeUndefined()                                                       // 로그인 불가
    expect(await db.select().from(authSessions).where(eq(authSessions.userId, u))).toHaveLength(0)
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, u))).toHaveLength(0)
    expect(await listSessions(u, 'active')).toHaveLength(0)
    const [d] = await db.select().from(accountDeletions).where(eq(accountDeletions.userId, u))
    expect(d!.status).toBe('completed')
    expect(d!.impact).toMatchObject({ sessions: 1 })
  })
})
