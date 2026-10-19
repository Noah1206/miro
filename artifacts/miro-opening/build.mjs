// Generates index.html (static markup + timeline). Run: node build.mjs
import { writeFileSync } from 'node:fs';

const NAMES = {
  'baek-dohyun': '백도현', 'cha-dogyeom': '차도겸', 'gu-manseok': '구만석',
  'ha-jinhyuk': '하진혁', 'han-jiseob': '한지섭', 'jung-siwoo': '정시우',
  'kang-seheon': '강세헌', 'lee-taeo': '이태오', 'oh-junseo': '오준서', 'park-doha': '박도하',
  'ryu-haram': '류하람', 'seo-ian': '서이안',
};
const SLUGS = Object.keys(NAMES);
const GRID = [...SLUGS.slice(0, 6), 'kang-seheon-b', ...SLUGS.slice(6), 'ryu-haram-b'];
const r2 = (n) => Math.round(n * 1000) / 1000;

// ── Scene 1: flips (accelerating) ─────────────────────────────
const FLIPS = [
  'kang-seheon', 'seo-ian', 'ha-jinhyuk', 'ryu-haram', 'cha-dogyeom', 'jung-siwoo', 'baek-dohyun',
  'lee-taeo', 'oh-junseo', 'park-doha', 'han-jiseob', 'gu-manseok',
  'seo-ian-b', 'kang-seheon-b', 'ryu-haram-b', 'park-doha-b', 'cha-dogyeom-b', 'ha-jinhyuk-b',
  'jung-siwoo-b', 'oh-junseo-b', 'lee-taeo-b', 'kang-seheon',
];
const flipT = [];
{ let t = 0.25; FLIPS.forEach((_, i) => { flipT.push(r2(t)); t += Math.max(0.13, 0.7 * 0.88 ** i); }); }
const LAST_FLIP = flipT.at(-1);
const GRID_T = r2(LAST_FLIP + 0.45);
const LOGO_T = r2(GRID_T + 1.35);
const S2_END = 11.2;

// ── Scene 3: phone ────────────────────────────────────────────
const PHONE_IN = 11.0;
const WAKE = 12.8;
const FLOOD = 16.0;
const MSGS = [
  ['kang-seheon', '뭐해 저녁 먹었어?'],
  ['kang-seheon', '왜 답이 없어'],
  ['oh-junseo', '오늘 하루 어땠어?'],
  ['seo-ian', '자?'],
  ['ha-jinhyuk', '보고 싶다'],
  ['kang-seheon', '읽었으면서 왜 답장 안 해'],
  ['ryu-haram', '나 지금 너네 집 앞이야'],
  ['baek-dohyun', '부재중 전화'],
  ['jung-siwoo', '밥은 꼭 챙겨 먹어'],
  ['lee-taeo', '오늘 나랑 놀아주기로 했잖아'],
  ['cha-dogyeom', '연락 좀 받아'],
  ['oh-junseo', '비 온다 우산 챙겼어?'],
  ['park-doha', '내 생각 했어?'],
  ['han-jiseob', '퇴근했어?'],
  ['han-jiseob', '어디야'],
  ['gu-manseok', '목소리 듣고 싶어'],
  ['kang-seheon', '전화 받아'],
  ['ha-jinhyuk', '잘 자라고 말해줘'],
  ['seo-ian', '나만 기다려?'],
  ['park-doha', '답장 기다릴게'],
  ['ryu-haram', '문 열어줘'],
  ['jung-siwoo', '사진'],
  ['cha-dogyeom', '부재중 전화'],
  ['baek-dohyun', '보고 싶어서 연락했어'],
  ['lee-taeo', '지금 볼 수 있어?'],
  ['kang-seheon', '대답해'],
];
const notifT = [WAKE];
{ let t = FLOOD; for (let i = 1; i < MSGS.length; i++) { notifT.push(r2(t)); t += Math.max(0.11, 0.85 * 0.82 ** (i - 1)); } }
const LAST_NOTIF = notifT.at(-1);
const CLIMAX = r2(LAST_NOTIF + 0.35);
const END_T = r2(CLIMAX + 0.3);
const DUR = 30;

