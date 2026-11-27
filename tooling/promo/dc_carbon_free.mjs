// 디시용 이식 이벤트 그림(라벤더 띠 배경 + 굵은 글씨 + 알약 버튼) — node tooling/promo/dc_carbon_free.mjs → output/dc/carbon-free.png
import { chromium } from '/Users/johyeon-ung/Desktop/Miro/node_modules/.pnpm/playwright@1.49.1/node_modules/playwright/index.mjs'
import { mkdirSync, readFileSync } from 'node:fs'

const OUT = new URL('../../output/dc/', import.meta.url).pathname
// 11/27 같은 디자인으로 홈 배너도 만든다 — BANNER=home-carbon | home-comment (1200x400 = 3:1, 버튼 없음). 기본은 디시용 큰 그림.
const KIND = { 'home-carbon': { file: 'home-carbon.png', k: '내 캐릭터 그대로 · 이식 이벤트', h: '<em>Carbon</em> 100% 무료!' },
  'home-comment': { file: 'home-comment.png', k: '서로 다른 작품에 · 댓글 이벤트', h: '<em>댓글 5개</em> 쓰면 500토큰!' } }[process.env.BANNER ?? '']
const W = 1200, H = KIND ? 400 : 680
const mark = 'data:image/svg+xml;base64,' + readFileSync(new URL('../../apps/web/public/logo-mark.svg', import.meta.url)).toString('base64')
const tape = (top, rot, dark) => `<div class="tape${dark ? ' dk' : ''}" style="top:${top}px;transform:rotate(${rot}deg)">${`<span><img src="${mark}"><b>MIRO</b></span>`.repeat(14)}</div>`

