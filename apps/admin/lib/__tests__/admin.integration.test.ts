import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, adminActions, adminUsers, bankTransferOrders, characters, hashPassword, messages, relationships, reports, roleplaySessions, users, worldStates, worlds } from '@miro/db'
import { act, reportDetail } from '../reports'
import { approveBankOrder, listBankOrders, rejectBankOrder } from '../payments'

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
    // 출시되는 코드만 본다. __tests__ 는 라우트도 링크도 만들지 않으며, 운영 테이블을
    // 검증하는 테스트가 여기 걸리면 제약을 우회하도록 테스트를 고치게 된다.
    const hits = execSync(`grep -rl --exclude-dir=__tests__ "miro_admin\\|/admin\\|admin_users" apps/web/app apps/web/lib apps/web/components || true`, { cwd: process.cwd() }).toString().trim()
    expect(hits).toBe('')
  })
})

describeDb('bank transfer decisions', () => {
  const made: string[] = []
  const admins: string[] = []
  async function user() {
    const [u] = await db.insert(users).values({ email: `btadm-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id); return u!.id
  }
  async function admin() {
    const [a] = await db.insert(adminUsers).values({
      email: `adm-${randomBytes(5).toString('hex')}@miro.dev`, passwordHash: 'x', role: 'superadmin',
    }).returning()
    admins.push(a!.id); return a!.id
  }
  async function order(userId: string) {
    const [o] = await db.insert(bankTransferOrders).values({
      userId, kind: 'pass', amountMinor: 9900, currency: 'KRW',
      depositorName: '홍길동', referenceCode: randomBytes(3).toString('hex').toUpperCase(),
      expiresAt: new Date(Date.now() + 72 * 3600_000),
    }).returning()
    return o!.id
  }
  afterAll(async () => {
    for (const id of admins) await db.delete(adminActions).where(eq(adminActions.adminId, id))
    for (const id of made) await db.delete(users).where(eq(users.id, id))
    for (const id of admins) await db.delete(adminUsers).where(eq(adminUsers.id, id))
  })

  it('approving marks the order for settlement, and only once', async () => {
    const o = await order(await user()); const a = await admin()
    expect(await approveBankOrder(a, o, '9/16 입금 확인')).toBe('approved')
    // 두 번째는 상태 관문에서 멈춘다 — 지급이 두 번 예약되지 않는다.
    expect(await approveBankOrder(a, o)).toBe('not_pending')
    const [row] = await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.id, o))
    expect(row!.status).toBe('approved'); expect(row!.decidedBy).toBe(a)
    // 승인은 예약일 뿐 — 지급은 web cron 이 한다.
    expect(row!.settledAt).toBe(null)
  })

  it('two admins approving at the same moment approve once', async () => {
    const o = await order(await user()); const [a1, a2] = [await admin(), await admin()]
    const results = await Promise.all([approveBankOrder(a1, o), approveBankOrder(a2, o)])
    expect(results.filter(r => r === 'approved')).toHaveLength(1)
  })

  it('rejecting needs a reason, blocks later approval, and is audited', async () => {
    const o = await order(await user()); const a = await admin()
    await expect(rejectBankOrder(a, o, '   ')).rejects.toThrow('NOTE_REQUIRED')
    expect(await rejectBankOrder(a, o, '입금 확인 안 됨')).toBe('rejected')
    expect(await approveBankOrder(a, o)).toBe('not_pending')
    const audit = await db.select().from(adminActions).where(eq(adminActions.bankOrderId, o))
    expect(audit.map(r => r.action)).toEqual(['bank_order_reject'])
  })

  it('lists waiting orders oldest first', async () => {
    const rows = await listBankOrders('awaiting')
    expect(rows.every(r => r.status === 'awaiting')).toBe(true)
  })
})