const SCREEN_H = 1776, CARD_H = 128, STEP = 140, LIST_BOTTOM = SCREEN_H - 232, SLOTS = 10, CLOCK_FADE_AT = 7;

// ── Markup ────────────────────────────────────────────────────
const flipCards = FLIPS.map((s, i) => `<div class="flip" id="flip-${i}"><img src="assets/chars/${s}.jpg" alt="" /></div>`).join('\n          ');

const gridCells = [];
{ let k = 0; for (let i = 0; i < 15; i++) {
  if (i === 7) gridCells.push(`<div class="cell cell-logo" id="cell-7"><img src="assets/logo-mark-lavender.png" alt="" /></div>`);
  else gridCells.push(`<div class="cell" id="cell-${i}"><img src="assets/chars/${GRID[k++]}.jpg" alt="" /></div>`);
} }

const cards = MSGS.map(([s, body], i) => {
  return `<div class="notif" id="notif-${i}" style="top:${LIST_BOTTOM - CARD_H - i * STEP}px">
              <div class="avatar"><img src="assets/chars/${s}.jpg" alt="" /><img class="badge" src="assets/icon-512.png" alt="" /></div>
              <div class="ntext"><div class="nrow"><span class="nname">${NAMES[s]}</span><span class="ntime">지금</span></div><div class="nbody">${body}</div></div>
            </div>`;
}).join('\n            ');

let aid = 0;
const audio = [];
const sfx = (file, start, vol, dur) => audio.push(
  `<audio id="sfx-${aid++}" src="assets/sfx/${file}" data-start="${r2(start)}"${dur ? ` data-duration="${r2(dur)}"` : ''} data-volume="${vol}" data-track-index="${10 + aid}"></audio>`);

