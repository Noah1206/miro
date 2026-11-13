import type { Metadata } from 'next'
import { voicePaused } from '@miro/config'
import { Back, Page, TransitionLink } from '@/components/ui'
import { CHEER_SHARE, CREATOR_REWARD_RATE, VOICE_REWARD_RATE } from '@/lib/usage/creator-reward'
import { PAYOUT_KRW_PER_TOKEN, PAYOUT_MIN_KRW, PAYOUT_OPENS, payoutOpen } from '@/lib/usage/creator-payout'

/**
 * 11/13 제작자 안내(사용자: 제작자에게 조건을 보여 줄 페이지). 숫자는 전부 실제 상수에서 읽는다 — 문구와 지급이 어긋나지 않게.
 * 다른 서비스 이름·비교 수치는 쓰지 않는다(비교 광고). 원문 한국어.
 */
const TITLE = '제작자 안내 | 미로 AI 캐릭터챗'
const pct = (n: number) => `${Math.round(n * 100)}%`
const DESCRIPTION = `미로에서 캐릭터를 만들면 다른 사람이 내 캐릭터와 대화하며 쓴 토큰의 ${pct(CREATOR_REWARD_RATE)}를 받습니다. 등급·독점 조건 없이 첫 작품부터, 수익은 계좌로 출금합니다.`
export const metadata: Metadata = {
  title: { absolute: TITLE }, description: DESCRIPTION, alternates: { canonical: '/creators' },
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: '미로 AI 캐릭터챗', locale: 'ko_KR' },
}

const card: React.CSSProperties = { padding: '18px 16px', borderRadius: 14, background: 'var(--color-surface-2, rgba(255,255,255,.06))' }
const muted: React.CSSProperties = { margin: 0, color: 'var(--color-text-secondary)', lineHeight: 1.65 }

export default function Creators() {
  const opens = PAYOUT_OPENS.replace(/^(\d+)-(\d+)-(\d+)$/, (_, y, m, d) => `${y}년 ${+m}월 ${+d}일`)
  const terms: [string, string, string][] = [
    ['대화 보상', pct(CREATOR_REWARD_RATE), '다른 회원이 내 캐릭터와 대화하며 쓴 토큰 기준. 등급도 독점도 없이 첫 작품부터 같은 비율입니다. 다른 곳에 함께 올린 작품도 같습니다.'],
    ['응원', pct(CHEER_SHARE), '회원이 충전한 토큰으로 응원하면 그만큼을 만든 사람이 받습니다.'],
    ['목소리 보상', pct(VOICE_REWARD_RATE), `내가 녹음해 공개한 목소리로 다른 회원이 답을 들으면 받습니다.${voicePaused() ? ' 음성 기능은 지금 점검 중이라 다시 열리면 적립됩니다.' : ''}`],
  ]
  const points: [string, string][] = [
    ['상품권이 아니라 계좌로', `유료 토큰에서 생긴 보상은 "수익"으로 쌓이고, 1토큰 ${PAYOUT_KRW_PER_TOKEN}원으로 계좌에 출금합니다. ${PAYOUT_MIN_KRW.toLocaleString()}원부터 신청할 수 있고 3.3%를 원천징수합니다.${payoutOpen() ? '' : ` 출금 신청은 ${opens}부터 받습니다(그 전에 쌓인 수익도 그대로 출금 대상).`}`],
    ['어른의 이야기를 막지 않습니다', '성인 인증을 마친 회원이 언베일을 켠 방에서는 수위 때문에 장면이 끊기지 않습니다. 작품을 수위에 맞춰 고쳐 쓰지 않아도 됩니다.'],
    ['다시 받기는 무료', '마음에 안 드는 답을 다시 받아도 토큰이 나가지 않습니다. 회원이 한 작품에 오래 머뭅니다.'],
    ['만들기 도구', '세계관·등장인물·첫 장면·상황별 사진·명령어·엔딩까지 한 화면에서 만들고, 올리기 전에 테스트 채팅으로 확인합니다.'],
  ]
  const lines = ['미성년자이거나 미성년자로 보이는 캐릭터의 성적 묘사', '실존 인물', '다른 사람의 작품·그림을 허락 없이 가져온 것']
  return (
    <Page wide>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--space-2) var(--gutter)' }}><Back href="/home" /></header>
      <div lang="ko" style={{ padding: '0 var(--gutter) var(--space-7)', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <section>
          <h1 className="t-title-1" style={{ margin: '0 0 10px' }}>독점 없이, 첫 작품부터 {pct(CREATOR_REWARD_RATE)}</h1>
          <p style={muted}>미로는 캐릭터를 만든 사람에게 대화 보상을 가장 먼저 돌려줍니다. 채워야 할 등급도, 묶이는 계약도 없습니다.</p>
        </section>
        <section aria-labelledby="c-terms">
          <h2 id="c-terms" className="t-title-3" style={{ margin: '0 0 12px' }}>받는 것</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {terms.map(([name, rate, text]) => (
              <div key={name} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <strong>{name}</strong><strong className="t-title-2" style={{ color: 'var(--color-accent-text)' }}>{rate}</strong>
                </div>
                <p className="t-caption" style={muted}>{text}</p>
              </div>
            ))}
          </div>
          <p className="t-caption" style={{ ...muted, marginTop: 10 }}>무료 토큰(출석·가입 선물)으로 한 대화의 보상은 앱 안에서 쓰는 토큰으로 받습니다. 부정 이용을 막기 위해 하루 상한이 있고, 가입 3일이 안 된 계정·게스트·자기 캐릭터와의 대화는 보상에서 빠집니다. 자세한 조건은 <TransitionLink href="/terms/service" style={{ textDecoration: 'underline' }}>이용약관 제10조의2</TransitionLink>에 있습니다.</p>
        </section>
        <section aria-labelledby="c-why">
          <h2 id="c-why" className="t-title-3" style={{ margin: '0 0 12px' }}>미로에서 만들면</h2>
          <div style={{ display: 'grid', gap: 14 }}>
            {points.map(([h, text]) => <div key={h}><strong>{h}</strong><p className="t-caption" style={{ ...muted, marginTop: 4 }}>{text}</p></div>)}
          </div>
        </section>
        <section aria-labelledby="c-lines">
          <h2 id="c-lines" className="t-title-3" style={{ margin: '0 0 12px' }}>받지 않는 것</h2>
          <ul className="t-caption" style={{ ...muted, paddingLeft: 18 }}>{lines.map(l => <li key={l}>{l}</li>)}</ul>
          <p className="t-caption" style={{ ...muted, marginTop: 8 }}>성인 전용 작품은 본인인증으로 만 19세 이상이 확인된 회원에게만 열립니다.</p>
        </section>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <TransitionLink href="/create" style={{ padding: '14px 22px', borderRadius: 999, background: 'var(--color-accent, #b8a4ff)', color: 'var(--color-accent-on, #1c1630)', fontWeight: 'var(--weight-semibold)' as never }}>캐릭터 만들기</TransitionLink>
          <TransitionLink href="/terms/service" style={{ padding: '14px 22px', borderRadius: 999, background: 'var(--color-surface-2, rgba(255,255,255,.06))', color: 'var(--color-text-primary)' }}>약관 보기</TransitionLink>
        </div>
      </div>
    </Page>
  )
}
