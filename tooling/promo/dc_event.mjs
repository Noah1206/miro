// 디시용 이벤트 배너(가로형·캐릭터·큰 글씨) — node tooling/promo/dc_event.mjs → output/dc/event-haiku-free.png
import { chromium } from '/Users/johyeon-ung/Desktop/Miro/node_modules/.pnpm/playwright@1.49.1/node_modules/playwright/index.mjs'
import { mkdirSync, readFileSync } from 'node:fs'

const OUT = new URL('../../output/dc/', import.meta.url).pathname
const W = 1200, H = 340
// 신탁이 잘못 배달됐습니다 — 성녀, 머리 휘날리며 손짓하는 컷(1248x1824)
// 11/27 배너를 여러 장 만든다 — BANNER=comment 면 댓글 이벤트(나만 보는 그녀 표지), 기본은 창작자 카본 이벤트.
const KIND = process.env.BANNER === 'comment' ? { file: 'event-comment.png', pic: 'official-m-only-me/01.jpg', l1: ['댓글 5개', '쓰면'], l2: ['500토큰', '드려요♡'], work: '나만 보는 그녀', shade: '40,24,8' }
  : { file: 'event-haiku-free.png', pic: 'official-m-oracle-mail/sit-049a.jpg', l1: ['제작자님', '이리 와'], l2: ['Carbon', '공짜야♡'], work: '신탁이 잘못 배달됐습니다', shade: '40,8,24' }
const pic = 'data:image/jpeg;base64,' + readFileSync(`${process.env.HOME}/miro-media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/${KIND.pic}`).toString('base64')

const mark = 'data:image/svg+xml;base64,' + readFileSync(new URL('../../apps/web/public/logo-mark.svg', import.meta.url)).toString('base64')

const html = `<!doctype html><html><head>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
<style>*{margin:0;padding:0}
.b{position:relative;width:${W}px;height:${H}px;overflow:hidden}
.bg{position:absolute;inset:-40px;background:url(${pic}) center 30%/cover;filter:blur(18px) saturate(1.1)}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(${KIND.shade},.62) 0,rgba(${KIND.shade},.4) 45%,rgba(${KIND.shade},0) 70%)}
.pic{position:absolute;right:-24px;top:-30px;width:524px;height:766px;background:url(${pic}) 0 0/100% 100%;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 70px)}
.t{position:absolute;left:40px;font:900 100px/1 'Pretendard';letter-spacing:-6px;white-space:nowrap;
  filter:drop-shadow(0 3px 6px rgba(30,0,15,.55)) drop-shadow(0 0 4px rgba(255,80,160,.35))}
.t span{color:#fff}
.t i{font-style:normal;background:linear-gradient(180deg,#ffe0ef 0,#ff7db8 50%,#f0438f 100%);-webkit-background-clip:text;color:transparent;margin-right:20px}
.l1{top:42px}.l2{top:180px}
.cr{position:absolute;right:28px;top:18px;display:flex;align-items:center;gap:10px;font:600 16px 'Pretendard';color:#fff;text-shadow:0 0 6px rgba(0,0,0,.8)}
.cr.wk{top:auto;bottom:18px}
.cr img{height:22px;filter:drop-shadow(0 0 4px rgba(0,0,0,.6))}.cr b{font:900 22px 'Pretendard';letter-spacing:-1px;margin-left:-4px}
</style></head><body><div class="b"><div class="bg"></div><div class="shade"></div><div class="pic"></div>
<div class="t l1"><i>${KIND.l1[0]}</i><span>${KIND.l1[1]}</span></div>
<div class="t l2"><i>${KIND.l2[0]}</i><span>${KIND.l2[1]}</span></div>
<div class="cr"><img src="${mark}"><b>미로</b></div>
<div class="cr wk">&lt;${KIND.work}&gt;</div>
</div></body></html>`

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 3 })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}${KIND.file}` })
await browser.close()
console.log('done →', OUT)