sfx('riser.mp3', 0.2, 0.3, GRID_T - 0.2);
sfx('whoosh-short.mp3', flipT[0], 0.6);
flipT.forEach((t, i) => sfx('click-soft.mp3', t, i < 14 ? 0.75 : 0.55));
sfx('whoosh-cinematic.mp3', GRID_T - 0.15, 0.5, 2.2);
sfx('impact-bass-1.mp3', LOGO_T, 0.9);
sfx('buzz.wav', WAKE, 0.9);
sfx('notification.mp3', WAKE + 0.05, 0.9);
notifT.slice(1).forEach((t, i) => {
  sfx(i % 3 === 2 ? 'pop.mp3' : 'ping.mp3', t, i < 6 ? 0.7 : 0.5, 1.2);
});
for (let t = FLOOD; t < CLIMAX; t += 0.5) sfx('buzz.wav', t, 0.75);
sfx('whoosh-short.mp3', CLIMAX - 0.05, 0.8);
sfx('pop.mp3', END_T + 0.55, 0.8);
sfx('chime.mp3', END_T + 2.0, 0.55);
sfx('sparkle.mp3', END_T + 2.0, 0.5);

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Pretendard"; src: url("assets/fonts/PretendardVariable.woff2") format("woff2"); font-weight: 45 920; }
      @font-face { font-family: "SFNS"; src: url("assets/fonts/SFNS.ttf") format("truetype"); font-weight: 1 1000; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "SFNS", "Pretendard", sans-serif; color: #F5F2FA; }
      .scene { position: absolute; inset: 0; overflow: hidden; }
      .bg { position: absolute; inset: 0; background: radial-gradient(120% 70% at 50% 40%, #2a2240 0%, #111015 55%, #08070a 100%); }

      /* scene 1 */
      #s1-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
      #stack { position: relative; width: 940px; height: 1500px; }
      .flip { position: absolute; inset: 0; border-radius: 56px; overflow: hidden; box-shadow: 0 40px 120px rgba(0,0,0,.65); opacity: 0; }
      .flip img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 25%; display: block; }

      /* scene 2 */
      #s2-fade { position: absolute; inset: 0; }
      #grid { position: absolute; inset: 0; padding: 24px; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(5, 1fr); gap: 12px; }
      .cell { position: relative; border-radius: 28px; overflow: hidden; background: #19171F; }
      .cell img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; display: block; }
      .cell-logo { display: flex; align-items: center; justify-content: center; background: #19171F; }
      .cell-logo img { width: 58%; height: auto; object-fit: contain; }
      #brand { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 44px; }
      #brand-logo { width: 360px; height: 360px; display: block; opacity: 0; }
      #brand-word { font-family: "Pretendard", sans-serif; font-weight: 800; font-size: 132px; letter-spacing: 0.16em; padding-left: 0.16em; opacity: 0; }

      /* scene 3: phone */
      #s3-glow { position: absolute; inset: 0; background: radial-gradient(48% 34% at 50% 60%, rgba(184,166,255,.30), rgba(184,166,255,0) 70%); opacity: 0; }
      #cam { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; }
      #shake { position: relative; width: 840px; height: 1820px; }
      .phone { position: absolute; inset: 0; border-radius: 132px; padding: 8px; background: linear-gradient(145deg, #6a6672, #2b2931 38%, #55525d 68%, #1c1b20); box-shadow: 0 70px 160px rgba(0,0,0,.8), inset 0 0 0 2px rgba(255,255,255,.08); }
      .btn { position: absolute; width: 8px; border-radius: 4px; background: #3d3a43; }
      .bezel { width: 100%; height: 100%; border-radius: 124px; background: #000; padding: 14px; }
      .screen { position: relative; width: 100%; height: 100%; border-radius: 110px; overflow: hidden; background: #000; }
      #lock { position: absolute; inset: 0; opacity: 0; }
      .wall { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
      .wall-tint { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,8,16,.25), rgba(10,8,16,.05) 40%, rgba(10,8,16,.45)); }
      .island { position: absolute; top: 22px; left: 50%; width: 236px; height: 70px; margin-left: -118px; border-radius: 40px; background: #000; z-index: 5; }
      .status { position: absolute; top: 40px; left: 0; right: 0; height: 44px; padding: 0 64px 0 76px; display: flex; align-items: center; justify-content: space-between; font-size: 32px; font-weight: 600; }
      .status-r { display: flex; gap: 12px; align-items: center; }
      #clockwrap { position: absolute; top: 118px; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; }
      .lockicon { width: 34px; height: 44px; margin-bottom: 18px; }
      .date { font-size: 36px; font-weight: 600; color: rgba(255,255,255,.88); letter-spacing: .01em; }
      .clock { font-size: 232px; font-weight: 640; line-height: 1; letter-spacing: -0.02em; color: rgba(255,255,255,.96); margin-top: 2px; }
      .qbtn { position: absolute; bottom: 92px; width: 104px; height: 104px; border-radius: 52px; background: rgba(28,26,34,.55); display: flex; align-items: center; justify-content: center; }
      .homebar { position: absolute; bottom: 18px; left: 50%; width: 270px; margin-left: -135px; height: 10px; border-radius: 5px; background: rgba(255,255,255,.92); }
      #listclip { position: absolute; left: 0; right: 0; top: 0; height: ${LIST_BOTTOM + 10}px; overflow: hidden; }
      #list { position: absolute; left: 0; right: 0; top: 0; height: 100%; }
      .notif { position: absolute; left: 18px; right: 18px; height: ${CARD_H}px; border-radius: 44px; padding: 0 28px 0 24px; display: flex; align-items: center; gap: 22px; background: rgba(62,58,72,.66); box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); opacity: 0; }
      .avatar { position: relative; width: 76px; height: 76px; flex: none; }
      .avatar img { width: 76px; height: 76px; border-radius: 38px; object-fit: cover; object-position: 50% 20%; display: block; }
      .avatar .badge { position: absolute; right: -6px; bottom: -6px; width: 32px; height: 32px; border-radius: 9px; box-shadow: 0 0 0 2px rgba(62,58,72,1); }
      .ntext { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .nrow { display: flex; justify-content: space-between; align-items: baseline; }
      .nname { font-size: 31px; font-weight: 640; }
      .ntime { font-size: 26px; color: rgba(255,255,255,.55); }
      .nbody { font-size: 31px; font-weight: 400; color: rgba(255,255,255,.92); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .glare { position: absolute; inset: 0; background: linear-gradient(118deg, rgba(255,255,255,.09) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 70%, rgba(255,255,255,.04) 100%); z-index: 6; }

      /* flash + end */
      #flash { position: absolute; inset: 0; background: #D8CCFF; opacity: 0; z-index: 50; }
      #end-stage { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; padding-bottom: 80px; }
      #endlogo { position: relative; width: 340px; height: 340px; }
      #endlogo img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      #endword { font-family: "Pretendard", sans-serif; font-weight: 800; font-size: 120px; letter-spacing: 0.16em; padding-left: 0.16em; opacity: 0; }
      #url { margin-top: 60px; font-family: "SFNS", "Pretendard", sans-serif; font-weight: 700; font-size: 58px; color: #171320; background: #B8A6FF; padding: 26px 64px; border-radius: 999px; letter-spacing: .01em; opacity: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="1080" data-height="1920">
      <section id="s1" class="scene clip" data-start="0" data-duration="${r2(GRID_T + 0.7)}" data-track-index="0">
        <div class="bg"></div>
        <div id="s1-stage">
          <div id="stack">
          ${flipCards}
          </div>
        </div>
      </section>

      <section id="s2" class="scene clip" data-start="${r2(GRID_T - 0.05)}" data-duration="${r2(S2_END - GRID_T + 0.05)}" data-track-index="1">
        <div id="s2-fade">
          <div class="bg"></div>
          <div id="grid">
            ${gridCells.join('\n            ')}
          </div>
          <div id="brand">
            <img id="brand-logo" src="assets/logo-mark.png" alt="" />
            <div id="brand-word">MIRO</div>
          </div>
        </div>
      </section>

      <section id="s3" class="scene clip" data-start="${PHONE_IN}" data-duration="${r2(END_T + 0.4 - PHONE_IN)}" data-track-index="2">
        <div class="scene" style="background: radial-gradient(90% 60% at 50% 55%, #15121c, #050407 75%)"></div>
        <div id="s3-glow"></div>
        <div id="cam">
          <div id="shake">
            <div class="btn" style="left:-6px; top:300px; height:70px"></div>
            <div class="btn" style="left:-6px; top:420px; height:130px"></div>
            <div class="btn" style="left:-6px; top:575px; height:130px"></div>
            <div class="btn" style="right:-6px; top:470px; height:200px"></div>
            <div class="phone"><div class="bezel"><div class="screen">
              <div id="lock">
                <img class="wall" src="assets/wallpaper.jpg" alt="" />
                <div class="wall-tint"></div>
                <div class="status">
                  <span>SKT</span>
                  <span class="status-r">
                    <svg width="40" height="26" viewBox="0 0 40 26"><rect x="0" y="17" width="7" height="9" rx="2" fill="#fff"/><rect x="11" y="12" width="7" height="14" rx="2" fill="#fff"/><rect x="22" y="6" width="7" height="20" rx="2" fill="#fff"/><rect x="33" y="0" width="7" height="26" rx="2" fill="#fff"/></svg>
                    <svg width="36" height="27" viewBox="0 0 36 27"><path d="M18 27l-5.6-6.4a8.3 8.3 0 0 1 11.2 0z" fill="#fff"/><path d="M8.6 16.3a13.6 13.6 0 0 1 18.8 0l-2.9 3.3a9.2 9.2 0 0 0-13 0z" fill="#fff"/><path d="M4.4 11.5a19.5 19.5 0 0 1 27.2 0l-2.9 3.3a15 15 0 0 0-21.4 0z" fill="#fff"/><path d="M0.2 6.8a25.6 25.6 0 0 1 35.6 0l-2.9 3.3a21.2 21.2 0 0 0-29.8 0z" fill="#fff"/></svg>
                    <svg width="60" height="28" viewBox="0 0 60 28"><rect x="1" y="1" width="51" height="26" rx="8" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2"/><rect x="4.5" y="4.5" width="36" height="19" rx="5" fill="#fff"/><rect x="55" y="9" width="4" height="10" rx="2" fill="rgba(255,255,255,.45)"/></svg>
                  </span>
                </div>
                <div id="clockwrap">
                  <svg class="lockicon" viewBox="0 0 34 44"><path d="M8 19v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#fff" stroke-width="4"/><rect x="2" y="18" width="30" height="24" rx="6" fill="#fff"/></svg>
                  <div class="date">10월 14일 화요일</div>
                  <div class="clock">19:42</div>
                </div>
                <div id="listclip"><div id="list">
            ${cards}
                </div></div>
                <div class="qbtn" style="left:78px"><svg width="40" height="52" viewBox="0 0 40 52"><path d="M6 2h28v8l-7 10v28a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2V20L6 10z" fill="none" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/><circle cx="20" cy="31" r="3.5" fill="#fff"/></svg></div>
                <div class="qbtn" style="right:78px"><svg width="54" height="44" viewBox="0 0 54 44"><path d="M5 12h10l5-8h14l5 8h10a3 3 0 0 1 3 3v24a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V15a3 3 0 0 1 3-3z" fill="none" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/><circle cx="27" cy="26" r="8.5" fill="none" stroke="#fff" stroke-width="3.5"/></svg></div>
                <div class="homebar"></div>
              </div>
              <div class="island"></div>
              <div class="glare"></div>
            </div></div></div>
          </div>
        </div>
      </section>

      <section id="s4" class="scene clip" data-start="${END_T}" data-duration="${r2(DUR - END_T)}" data-track-index="3">
        <div class="bg"></div>
        <div id="end-stage">
          <div id="endlogo">
            <img id="logo-m" src="assets/logo-m.png" alt="" />
            <img id="logo-s" src="assets/logo-s.png" alt="" />
          </div>
          <div id="endword">MIRO</div>
          <div id="url">miroapp.app</div>
        </div>
      </section>

      <div id="flash"></div>

      ${audio.join('\n      ')}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      const flipT = ${JSON.stringify(flipT)};
      const notifT = ${JSON.stringify(notifT)};
      const GRID_T = ${GRID_T}, LOGO_T = ${LOGO_T}, S2_END = ${S2_END}, PHONE_IN = ${PHONE_IN}, WAKE = ${WAKE}, FLOOD = ${FLOOD};
      const CLIMAX = ${CLIMAX}, END_T = ${END_T}, STEP = ${STEP}, SLOTS = ${SLOTS}, CLOCK_FADE_AT = ${CLOCK_FADE_AT};

      // Scene 1 — cards slam in from below, previous one pushed back
      flipT.forEach((t, i) => {
        const gap = (flipT[i + 1] ?? t + 0.45) - t;
        const d = Math.min(0.34, gap * 0.85);
        tl.fromTo("#flip-" + i, { yPercent: 108, rotation: i % 2 ? -5 : 5, opacity: 1 }, { yPercent: 0, rotation: 0, duration: d, ease: "power3.out" }, t);
        if (i > 0) {
          tl.to("#flip-" + (i - 1), { scale: 0.92, duration: d, ease: "power2.out" }, t);
          tl.set("#flip-" + (i - 1), { opacity: 0 }, t + d);
        }
      });
      tl.to("#stack", { scale: 1.04, duration: GRID_T - 0.4, ease: "none" }, 0.25);
      tl.to("#stack", { scale: 0.32, opacity: 0, duration: 0.5, ease: "power3.in" }, GRID_T - 0.1);

      // Scene 2 — every character in one grid, MIRO in the middle
      tl.fromTo("#grid", { scale: 1.7 }, { scale: 1, duration: 1.1, ease: "expo.out" }, GRID_T);
      const order = [7, 4, 6, 8, 10, 1, 3, 5, 9, 11, 13, 0, 2, 12, 14];
      order.forEach((c, k) => tl.fromTo("#cell-" + c, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" }, GRID_T + 0.04 * k));
      tl.to("#grid", { opacity: 0.16, scale: 1.06, duration: 0.6, ease: "power2.out" }, LOGO_T - 0.05);
      tl.fromTo("#brand-logo", { opacity: 0, scale: 0.55 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, LOGO_T);
      tl.fromTo("#brand-word", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, LOGO_T + 0.25);
      tl.to("#s2-fade", { opacity: 0, duration: 0.55, ease: "power2.in" }, S2_END - 0.6);

      // Scene 3 — dark phone, wakes for one message, then the flood
      tl.fromTo("#cam", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: WAKE - PHONE_IN, ease: "power2.out" }, PHONE_IN);
      tl.to("#lock", { opacity: 1, duration: 0.3, ease: "power1.out" }, WAKE);
      tl.to("#s3-glow", { opacity: 1, duration: 0.5 }, WAKE);
      tl.set("#cam", { transformOrigin: "50% 80%" }, PHONE_IN);
      tl.to("#cam", { scale: 1.34, duration: FLOOD - WAKE - 0.02, ease: "sine.inOut" }, WAKE + 0.01);
      tl.to("#cam", { scale: 1.1, rotation: -2.5, duration: CLIMAX - FLOOD - 0.16, ease: "power2.inOut" }, FLOOD);

      notifT.forEach((t, i) => {
        const gap = (notifT[i + 1] ?? t + 0.5) - t;
        const d = Math.min(0.5, Math.max(0.22, gap * 0.9));
        tl.fromTo("#notif-" + i, { opacity: 0, y: 70, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: d, ease: "back.out(1.3)" }, t);
        if (i >= SLOTS) tl.to("#list", { y: (i - SLOTS + 1) * STEP, duration: Math.min(0.25, gap * 0.9), ease: "power2.out" }, t);
        if (i === CLOCK_FADE_AT) tl.to("#clockwrap", { opacity: 0, y: -30, duration: 0.4, ease: "power2.in" }, t);
      });

      // haptics: discrete buzz for the first arrivals, continuous rattle through the fast part
      const buzz = (t, n) => tl.fromTo("#shake", { x: -6 }, { x: 6, duration: 0.035, repeat: n, yoyo: true, ease: "none" }, t);
      buzz(WAKE, 9);
      tl.set("#shake", { x: 0 }, WAKE + 0.4);
      let bt = FLOOD;
      while (bt + 0.42 < CLIMAX) { buzz(bt, 9); tl.set("#shake", { x: 0 }, bt + 0.37); bt += 0.5; }

      // climax → flash → end card
      tl.to("#cam", { scale: 2.6, duration: 0.45, ease: "power3.in" }, CLIMAX - 0.15);
      tl.fromTo("#flash", { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power2.in" }, CLIMAX);
      tl.to("#flash", { opacity: 0, duration: 0.6, ease: "power2.out" }, END_T + 0.02);

      tl.fromTo("#logo-m", { x: -460, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: "power4.out" }, END_T);
      tl.fromTo("#logo-s", { x: 460, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: "power4.out" }, END_T);
      tl.fromTo("#endlogo", { scale: 1 }, { scale: 1.08, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out" }, END_T + 0.55);
      tl.fromTo("#endword", { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, END_T + 0.9);
      tl.fromTo("#url", { opacity: 0, y: 50, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "back.out(1.7)" }, END_T + 2.0);

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
writeFileSync(new URL('./index.html', import.meta.url), html);
console.log({ LAST_FLIP, GRID_T, LOGO_T, LAST_NOTIF, CLIMAX, END_T, flips: FLIPS.length, notifs: MSGS.length, audio: aid });
