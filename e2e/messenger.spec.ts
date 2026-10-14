import { expect, test } from '@playwright/test'
import { and, asc, eq } from 'drizzle-orm'
import { db, authSessions, characters, messages, messengerInbox, users, userPersonas, userSettings } from '@miro/db'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { realityCharacter } from './helpers'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3200'
let ownerId: string | undefined, fixtureCharacter: string | undefined
test.afterEach(async () => {
  if (fixtureCharacter) await db.delete(characters).where(eq(characters.id, fixtureCharacter))
  if (ownerId) await db.delete(users).where(eq(users.id, ownerId))
  fixtureCharacter = undefined; ownerId = undefined
})


test('messenger sends independently, keeps the draft editable, and only shows a persisted read receipt', async ({ page }) => {
  // Synthetic authenticated fixture isolates messaging from the separate signup flow.
  const [user] = await db.insert(users).values({ email: `messenger-${randomUUID()}@test.local` }).returning()
  ownerId = user!.id
  const token = randomBytes(32).toString('hex')
  await db.insert(authSessions).values({ userId: user!.id, token: 'sha256:' + createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000) })
  await db.insert(userPersonas).values({ userId: user!.id, name: '테스터' })
  await db.insert(userSettings).values({ userId: user!.id, timeZone: 'Asia/Seoul' })
  await page.context().addCookies([{ name: 'miro_session', value: token, url: BASE, httpOnly: true, sameSite: 'Lax' }])
  await page.goto(`${BASE}/home`)
  const characterId = await realityCharacter(page, 'thomas')
  fixtureCharacter = characterId
  await page.goto(`${BASE}/character/${characterId}`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
  const sessionId = page.url().split('/chat/')[1]!
  await page.goto(`${BASE}/messages/${sessionId}`)
  const input = page.getByRole('textbox', { name: '문자 입력' })
  const send = page.getByRole('button', { name: '보내기', exact: true })
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/messages', async route => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  await input.fill('우산은 내일 가져갈게요.')
  await send.click()
  await expect(input).toHaveValue('')
  await expect(input).toBeEnabled()
  await expect(send.locator('[data-status="loading"]')).toHaveCount(0)
  await expect(page.getByText('입력 중', { exact: false })).toHaveCount(0)
  await input.fill('그리고 잘 들어갔어요.')
  await expect(send).toBeEnabled()
  await send.click()
  release()
  await expect(page.locator('[data-delivery="sent"]')).toHaveCount(2)
  await expect(page.locator('[data-unread]')).toHaveCount(2)
  await expect(page.locator('[data-delivery="sent"] > p')).toHaveText(['우산은 내일 가져갈게요.', '그리고 잘 들어갔어요.'])
  await expect(input).toBeEnabled()
  await input.fill('답장을 기다리는 동안 다음 말을 쓸 수 있어요.')
  await expect(send).toBeEnabled()
  // The character opening the delivery is an independently persisted event.
  const rows = await db.select().from(messages).where(and(eq(messages.sessionId, sessionId), eq(messages.kind, 'messenger'))).orderBy(asc(messages.createdAt))
  await db.update(messengerInbox).set({ status: 'left', readAt: new Date(), decidedAt: new Date() }).where(eq(messengerInbox.messageId, rows[0]!.id))
  await expect(page.locator('[data-read]')).toHaveCount(1)
  await expect(page.locator('[data-unread]')).toHaveCount(1)
  await expect(input).toHaveValue('답장을 기다리는 동안 다음 말을 쓸 수 있어요.')
  await page.route('**/messenger-photo-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#cfc4ff"/></svg>' }))
  await db.insert(messages).values({ sessionId, role: 'character', kind: 'photo', content: '/messenger-photo-fixture.svg',
    blocks: [{ type: 'reality', channel: 'photo', caption: '네가 말했던 공방 풍경이야.', photoDescription: '사람 없는 공방 풍경' }], turnIndex: 0 })
  const photo = page.getByRole('button', { name: '사진 크게 보기' })
  await expect(photo).toBeVisible()
  await expect(input).toHaveValue('답장을 기다리는 동안 다음 말을 쓸 수 있어요.')
  await photo.click()
  await expect(page.getByRole('dialog', { name: '사진 크게 보기' })).toBeVisible()
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('messenger.png'), fullPage: true })
  await page.reload()
  await expect(page.locator('[data-read]')).toHaveCount(1)
  await expect(page.locator('[data-unread]')).toHaveCount(1)
})
