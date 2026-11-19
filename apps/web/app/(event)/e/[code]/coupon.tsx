'use client'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

type Props = {
  code: string; myCode: string | null; invited: boolean
  coupon: { units: number; validDays: number; open: boolean; left: number | null } | null
  referral: { friend: number; me: number; turns: number }
}
const n = (v: number) => v.toLocaleString('ko-KR')

/** 11/18 이벤트 페이지 화면 — 발급받기(코드 복사) → 미로에서 쓰기 / 공유하기. 로그인 없이 동작한다. */
export function EventCoupon({ code, myCode, invited, coupon, referral }: Props) {
  const [issued, setIssued] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(location.origin), [])
  const shareUrl = origin ? (myCode ? `${origin}/r/${myCode}` : `${origin}/e/${encodeURIComponent(code)}`) : ''
  const useHref = `/my/subscription?coupon=${encodeURIComponent(code)}#coupon`

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); return true } catch {
      // 클립보드를 막은 브라우저 — 숨긴 입력칸으로 한 번 더
      try { const el = document.createElement('textarea'); el.value = text; el.style.position = 'fixed'; el.style.opacity = '0'; document.body.appendChild(el); el.select(); const ok = document.execCommand('copy'); el.remove(); return ok } catch { return false }
    }
  }
  const issue = async () => { setIssued(true); setCopied(await copyText(code)) }
  const share = async () => {
    const data = { title: '미로 — 음성 캐릭터챗', text: '캐릭터 대사를 목소리로 듣는 미로! 이 링크로 들어오면 무료 토큰을 받아요.', url: shareUrl }
    try {
      if (navigator.share) { await navigator.share(data); return }
    } catch { return /* 공유 창을 닫음 */ }
    setShared((await copyText(shareUrl)) ? '공유 링크를 복사했어요' : null)
  }

  const closed = !coupon || !coupon.open
  return (
    <main style={{ minHeight: '100dvh', background: '#16141f', color: '#fff', display: 'flex', justifyContent: 'center', padding: '24px 16px 48px', fontFamily: 'inherit' }}>
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/events/open-event.webp" alt="미로 오픈 이벤트 — 무료 토큰 쿠폰과 친구 추천" width={1200} height={630}
          style={{ width: '100%', height: 'auto', borderRadius: 18, display: 'block' }} />

        <section style={card}>
          {invited && <p style={{ ...small, color: '#c9b8ff', margin: 0 }}>친구 초대로 왔어요 — 가입하면 추천 선물 <span style={nowrap}>{n(referral.friend)} 토큰</span>을 자동으로 받아요.</p>}
          <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.3 }}>
            {coupon ? <>무료 <span style={{ color: '#b9a4ff' }}>{n(coupon.units)} 토큰</span> 쿠폰</> : '이벤트를 찾을 수 없어요'}
          </h1>
          {coupon && <p style={{ ...small, margin: 0 }}>
            {closed ? '이벤트가 끝났어요.' : `${coupon.left !== null ? `선착순 · 남은 수량 ${n(coupon.left)} · ` : '한 사람당 한 번 · '}받은 뒤 ${coupon.validDays}일 동안 사용`}
          </p>}

          {!issued
            ? <button type="button" onClick={() => void issue()} disabled={closed} style={{ ...primary, opacity: closed ? 0.45 : 1 }}>쿠폰 발급받기</button>
            : <button type="button" onClick={() => void issue()} style={codeBox} aria-label="쿠폰 코드 다시 복사">
                <span style={{ fontSize: 13, color: '#a9a3c2' }}>쿠폰 코드</span>
                <strong style={{ fontSize: 24, letterSpacing: '.12em' }}>{code}</strong>
                <span style={{ fontSize: 13, color: copied ? '#8ee6a8' : '#a9a3c2' }}>{copied ? '복사됐어요 ✓' : '눌러서 복사'}</span>
              </button>}

          {/* 11/18 사용자: 쓰러 가기·공유하기는 발급받기를 누른 뒤에만 — 밑으로 자연스럽게 펼쳐진다. */}
          <AnimatePresence initial={false}>
            {issued && <motion.div key="next" initial={{ height: 0, opacity: 0, y: -8 }} animate={{ height: 'auto', opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={useHref} style={{ ...primary, flex: 1, textDecoration: 'none', textAlign: 'center' }}>미로에서 쓰러 가기</a>
                  <button type="button" onClick={() => void share()} disabled={!shareUrl} style={{ ...primary, flex: '0 0 auto', padding: '0 18px', background: '#2a2638', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShareIcon /> 공유하기
                  </button>
                </div>
                {shared && <p role="status" style={{ ...small, margin: 0, color: '#8ee6a8' }}>{shared}</p>}
                <p style={{ ...small, margin: 0 }}>미로에서 프로필 → 쿠폰·추천인 코드 칸에 붙여 넣으면 바로 들어와요.</p>
              </div>
            </motion.div>}
          </AnimatePresence>
        </section>

        <section style={{ ...card, gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>친구도 나도 토큰 받기</h2>
          <p style={{ ...small, margin: 0 }}>
            {myCode ? '공유하기를 누르면 내 초대 링크가 나가요.' : '로그인하고 공유하면 내 초대 링크가 나가요.'}<br />
            친구가 그 링크로 가입하면 친구는 <span style={nowrap}>{n(referral.friend)} 토큰</span>,<br />
            친구가 대화를 <span style={nowrap}>{referral.turns}턴</span> 하면 나는 <span style={nowrap}>{n(referral.me)} 토큰</span>을 받아요.
          </p>
          {myCode && <p style={{ ...small, margin: 0 }}>내 추천인 코드 <strong style={{ color: '#fff', letterSpacing: '.08em' }}>{myCode}</strong></p>}
        </section>

        <a href="/home" style={{ ...small, textAlign: 'center', color: '#a9a3c2' }}>miroapp.app 둘러보기</a>
      </div>
    </main>
  )
}

const card: React.CSSProperties = { background: '#211d2e', borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }
// 11/18 한국어는 낱말 중간에서 끊지 않는다(keep-all), 숫자와 단위는 한 줄에(nowrap).
const small: React.CSSProperties = { fontSize: 14, lineHeight: 1.55, color: '#a9a3c2', wordBreak: 'keep-all' }
const nowrap: React.CSSProperties = { whiteSpace: 'nowrap' }
const primary: React.CSSProperties = { height: 52, border: 0, borderRadius: 12, background: '#7b5cff', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }
const codeBox: React.CSSProperties = { border: '1.5px dashed #7b5cff', borderRadius: 12, background: '#1a1726', color: '#fff', padding: '14px 12px', cursor: 'pointer',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontFamily: 'inherit' }

function ShareIcon() {
  return <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
}
