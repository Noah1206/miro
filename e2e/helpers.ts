import { expect, type Page } from '@playwright/test'

/** 소셜 로그인(개발 시뮬레이션)으로 새 계정을 만들고 약관까지 통과한다. 사용한 이메일을 돌려준다. */
export async function signUp(page: Page, base: string, email = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@miro.dev`): Promise<string> {
  await page.goto(`${base}/login`)
  await page.getByRole('link', { name: 'Google로 계속하기' }).click()
  await expect(page).toHaveURL(/\/auth\/mock\/google/)
  await page.getByPlaceholder('이메일').fill(email)
  await page.getByRole('button', { name: '계속' }).click()
  await expect(page).toHaveURL(/\/terms/)
  // 동의는 실제로 체크해야 열린다 — '모두 동의' 로 한 번에 켜고 진행한다.
  await page.getByRole('button', { name: '모두 동의' }).click()
  await page.getByRole('button', { name: '다음으로 진행하기' }).click()
  return email
}

/** 기존 계정으로 다시 로그인 시도. 결과 URL 을 돌려준다 (삭제된 계정이면 /login?error=deleted). */
export async function signInAgain(page: Page, base: string, email: string): Promise<string> {
  await page.goto(`${base}/login`)
  await page.getByRole('link', { name: 'Google로 계속하기' }).click()
  await page.getByPlaceholder('이메일').fill(email)
  await page.getByRole('button', { name: '계속' }).click()
  await page.waitForLoadState('networkidle')
  return page.url()
}
