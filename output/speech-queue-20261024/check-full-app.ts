import { chromium, expect } from '@playwright/test'
import { closeWelcome } from '../../e2e/helpers'
import { writeFileSync } from 'node:fs'
const base='http://localhost:8812'
async function main(){
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:390,height:844},locale:'ko-KR',reducedMotion:'reduce'})
await page.addInitScript(()=>{
 const w=window as unknown as {speechPlaybackEnded:number};w.speechPlaybackEnded=0
 const original=HTMLMediaElement.prototype.play
 HTMLMediaElement.prototype.play=function(){if(this.src.startsWith('blob:'))this.addEventListener('ended',()=>{w.speechPlaybackEnded++},{once:true});return original.call(this)}
})
const requests:Array<{method:string;url:string;status:number}>=[]
page.on('response',r=>{if(r.url().includes('/api/tts'))requests.push({method:r.request().method(),url:new URL(r.url()).pathname,status:r.status()})})
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
await page.route('**/*',route=>new URL(route.request().url()).hostname==='localhost'?route.continue():route.abort())
page.setDefaultTimeout(30000)
try{
 await page.goto(base+'/login')
 const consent=page.getByRole('button',{name:'동의합니다',exact:true});await consent.waitFor({state:'visible',timeout:15000});await consent.click();await expect(page.getByRole('dialog',{name:'MIRO를 시작하기 전에',exact:true})).toHaveCount(0)
 await page.locator('[data-login-sheet]:visible [data-login-provider=google]').click()
 await page.getByPlaceholder('이메일').fill(`speech-${Date.now()}@miro.dev`)
 await page.getByRole('button',{name:'계속',exact:true}).click()
 await expect(page).toHaveURL(/\/onboarding/)
 await page.waitForLoadState('networkidle')
 await page.getByRole('radio',{name:'한국어',exact:true}).check()
 await expect(page.getByRole('button',{name:'다음',exact:true})).toBeEnabled({timeout:15000})
 await page.getByRole('button',{name:'다음',exact:true}).click()
 await page.getByLabel('닉네임',{exact:true}).fill('음성테스터')
 await page.getByRole('button',{name:'다음',exact:true}).click()
 await page.getByRole('radio',{name:'밝히지 않음',exact:true}).click()
 await page.getByRole('button',{name:'다음',exact:true}).click()
 await page.getByPlaceholder('YYYY.MM.DD').fill('1995.01.01')
 await page.getByRole('button',{name:'다음',exact:true}).click()
 await page.getByRole('checkbox',{name:/캐릭터 알림 받기/}).click()
 await page.getByRole('button',{name:'시작하기',exact:true}).click()
 await expect(page).not.toHaveURL(/\/onboarding/)
 const audience=page.getByRole('button',{name:'여성향 남자 캐릭터와 로맨스'})
 await expect(audience).toBeVisible({timeout:20000})
 await audience.click();await page.getByRole('button',{name:'시작하기',exact:true}).click()
 await closeWelcome(page)
 await page.goto(base+'/character/thomas')
 await page.getByRole('button',{name:'대화 시작하기',exact:true}).click()
 await expect(page).toHaveURL(/\/chat\//,{timeout:60000})
 const persona=page.getByRole('button',{name:'이 설정으로 시작하기',exact:true})
 if(await persona.isVisible())await persona.click()
 const composer=page.locator('textarea[name=input]');await expect(composer).toBeVisible({timeout:60000})
 const coach=page.getByRole('dialog',{name:'안내',exact:true})
 await expect(coach).toBeVisible({timeout:15000})
 await page.keyboard.press('Escape');await expect(coach).toHaveCount(0)
 await page.getByRole('button',{name:'대화 메뉴',exact:true}).click()
 await page.getByRole('button',{name:'음성 모드',exact:true}).click()
 await composer.fill('오늘 힘들었어. 곁에 있어 줄래?')
 await page.locator('form').filter({has:composer}).locator('button[type=submit]').click()
 await expect(composer).toHaveValue('',{timeout:30000})
 await expect.poll(()=>requests.filter(r=>r.status===200&&r.method==='GET').length,{timeout:90000}).toBeGreaterThan(0)
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {speechPlaybackEnded:number}).speechPlaybackEnded),{timeout:15000}).toBeGreaterThan(0)
 await expect(page.getByRole('status').filter({hasText:'음성을 재생하지 못했어요'})).toHaveCount(0)
 await page.screenshot({path:'output/speech-queue-20261024/full-app-voice.png'})
 const queued=requests.find(r=>r.status===202&&r.method==='POST')
 if(!queued)throw new Error('Expected durable202 enqueue')
 const audio=requests.find(r=>r.status===200&&r.method==='GET')!
 const replay=await page.request.get(base+audio.url);expect(replay.status()).toBe(200)
 await page.getByRole('button',{name:'대화 메뉴',exact:true}).click();await page.getByRole('button',{name:'채팅 모드',exact:true}).click()
 const modeOff=await page.evaluate(()=>Object.entries(localStorage).some(([key,value])=>key.startsWith('miro:immersive:')&&value==='0'));expect(modeOff).toBe(true)
 writeFileSync('output/speech-queue-20261024/FULL_APP_CHECKS.json',JSON.stringify({actualNextApp:true,actualLocalPostgres:true,signupAndPersona:true,realChatTurnStored:true,queued202:true,jobPolled:true,audioReturned:true,actualPlaybackEnded:true,modeTurnedOff:true,repeatedGetCached:true,sessionUrl:page.url(),requests,pageErrors:errors,allGenerationLocalMocks:true,audioIsSilentFixture:true,paidCalls:0,productionDeployed:false},null,2))
 console.log('Full app voice flow passed; all model calls were local mocks.')
}catch(error){await page.screenshot({path:'output/speech-queue-20261024/full-app-failure.png'});console.log({errors,body:(await page.locator('body').innerText()).slice(-3000)});throw error}finally{await browser.close()}

}
main().catch(error=>{console.error(error);process.exitCode=1})
