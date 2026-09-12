import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, adminActions, adminUsers, characters, hashPassword, messages, relationships, reports, roleplaySessions, users, worldStates, worlds } from '@miro/db'
import { act, reportDetail } from '../reports'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip

describeDb('admin review', () => {
  const madeUsers: string[] = []; const madeAdmins: string[] = []
  async function admin(role: 'viewer' | 'reviewer' | 'superadmin' = 'reviewer') {
    const [a] = await db.insert(adminUsers).values({ email: `adm-${randomBytes(4).toString('hex')}@miro.dev`, passwordHash: hashPassword('x'), role }).returning()
    madeAdmins.push(a!.id); return a!.id
  }
  async function report() {
    const [u] = await db.insert(users).values({ email: `ru-${randomBytes(5).toString('hex')}@miro.dev` }).returning(); madeUsers.push(u!.id)
    const [c] = await db.select({ id: characters.id, worldId: worlds.id }).from(characters).innerJoin(worlds, eq(worlds.characterId, characters.id)).where(eq(characters.slug, 'thomas')).limit(1)
    const [s] = await db.insert(roleplaySessions).values({ userId: u!.id, characterId: c!.id, worldId: c!.worldId }).returning({ id: roleplaySessions.id })
    await db.insert(worldStates).values({ sessionId: s!.id, currentLocation: 'x', currentTime: 'y' }); await db.insert(relationships).values({ sessionId: s!.id })
    const [m] = await db.insert(messages).values({ sessionId: s!.id, role: 'character', content: '문제 발언', turnIndex: 3 }).returning({ id: messages.id })
    const [r] = await db.insert(reports).values({ reporterId: u!.id, targetType: 'message', targetId: m!.id, reason: 'safety', characterId: c!.id, sessionId: s!.id, targetSnapshot: { content: '문제 발언', turnIndex: 3 } }).returning()
    return { reportId: r!.id, sessionId: s!.id, messageId: m!.id }
  }
  afterAll(async () => {
    for (const id of madeAdmins) await db.delete(adminActions).where(eq(adminActions.adminId, id))
    for (const id of madeUsers) await db.delete(users).where(eq(users.id, id))
    for (const id of madeAdmins) await db.delete(adminUsers).where(eq(adminUsers.id, id))
  })

  it('hide_content hides the message, resolves the report, and writes an audit row', async () => {
    const a = await admin(); const { reportId, messageId } = await report()
    expect(await act(a, reportId, 1, 'hide_content', '정책 4조 위반')).toBe('ok')
    const [m] = await db.select().from(messages).where(eq(messages.id, messageId)); expect(m!.hiddenAt).not.toBeNull()
    const [r] = await db.select().from(reports).where(eq(reports.id, reportId)); expect(r!.status).toBe('resolved'); expect(r!.version).toBe(2); expect(r!.reviewedBy).toBe(a)
    const log = await db.select().from(adminActions).where(eq(adminActions.reportId, reportId)); expect(log).toHaveLength(1); expect(log[0]).toMatchObject({ action: 'hide_content', previousStatus: 'pending', newStatus: 'resolved' })
  })

  it('restrict_session marks the roleplay restricted', async () => {
    const a = await admin(); const { reportId, sessionId } = await report()
    expect(await act(a, reportId, 1, 'restrict_session', '반복 위반')).toBe('ok')
    const [s] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)); expect(s!.restrictedAt).not.toBeNull()
    expect((await reportDetail(reportId))!.sessionRestricted).toBe(true)
  })

  it('a restriction without a note is refused', async () => {
    const a = await admin(); const { reportId } = await report()
    expect(await act(a, reportId, 1, 'hide_content', '')).toBe('note_required')
  })

  it('two admins racing: the second sees stale and nothing is applied twice', async () => {
    const a = await admin(); const b = await admin(); const { reportId } = await report()
    expect(await act(a, reportId, 1, 'dismiss', '')).toBe('ok')
    expect(await act(b, reportId, 1, 'hide_content', '늦은 조치')).toBe('stale')
    const log = await db.select().from(adminActions).where(eq(adminActions.reportId, reportId)); expect(log).toHaveLength(1)
  })

  it('a resolved report shows its history and refuses re-resolution; reopen works', async () => {
    const a = await admin(); const { reportId } = await report()
    await act(a, reportId, 1, 'resolve_no_action', '')
    expect(await act(a, reportId, 2, 'dismiss', '')).toBe('invalid_transition')
    expect(await act(a, reportId, 2, 'reopen', '')).toBe('ok')
    const d = await reportDetail(reportId); expect(d!.report.status).toBe('reviewing'); expect(d!.history).toHaveLength(2)
  })

  it('detail carries context turns but no relationship numbers', async () => {
    const { reportId } = await report(); const d = await reportDetail(reportId)
    expect(d!.context.some((m) => m.content === '문제 발언')).toBe(true)
    expect(JSON.stringify(d)).not.toMatch(/trust|attachment|emotionalDistance/)
  })

  it('the user app has no route or link into the admin console', async () => {
    const { execSync } = await import('node:child_process')
    const hits = execSync(`grep -rl "miro_admin\\|/admin\\|admin_users" apps/web/app apps/web/lib apps/web/components || true`, { cwd: process.cwd() }).toString().trim()
    expect(hits).toBe('')
  })
})