const html = `<!doctype html><html><head>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Jua&display=block" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}
.b{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:linear-gradient(160deg,#b9a5ff 0%,#9a80f7 45%,#7d5fe6 100%);font-family:'Pretendard'}
.cur{position:absolute;inset:0;background:radial-gradient(circle at 18% 22%,rgba(255,255,255,.28) 0,rgba(255,255,255,0) 26%),radial-gradient(circle at 84% 78%,rgba(255,190,230,.26) 0,rgba(255,190,230,0) 30%),radial-gradient(circle at 80% 12%,rgba(120,220,255,.16) 0,rgba(120,220,255,0) 24%)}
.spot{position:absolute;left:50%;top:50%;width:1500px;height:1500px;margin:-750px 0 0 -750px;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.07) 0 6deg,rgba(255,255,255,0) 6deg 18deg);-webkit-mask-image:radial-gradient(circle,#000 0,transparent 62%)}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse 80% 80% at 50% 50%,rgba(0,0,0,0) 62%,rgba(60,30,130,.28) 100%)}
.dot{position:absolute;border-radius:50%}
.tape{position:absolute;left:-200px;width:${W + 400}px;height:56px;display:flex;align-items:center;gap:44px;padding-left:20px;background:#fff;white-space:nowrap;box-shadow:0 6px 18px rgba(60,30,130,.28)}
.tape.dk{background:#2a1c52}
.tape span{display:flex;align-items:center;gap:10px;font:900 30px 'Pretendard';letter-spacing:-1px;color:#6a48d8}
.tape.dk span{color:#c9b8ff}
.tape img{height:26px;filter:brightness(0) saturate(100%) invert(33%) sepia(60%) saturate(2600%) hue-rotate(238deg) brightness(92%)}
.tape.dk img{filter:brightness(0) saturate(100%) invert(62%) sepia(60%) saturate(1800%) hue-rotate(215deg) brightness(104%)}
.c{position:absolute;inset:18px 0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#fff;text-align:center}
.s{font:800 34px 'Pretendard';letter-spacing:-1.5px;text-shadow:0 3px 10px rgba(30,10,70,.6)}
.h{font:900 96px/1 'Pretendard';letter-spacing:-5px;white-space:nowrap;-webkit-text-stroke:2px rgba(40,16,90,.25);text-shadow:0 8px 0 rgba(48,24,110,.55),0 14px 28px rgba(20,6,50,.5)}
.h em{font-style:normal;color:#f3ecff}
.p{margin-top:18px;padding:16px 46px;border-radius:999px;font:800 36px 'Pretendard';letter-spacing:-1px;background:#1b1230;color:#e6dcff;box-shadow:0 0 0 3px rgba(190,170,255,.55),0 8px 22px rgba(20,6,50,.5)}
.k{font:400 34px 'Jua';letter-spacing:6px;color:#efe7ff;text-shadow:0 2px 8px rgba(30,10,70,.6)}
.t{font:400 104px/1 'Jua';letter-spacing:2px;color:#fff;text-shadow:0 5px 0 rgba(48,24,110,.5),0 10px 24px rgba(20,6,50,.45);margin:-4px 0 6px}
.sp{position:absolute;color:#fff;opacity:.92;filter:drop-shadow(0 2px 6px rgba(30,10,70,.5))}
.hr{position:absolute;color:#ffb3d9;filter:drop-shadow(0 2px 6px rgba(30,10,70,.5))}
.hb{inset:0 !important;gap:10px !important}.hb .k{font-size:40px;letter-spacing:3px}.hb .h{font-size:104px}
.n{position:absolute;left:0;right:0;bottom:104px;font:600 21px 'Pretendard';color:rgba(255,255,255,.88);text-align:center;text-shadow:0 2px 6px rgba(20,6,50,.7)}
</style></head><body><div class="b"><div class="cur"></div><div class="spot"></div>
${KIND ? tape(-30, -2.5, false) + tape(H - 26, -2.5, true) : tape(-6, -4, true) + tape(46, 3, false) + tape(H - 112, 3, false) + tape(H - 58, -4, true)}
<div class="vig"></div><i class="dot" style="left:441px;top:364px;width:10px;height:10px;background:#bfe9ff;opacity:0.5"></i><i class="dot" style="left:973px;top:409px;width:8px;height:8px;background:#bfe9ff;opacity:0.5"></i><i class="dot" style="left:633px;top:237px;width:14px;height:14px;background:#ffd0e8;opacity:0.7"></i><i class="dot" style="left:519px;top:151px;width:6px;height:6px;background:#d9ccff;opacity:0.7"></i><i class="dot" style="left:1033px;top:558px;width:6px;height:6px;background:#d9ccff;opacity:0.7"></i><i class="dot" style="left:939px;top:257px;width:6px;height:6px;background:#ffffff;opacity:0.35"></i><i class="dot" style="left:1068px;top:324px;width:10px;height:10px;background:#ffd0e8;opacity:0.5"></i><i class="dot" style="left:331px;top:360px;width:6px;height:6px;background:#bfe9ff;opacity:0.35"></i><i class="dot" style="left:178px;top:501px;width:8px;height:8px;background:#d9ccff;opacity:0.5"></i><i class="dot" style="left:737px;top:414px;width:6px;height:6px;background:#bfe9ff;opacity:0.7"></i><i class="dot" style="left:954px;top:145px;width:6px;height:6px;background:#ffffff;opacity:0.5"></i><i class="dot" style="left:990px;top:466px;width:14px;height:14px;background:#ffffff;opacity:0.35"></i><i class="dot" style="left:654px;top:441px;width:14px;height:14px;background:#bfe9ff;opacity:0.5"></i><i class="dot" style="left:810px;top:564px;width:6px;height:6px;background:#d9ccff;opacity:0.35"></i><i class="dot" style="left:965px;top:291px;width:8px;height:8px;background:#ffd0e8;opacity:0.7"></i><i class="dot" style="left:259px;top:362px;width:6px;height:6px;background:#ffffff;opacity:0.35"></i><i class="dot" style="left:608px;top:176px;width:14px;height:14px;background:#ffd0e8;opacity:0.5"></i><i class="dot" style="left:820px;top:556px;width:6px;height:6px;background:#bfe9ff;opacity:0.35"></i><i class="dot" style="left:360px;top:339px;width:6px;height:6px;background:#bfe9ff;opacity:0.7"></i><i class="dot" style="left:589px;top:562px;width:8px;height:8px;background:#ffd0e8;opacity:0.5"></i><i class="dot" style="left:1146px;top:252px;width:6px;height:6px;background:#bfe9ff;opacity:0.5"></i><i class="dot" style="left:799px;top:228px;width:14px;height:14px;background:#ffd0e8;opacity:0.35"></i><i class="dot" style="left:380px;top:187px;width:6px;height:6px;background:#ffd0e8;opacity:0.7"></i><i class="dot" style="left:497px;top:116px;width:8px;height:8px;background:#bfe9ff;opacity:0.7"></i><i class="dot" style="left:393px;top:244px;width:6px;height:6px;background:#d9ccff;opacity:0.35"></i><i class="dot" style="left:318px;top:324px;width:8px;height:8px;background:#d9ccff;opacity:0.7"></i><i class="dot" style="left:1179px;top:273px;width:10px;height:10px;background:#ffd0e8;opacity:0.7"></i><i class="dot" style="left:1075px;top:426px;width:14px;height:14px;background:#ffffff;opacity:0.5"></i><i class="dot" style="left:1165px;top:310px;width:8px;height:8px;background:#bfe9ff;opacity:0.5"></i><i class="dot" style="left:827px;top:163px;width:6px;height:6px;background:#bfe9ff;opacity:0.7"></i><i class="dot" style="left:840px;top:141px;width:10px;height:10px;background:#ffd0e8;opacity:0.35"></i><i class="dot" style="left:447px;top:335px;width:8px;height:8px;background:#ffd0e8;opacity:0.35"></i><i class="dot" style="left:716px;top:417px;width:6px;height:6px;background:#ffffff;opacity:0.35"></i><i class="dot" style="left:20px;top:400px;width:8px;height:8px;background:#ffd0e8;opacity:0.7"></i><i class="dot" style="left:227px;top:296px;width:10px;height:10px;background:#ffffff;opacity:0.35"></i><i class="dot" style="left:445px;top:424px;width:6px;height:6px;background:#bfe9ff;opacity:0.35"></i><i class="dot" style="left:536px;top:287px;width:6px;height:6px;background:#d9ccff;opacity:0.5"></i><i class="dot" style="left:271px;top:169px;width:6px;height:6px;background:#bfe9ff;opacity:0.5"></i><svg class="sp" style="left:250px;top:170px" width="44" height="44" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12Z"/></svg><svg class="sp" style="left:905px;top:150px" width="56" height="56" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12Z"/></svg><svg class="sp" style="left:200px;top:330px" width="26" height="26" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12Z"/></svg><svg class="sp" style="left:985px;top:330px" width="30" height="30" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12Z"/></svg><svg class="hr" style="left:300px;top:250px" width="30" height="30" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.800-8 11-8 11Z"/></svg><svg class="hr" style="left:880px;top:260px" width="26" height="26" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.800-8 11-8 11Z"/></svg><svg class="sp" style="left:330px;top:470px" width="22" height="22" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12Z"/></svg><svg class="sp" style="left:860px;top:480px" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12Z"/></svg>
${KIND ? `<style>.sp,.hr{display:none}.sp.on,.hr.on{display:block}</style><svg class="sp on" style="left:70px;top:96px" width="40" height="40" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12Z"/></svg><svg class="sp on" style="left:1085px;top:84px" width="48" height="48" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12Z"/></svg><svg class="sp on" style="left:40px;top:210px" width="22" height="22" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12Z"/></svg><svg class="sp on" style="left:1140px;top:214px" width="26" height="26" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12Z"/></svg><svg class="hr on" style="left:96px;top:190px" width="26" height="26" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11Z"/></svg><svg class="hr on" style="left:1060px;top:180px" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11Z"/></svg><div class="c hb"><div class="k">${KIND.k}</div><div class="h">${KIND.h}</div></div>` : `<div class="c">
  <div class="k">내 캐릭터 그대로</div>
  <div class="t">이식 이벤트</div>
  <div class="s">미로에 캐릭터 이식하면</div>
  <div class="h"><em>Carbon</em> 100% 무료!</div>
  <div class="p">미로에 이식하러 가기 »</div>
</div>
`}
<div class="n"></div>
</div></body></html>`

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: KIND ? 3 : 2 })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}${KIND?.file ?? 'carbon-free.png'}` })
await browser.close()
console.log('done →', OUT + 'carbon-free.png')
