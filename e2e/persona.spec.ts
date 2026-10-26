import { expect, test } from '@playwright/test'
import { confirmConversationPersona, signUp } from './helpers'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

test('each room confirms its own persona and keeps it when the shared profile changes', async ({ page }) => {
  await signUp(page, BASE, undefined, { persona: false })
  await page.goto(`${BASE}/character/thomas`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/)
  const chat = page.url()
  await expect(page.getByRole('heading', { name: '이 이야기 속 나' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '역할극 입력' })).toHaveCount(0)
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('지우')
  await page.getByRole('button', { name: '여성', exact: true }).click()
  await page.getByRole('textbox', { name: '나에 대해' }).fill('스물여섯, 출판사 편집자.')
  await page.getByRole('button', { name: '이 설정으로 시작하기', exact: true }).click()
  await confirmConversationPersona(page)
  await page.reload()
  await expect(page.getByRole('textbox', { name: '역할극 입력' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '이 이야기 속 나' })).toHaveCount(0)

  // A room override does not rename the account. Edit the shared nickname separately.
  await page.goto(`${BASE}/my`)
  await page.getByRole('button', { name: '프로필 편집' }).click()
  const profile = page.getByRole('dialog', { name: '프로필 편집' })
  await profile.getByRole('textbox', { name: '닉네임' }).fill('지우 선배')
  await profile.getByRole('button', { name: '저장', exact: true }).click()
  await expect(profile).toBeHidden()
  await expect(page.locator('main').getByText('지우 선배', { exact: true })).toBeVisible()
  await page.goto(`${BASE}/persona?next=/my`)
  await expect(page.getByRole('heading', { name: '내 페르소나' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '이름', exact: true })).toHaveValue('지우 선배')

  await page.goto(chat)
  await page.getByRole('button', { name: '대화 메뉴', exact: true }).click()
  const room = page.getByRole('dialog', { name: '대화 메뉴' })
  await expect(room.getByRole('textbox', { name: '이름', exact: true })).toHaveValue('지우')
  await expect(room.getByRole('button', { name: '여성', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
