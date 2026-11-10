'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Back, Button } from '@/components/ui'
import { useWallet } from '@/components/wallet/provider'
import { useT } from '@/lib/i18n/client'
import { moveToWallet } from './actions'
import styles from './transfer.module.css'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const
const n = (v: number) => v.toLocaleString('ko-KR')

/**
 * 토스 이체 UX 그대로: ① 큰 금액 + 숫자 키패드(빠른 금액·전액) ② "옮길까요?" 확인 ③ 체크 애니메이션 완료.
 * 받는 곳은 '내 미로 지갑' 하나뿐이라 받는 사람 고르는 단계는 없다.
 */
export function TransferFlow({ balance }: { balance: number }) {
  const t = useT()
  const router = useRouter()
  const { refreshBalance } = useWallet()
  const [step, setStep] = useState<'amount' | 'confirm' | 'done'>('amount')
  const [amount, setAmount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wallet, setWallet] = useState(0)
  const [requestId] = useState(() => crypto.randomUUID())
  const over = amount > balance
  const ok = amount > 0 && !over

  const press = (k: typeof KEYS[number]) => setAmount(a => {
    if (k === 'back') return Math.floor(a / 10)
    const next = Number(`${a || ''}${k}`)
    return next > 99_999_999 ? a : next
  })
  // 데스크톱에선 키보드 숫자도 받는다.
  useEffect(() => {
    if (step !== 'amount') return
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as typeof KEYS[number])
      else if (e.key === 'Backspace') press('back')
      else if (e.key === 'Enter' && ok) setStep('confirm')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, ok])

  async function submit() {
    setBusy(true); setError(null)
    try {
      const r = await moveToWallet(amount, requestId)
      if (!r.ok) { setError(r.reason === 'over' ? t('수익 잔액이 부족해요.') : t('다시 시도해 주세요.')); return }
      setWallet(r.wallet); setStep('done'); void refreshBalance(true)
    } catch { setError(t('다시 시도해 주세요.')) }
    finally { setBusy(false) }
  }

  if (step === 'done') return (
    <div className={styles.screen}>
      <div className={styles.doneBody}>
        <span className={styles.check} aria-hidden><svg viewBox="0 0 52 52"><path d="M14 27l8 8 16-17" /></svg></span>
        <h1 className={styles.doneTitle}>{t('내 미로 지갑으로')}<br />{t('{n}토큰을 옮겼어요', { n: n(amount) })}</h1>
        <p className={styles.sub}>{t('지갑 잔액 {n}토큰', { n: n(wallet) })}</p>
      </div>
      <div className={styles.footer}>
        <Button variant="primary" full size="lg" onClick={() => { router.push('/earnings'); router.refresh() }}>{t('확인')}</Button>
      </div>
    </div>
  )

  if (step === 'confirm') return (
    <div className={styles.screen}>
      <div className={styles.top}><button type="button" className={styles.backBtn} onClick={() => setStep('amount')} aria-label={t('뒤로')}>‹</button></div>
      <div className={styles.confirmBody}>
        <span className={styles.walletIcon} aria-hidden><img src="/miro-token.svg" alt="" width={36} height={36} /></span>
        <h1 className={styles.confirmTitle}>{t('내 미로 지갑으로')}<br /><b>{t('{n}토큰을', { n: n(amount) })}</b><br />{t('옮길까요?')}</h1>
        <dl className={styles.details}>
          <div><dt>{t('보내는 곳')}</dt><dd>{t('수익')}</dd></div>
          <div><dt>{t('받는 곳')}</dt><dd>{t('미로 지갑')}</dd></div>
          <div><dt>{t('옮긴 뒤 수익 잔액')}</dt><dd>{t('{n}토큰', { n: n(balance - amount) })}</dd></div>
        </dl>
        <p className={styles.warn}>{t('지갑으로 옮긴 토큰은 다시 수익으로 돌아오지 않고 출금할 수 없어요.')}</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
      <div className={styles.footer} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
        <Button size="lg" full onClick={() => setStep('amount')} disabled={busy}>{t('취소')}</Button>
        <Button variant="primary" size="lg" full onClick={() => void submit()} status={busy ? 'loading' : 'idle'}>{t('옮기기')}</Button>
      </div>
    </div>
  )

  return (
    <div className={styles.screen}>
      <div className={styles.top}><Back href="/earnings" /></div>
      <div className={styles.amountBody}>
        <p className={styles.to}>{t('내 미로 지갑으로')}</p>
        <p className={`${styles.amount} ${amount ? '' : styles.placeholder} ${over ? styles.shake : ''}`} aria-live="polite">
          {amount ? t('{n}토큰', { n: n(amount) }) : t('얼마나 옮길까요?')}
        </p>
        {over
          ? <p className={styles.error}>{t('수익 잔액이 부족해요.')}</p>
          : <button type="button" className={styles.maxChip} onClick={() => setAmount(balance)}>{t('수익 잔액 {n}토큰', { n: n(balance) })} · {t('전액')}</button>}
      </div>
      <div className={styles.bottom}>
        <div className={styles.quick}>
          {[100, 1000, 5000].map(q => <button key={q} type="button" onClick={() => setAmount(a => Math.min(99_999_999, a + q))}>+{n(q)}</button>)}
          <button type="button" onClick={() => setAmount(balance)}>{t('전액')}</button>
        </div>
        {ok && <div className={styles.cta}><Button variant="primary" full size="lg" onClick={() => setStep('confirm')}>{t('다음')}</Button></div>}
        <div className={styles.keypad}>
          {KEYS.map(k => <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'back' ? t('지우기') : k}>{k === 'back' ? '⌫' : k}</button>)}
        </div>
      </div>
    </div>
  )
}
