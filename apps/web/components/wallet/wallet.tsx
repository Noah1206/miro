'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Button, Card, Notice, Sheet } from '@/components/ui'
import { readWalletHistory } from '@/app/(main)/recharge/wallet-actions'
import { tween } from '@/lib/motion/tokens'
import { COPY } from '@/lib/copy'
import type { WalletEntry, WalletSnapshot } from '@/lib/wallet/types'
import { HelpToggle, useWallet } from './provider'
import styles from './wallet.module.css'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'

export function Wallet({ initial, children, showOrder = false }: { initial: WalletSnapshot; children?: ReactNode; showOrder?: boolean }) {
  const { wallet, sync, openRecharge, busy } = useWallet()
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const [historyOpen, setHistoryOpen] = useState(false)
  const [entries, setEntries] = useState<WalletEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [help, setHelp] = useState(false)
  useEffect(() => { sync(initial) }, [initial, sync])
  // Legacy server actions can still return to /recharge?order=created.
  useEffect(() => { if (showOrder) openRecharge() }, [])
  const value = wallet ?? initial

  async function loadHistory(more = false) {
    if (loading) return
    setLoading(true); setError(false); setHistoryOpen(true)
    try {
      const next = await readWalletHistory(more ? cursor ?? undefined : undefined)
      setEntries(previous => more ? [...previous, ...next.entries] : next.entries); setCursor(next.cursor)
    } catch { setError(true) }
    finally { setLoading(false) }
  }
  return <div className={styles.stack}>
    {/* 잔액 카드는 안쪽 여백을 한 단계 줄여 라벨·?·버튼이 모서리 가까이 붙는다. */}
    <Card style={{ padding: 'var(--space-4)' }}>
      <div className={styles.balanceLine}><p className={`t-caption ${styles.muted}`}>{t('충전 잔액')}</p><HelpToggle open={help} onToggle={() => setHelp(v => !v)} controls="wallet-help" /></div>
      <motion.p key={value.rechargeRemaining} className={`t-title-1 ${styles.amount}`} data-recharge-balance={value.rechargeRemaining}
        initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} transition={tween.fast} aria-live="polite" aria-atomic>
        {value.rechargeRemaining.toLocaleString(locale)} <span className="t-body">{t('크레딧')}</span>
      </motion.p>
      <Button full variant="primary" onClick={openRecharge} status={busy ? 'loading' : 'idle'} style={{ marginTop: 'var(--space-5)' }}>{t('충전하기')}</Button>
      {help && <div id="wallet-help" className={styles.help} style={{ marginTop: 'var(--space-3)' }}>
        <p className={`t-caption ${styles.muted}`}>{t('월간 제공량을 먼저 쓰고, 부족한 만큼 충전 잔액에서 사용해요. 충전은 계좌이체로 받고, 입금이 확인되면 지급해요.')}</p>
        <ul className={styles.terms} data-refund-terms>{[COPY.refund.recharge, COPY.refund.failure, COPY.refund.how].map(line => <li key={line}>{t(line)}</li>)}</ul>
      </div>}
    </Card>
    <div className={styles.balanceLine}>
      <span data-usage-remaining={value.monthlyRemaining}>{t('이번 달 남은 제공량 · {n}', { n: value.monthlyRemaining.toLocaleString(locale) })}</span>
    </div>
    {value.monthlyRemaining === 0 && <Notice data-usage-spent>{t('MIRO 기본 대화는 계속 이어갈 수 있어요.')}</Notice>}
    {value.order && !value.order.settledAt && ['awaiting', 'approved'].includes(value.order.status) && <Button full onClick={openRecharge}>
      {value.order.status === 'approved' ? t('입금 확인 · 지급 대기') : t('입금 대기 중')} · {t('안내 보기')}
    </Button>}
    <section aria-labelledby="wallet-history-title" className={styles.list}>
      <div className={styles.balanceLine}>
        <h2 id="wallet-history-title" className="t-title-3">{t('최근 내역')}</h2>
        <Button variant="ghost" size="sm" onClick={() => void loadHistory()}>{t('전체 내역')}</Button>
      </div>
      <HistoryRows entries={value.history.entries} />
    </section>
    {children}
    <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title={t('Miro Pay 전체 내역')}>
      {error && <Notice tone="danger" role="alert">{t('내역을 불러오지 못했어요. 다시 시도해 주세요.')}</Notice>}
      <HistoryRows entries={entries} />
      {(cursor || error || loading) && <Button full onClick={() => void loadHistory(entries.length > 0)} status={loading ? 'loading' : 'idle'}>
        {error ? t('다시 불러오기') : t('더 보기')}
      </Button>}
    </Sheet>
  </div>
}

function HistoryRows({ entries }: { entries: WalletEntry[] }) {
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  if (!entries.length) return <p className={`t-body ${styles.muted}`} style={{ padding: 'var(--space-5) 0' }}>{t('아직 내역이 없어요.')}</p>
  return <div data-wallet-history>{entries.map(item => <div key={item.id} className={styles.historyRow}>
    <div><p className="t-body">{t(item.label)}</p><small>{new Date(item.at).toLocaleString(locale, { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' })} · {t(item.status)}</small><small>{item.detail}</small></div>
    {item.amount !== null && <strong className="t-body">{item.amount > 0 ? '+' : ''}{item.amount.toLocaleString(locale)}</strong>}
  </div>)}</div>
}
