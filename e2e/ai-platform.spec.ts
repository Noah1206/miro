import { test, expect } from '@playwright/test'
import { signUp } from './helpers'
const BASE=process.env.E2E_BASE ?? 'http://localhost:3000'
test('monthly usage and independently revocable AI consent',async({page})=>{
  await signUp(page,BASE)
  await page.goto(`${BASE}/my/subscription`)
  await expect(page.getByText('이번 달 Reality 사용량')).toBeVisible()
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuemax','100')
  const usage=await page.request.get(`${BASE}/api/usage`)
  const body=await usage.json()
  expect(body.period).toBe('monthly');expect(body.usedPercent).toBe(0)
  expect(JSON.stringify(body)).not.toMatch(/tokens|model|actualCost|inputCost/)
  await page.goto(`${BASE}/my/ai-data`)
  const training=page.getByRole('checkbox',{name:'모델 학습을 위한 데이터 제공에 동의하기'})
  const evaluation=page.getByRole('checkbox',{name:'대화 품질 평가에 참여하기'})
  // 저장 버튼은 저장 중 잠긴다(중복 제출 방지). 응답을 기다리지 않고 다음 조작을 하면 부하가 걸릴 때
  // 두 번째 저장이 잠긴 버튼 앞에서 시간 초과가 난다 — 저장 요청의 응답과 버튼이 풀리는 것까지 기다린다.
  const save=async()=>{
    await Promise.all([
      page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/my/ai-data'),
      page.getByRole('button',{name:'저장하기'}).click(),
    ])
    await expect(page.getByRole('button',{name:'저장하기'})).toBeEnabled()
  }
  await expect(training).not.toBeChecked();await expect(evaluation).not.toBeChecked()
  await evaluation.check();await save()
  await expect(evaluation).toBeChecked();await expect(training).not.toBeChecked()
  await evaluation.uncheck();await save()
  await expect(evaluation).not.toBeChecked()
  await page.goto(`${BASE}/my/ai-data`)
  await expect(page.locator('main').first()).toHaveCSS('opacity','1')
  await expect(page.getByRole('heading',{name:'AI 개선 참여'})).toHaveCSS('opacity','1')
  await page.screenshot({path:'/tmp/miro-ai-consent.png',fullPage:true})
})
test('usage and training controls require authentication',async({request})=>{
  expect((await request.get(`${BASE}/api/usage`)).status()).toBe(401)
  expect((await request.get(`${BASE}/api/ai/consent`)).status()).toBe(401)
  expect((await request.post(`${BASE}/api/ai/feedback`,{headers:{origin:BASE},data:{requestId:'invalid',signal:'like'}})).status()).toBe(401)
})
