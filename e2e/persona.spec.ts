import { expect, test } from '@playwright/test'
import { signUp } from './helpers'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/** 채팅을 처음 진행하면 페르소나부터 만든다 — 저장하면 그 대화로 돌아가고, 마이페이지에서 고친다(2026-09-29 결정). */
test('the first chat asks for a persona, returns to the chat, and My page edits it', async ({ page }) => {
  await signUp(page, BASE, undefined, { persona: false })
  await page.goto(`${BASE}/character/thomas`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(/\/persona\?next=%2Fchat%2F[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: '나를 소개해 주세요' })).toBeVisible()

  await page.getByRole('textbox', { name: '이름' }).fill('지우')
  await page.getByRole('button', { name: '여성', exact: true }).click()
  await page.getByRole('textbox', { name: '나에 대해' }).fill('스물여섯, 출판사 편집자.')
  await page.getByRole('button', { name: '저장하고 대화하기' }).click()
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/)
  await expect(page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…')).toBeVisible()

  // 한 번 만들면 다시 묻지 않는다.
  await page.reload()
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/)

  // 마이페이지에서 보이고, 같은 화면에서 고친다.
  await page.goto(`${BASE}/my`)
  await page.getByRole('link', { name: '내 페르소나 지우 바꾸기' }).click()
  await expect(page.getByRole('heading', { name: '내 페르소나' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '이름' })).toHaveValue('지우')
  await expect(page.getByRole('button', { name: '여성', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('textbox', { name: '이름' }).fill('지우 선배')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page).toHaveURL(/\/my$/)
  await expect(page.getByRole('link', { name: '내 페르소나 지우 선배 바꾸기' })).toBeVisible()
})
