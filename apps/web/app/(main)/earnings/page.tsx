import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { Back, ButtonLink, Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { earningsHistory, PAYOUT_KRW_PER_TOKEN, withdrawableTokens } from '@/lib/usage/creator-payout'
import styles from './earnings.module.css'

/**
 * 11/11 수익 지갑 — 창작 보상(유료 몫)·받은 응원이 일반 지갑과 따로 쌓인다.
 * 크리에이터가 '지갑으로 옮기기'(단방향, 토스 이체식)로 앱에서 쓰거나 '출금 신청'으로 현금으로 받는다.
 */
export default async function EarningsPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const t = await getT()
  const [balance, history] = await Promise.all([withdrawableTokens(user.id), earningsHistory(user.id)])
  return (
    <Page>
      <header className={styles.header}><Back href="/my/characters" /><h1>{t('수익')}</h1></header>
      <section className={styles.card}>
        <span className={styles.caption}>{t('수익 잔액')}</span>
        <strong className={styles.balance}>{balance.toLocaleString('ko-KR')} <small>{t('토큰')}</small></strong>
        <span className={styles.caption}>≈ {t('{n}원', { n: (balance * PAYOUT_KRW_PER_TOKEN).toLocaleString('ko-KR') })}</span>
        <div className={styles.actions}>
          <ButtonLink href="/earnings/transfer" variant="primary" full>{t('지갑으로 옮기기')}</ButtonLink>
          <ButtonLink href="/earnings/payout" full>{t('출금 신청')}</ButtonLink>
        </div>
        <p className={styles.caption} style={{ marginTop: 12, lineHeight: 1.6 }}>
          {t('다른 사람이 충전한 토큰으로 내 캐릭터와 대화하면 생긴 보상과 받은 응원이 여기에 쌓여요. 대화에 자동으로 쓰이지 않아요.')}<br />
          {t('지갑으로 옮긴 토큰은 대화 등에 쓸 수 있지만 다시 수익으로 돌아오지 않고 출금할 수 없어요.')}
        </p>
      </section>
      <section aria-label={t('수익 내역')} className={styles.history}>
        <h2>{t('수익 내역')}</h2>
        {history.length === 0 ? <p className={styles.caption}>{t('아직 내역이 없어요.')}</p> : (
          <ul>
            {history.map(h => (
              <li key={h.id}>
                <span><b>{t(h.label)}</b><small>{h.at.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' })}</small></span>
                <strong data-sign={h.amount > 0 ? 'plus' : 'minus'}>{h.amount > 0 ? '+' : ''}{h.amount.toLocaleString('ko-KR')}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  )
}
