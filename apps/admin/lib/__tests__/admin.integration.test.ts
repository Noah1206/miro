import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, adminActions, adminUsers, bankTransferOrders, characters, hashPassword, messages, pushSubscriptions, realityContacts, realityPushJobs, relationships, reports, roleplaySessions, users, worldStates, worlds } from '@miro/db'
import { act, reportDetail } from '../reports'
import { approveBankOrder, listBankOrders, recentSpendByUser, rejectBankOrder } from '../payments'
import { listCharactersForAdmin, setExperienceType } from '../characters'

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

describeDb('experience type designation', () => {
  const madeUsers: string[] = []; const madeAdmins: string[] = []; const madeChars: string[] = []
  async function admin() {
    const [a] = await db.insert(adminUsers).values({ email: `adm-${randomBytes(5).toString('hex')}@miro.dev`, passwordHash: 'x', role: 'superadmin' }).returning()
    madeAdmins.push(a!.id); return a!.id
  }
  async function character() {
    const [u] = await db.insert(users).values({ email: `xa-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    madeUsers.push(u!.id)
    const [c] = await db.insert(characters).values({ ownerId: u!.id, name: '지정', personality: '차분하다.' }).returning({ id: characters.id })
    madeChars.push(c!.id)
    const [w] = await db.insert(worlds).values({ characterId: c!.id, location: '서울' }).returning({ id: worlds.id })
    return { userId: u!.id, id: c!.id, worldId: w!.id }
  }
  afterAll(async () => {
    for (const id of madeAdmins) await db.delete(adminActions).where(eq(adminActions.adminId, id))
    for (const id of madeChars) await db.delete(characters).where(eq(characters.id, id))
    for (const id of madeUsers) await db.delete(users).where(eq(users.id, id))
    for (const id of madeAdmins) await db.delete(adminUsers).where(eq(adminUsers.id, id))
  })

  it('a new character starts as chat, and putting it in 미로 is audited once', async () => {
    const a = await admin(); const c = await character()
    expect((await db.select({ t: characters.experienceType }).from(characters).where(eq(characters.id, c.id)))[0]!.t).toBe('chat')
    expect(await setExperienceType(a, c.id, 'reality', '초기 미로 대상')).toMatchObject({ result: 'changed', from: 'chat' })
    // 이미 그 유형이면 아무것도 하지 않는다 — 감사 기록도 남기지 않는다.
    expect(await setExperienceType(a, c.id, 'reality')).toEqual({ result: 'unchanged' })
    const audit = await db.select().from(adminActions).where(eq(adminActions.characterId, c.id))
    expect(audit.map(r => r.action)).toEqual(['character_set_reality'])
    expect((await listCharactersForAdmin('reality')).some(r => r.id === c.id)).toBe(true)
  })

  it('moving a character back to chat clears pending intents and cancels queued pushes in the same step', async () => {
    const a = await admin(); const c = await character()
    await setExperienceType(a, c.id, 'reality')
    const [s] = await db.insert(roleplaySessions).values({
      userId: c.userId, characterId: c.id, worldId: c.worldId,
      pendingRealityIntent: { channel: 'message', reason: '보고 싶다', urgency: 0.7 },
    }).returning({ id: roleplaySessions.id })
    const [sub] = await db.insert(pushSubscriptions).values({ userId: c.userId, endpoint: `https://push.test/${c.userId}`, p256dh: 'k', auth: 'a' }).returning({ id: pushSubscriptions.id })
    const [contact] = await db.insert(realityContacts).values({ sessionId: s!.id, channel: 'message', dedupeKey: `y:${s!.id}`, status: 'sent', payload: { text: 'x' } }).returning({ id: realityContacts.id })
    await db.insert(realityPushJobs).values({ contactId: contact!.id, subscriptionId: sub!.id })

    const r = await setExperienceType(a, c.id, 'chat', '검증 종료')
    expect(r).toMatchObject({ result: 'changed', from: 'reality', clearedIntents: 1, cancelledPushes: 1 })
    expect((await db.select({ p: roleplaySessions.pendingRealityIntent }).from(roleplaySessions).where(eq(roleplaySessions.id, s!.id)))[0]!.p).toBeNull()
    expect((await db.select({ st: realityPushJobs.status }).from(realityPushJobs).where(eq(realityPushJobs.contactId, contact!.id)))[0]!.st).toBe('cancelled')
    expect((await db.select().from(adminActions).where(eq(adminActions.characterId, c.id))).map(r => r.action)).toEqual(['character_set_reality', 'character_set_chat'])
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

  it('sums only this account\'s approved spend inside the window', async () => {
    // 상한을 두지 않는 대신 운영자가 이 숫자를 보고 판단한다 — 틀리면 판단 근거가 사라진다.
    const u = await user(); const other = await user(); const a = await admin()
    // 대기 주문은 사용자당 하나뿐이라(부분 UNIQUE) 한 건씩 처리하며 쌓는다.
    const paid = await order(u); await approveBankOrder(a, paid)
    const rejected = await order(u); await rejectBankOrder(a, rejected, '입금 없음')
    await order(u)                                   // 대기 중 — 아직 낸 돈이 아니다
    const someoneElse = await order(other); await approveBankOrder(a, someoneElse)

    const spend = await recentSpendByUser([u, other])
    expect(spend.get(u)).toBe(9900)                  // 승인된 한 건만
    expect(spend.get(other)).toBe(9900)              // 남의 결제가 섞이지 않는다

    // 30일보다 오래된 승인은 창 밖이다.
    const later = new Date(Date.now() + 31 * 86_400_000)
    expect((await recentSpendByUser([u], later)).get(u)).toBeUndefined()
  })

  it('lists waiting orders oldest first', async () => {
    const rows = await listBankOrders('awaiting')
    expect(rows.every(r => r.status === 'awaiting')).toBe(true)
  })
})
