import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { Back, Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { myPayouts, PAYOUT_KRW_PER_TOKEN, PAYOUT_MIN_KRW, payoutOpen, withdrawableTokens } from '@/lib/usage/creator-payout'
import { PayoutForm } from './form'

const STATUS: Record<string, string> = { requested: '송금 대기', paid: '송금 완료', rejected: '반려' }

/** 11/11 창작 보상 출금 신청 — 내 캐릭터 화면의 창작 보상 칸에서 들어온다. */
export default async function PayoutPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const t = await getT()
  const [w, history] = await Promise.all([withdrawableTokens(user.id), myPayouts(user.id)])
  const won = (n: number) => t('{n}원', { n: n.toLocaleString('ko-KR') })
  return (
    <Page>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><Back href="/my/characters" /><h1 style={{ fontSize: 18, margin: 0 }}>{t('출금 신청')}</h1></header>
      <section style={{ padding: '16px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', marginBottom: 16 }}>
        <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('출금할 수 있는 토큰')}</span>
        <strong style={{ display: 'block', fontSize: 22, margin: '2px 0' }}>{w.withdrawable.toLocaleString('ko-KR')} <small style={{ fontSize: 14, fontWeight: 500 }}>≈ {won(w.withdrawable * PAYOUT_KRW_PER_TOKEN)}</small></strong>
        <p className="t-caption" style={{ color: 'var(--color-text-secondary)', margin: '6px 0 0', lineHeight: 1.6 }}>
          {t('1토큰 = {rate}원 · {min} 이상부터 신청할 수 있어요.', { rate: PAYOUT_KRW_PER_TOKEN, min: won(PAYOUT_MIN_KRW) })}<br />
          {t('유료로 충전한 토큰으로 생긴 보상과 받은 응원만 출금돼요. 출석·가입 선물 같은 무료 토큰으로 생긴 보상은 앱 안에서 쓸 수 있어요.')}<br />
          {t('사업소득 3.3%(소득세 3%·지방소득세 0.3%)를 원천징수한 뒤 보내 드려요.')}
        </p>
      </section>
      {!payoutOpen() ? <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('출금 신청은 12월 11일부터 받아요(개인정보 처리방침 개정 시행일).')}</p> : <PayoutForm withdrawable={w.withdrawable} krwPerToken={PAYOUT_KRW_PER_TOKEN} minTokens={Math.ceil(PAYOUT_MIN_KRW / PAYOUT_KRW_PER_TOKEN)} />}
      {history.length > 0 && (
        <section aria-label={t('신청 내역')} style={{ marginTop: 24 }}>
          <strong className="t-caption" style={{ display: 'block', color: 'var(--color-text-secondary)', marginBottom: 8 }}>{t('신청 내역')}</strong>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {history.map(h => (
              <li key={h.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 14 }}>
                <span className="t-caption" style={{ color: 'var(--color-text-secondary)', minWidth: 76 }}>{h.createdAt.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
                <span style={{ flex: 1 }}>{t('{n} 토큰', { n: h.tokens.toLocaleString('ko-KR') })} · {won(h.netKRW)}{h.status === 'rejected' && h.note ? ` — ${h.note}` : ''}</span>
                <strong style={{ fontSize: 13 }}>{t(STATUS[h.status] ?? h.status)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  )
}
