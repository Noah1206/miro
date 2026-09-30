'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Button, Notice, Sheet, useToast } from '@/components/ui'
import { readWallet, purchaseCredits } from '@/app/(main)/recharge/wallet-actions'
import { SHEET_BUTTON, TransferActions } from '@/app/(main)/recharge/transfer-actions'
import type { BalanceActionResult, PayState, WalletSnapshot } from '@/lib/wallet/types'
import styles from './wallet.module.css'
import { msg, INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'

type Pending = { cost: number; label: string; action: () => Promise<BalanceActionResult> }
type WalletContext = {
  wallet: WalletSnapshot | null; state: PayState; busy: boolean
  sync: (wallet: WalletSnapshot) => void; openRecharge: () => void
  requireBalance: (cost: number, action: Pending['action'], label?: string) => Promise<void>
}
const Context = createContext<WalletContext | null>(null)
export function useWallet() {
  const context = useContext(Context)
  if (!context) throw new Error('WalletProvider missing')
  return context
}

/** A quote improves UX; only the existing server reservation can authorize spending. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const pathname = usePathname()
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null)
  const [state, setState] = useState<PayState>('idle')
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<'insufficient' | 'catalog'>('catalog')
  const [error, setError] = useState<string | null>(null)
  const [needed, setNeeded] = useState<{ cost: number; label: string } | null>(null)
  const [selected, setSelected] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [checking, setChecking] = useState(false)
  const [transferTapped, setTransferTapped] = useState(false)
  const pending = useRef<Pending | null>(null)
  const epoch = useRef(0)
  const locked = useRef(false)
  const refreshing = useRef(false)
  const executing = useRef(false)
  const purchase = useRef<{ productId: string; requestId: string } | null>(null)
  const settledSeen = useRef<string | null>(null)

  const cancel = useCallback(() => {
    if (executing.current) return
    epoch.current++; pending.current = null; locked.current = false
    setOpen(false); setState('cancelled'); setError(null); setNeeded(null)
  }, [])
  useEffect(() => {
    epoch.current++; pending.current = null; locked.current = false
    setOpen(false); setState('idle'); setError(null); setNeeded(null)
  }, [pathname])
  useEffect(() => () => { epoch.current++; pending.current = null }, [])
  useEffect(() => { setTransferTapped(false) }, [stage, wallet?.order?.id])

  async function execute(request: Pending, token: number) {
    if (token !== epoch.current || executing.current) return
    executing.current = true; locked.current = true; setState('loading'); setError(null)
    try {
      const result = await request.action()
      if (token !== epoch.current) return
      if (result.status === 'insufficient') {
        // Another tab may have used the quote. Preserve the action and refresh before asking again.
        const fresh = await readWallet()
        if (token !== epoch.current) return
        setWallet(fresh); pending.current = request; setNeeded(request)
        setStage('insufficient'); setState('idle'); setOpen(true)
      } else if (result.status === 'failed') {
        pending.current = request; setNeeded(request); setError(result.error); setState('failed'); setOpen(true)
      } else {
        pending.current = null; setNeeded(null); setState('success'); setOpen(false)
      }
    } catch {
      if (token === epoch.current) {
        pending.current = request; setNeeded(request); setError(msg('연결을 확인하지 못했어요. 다시 시도해 주세요.')); setState('failed'); setOpen(true)
      }
    } finally { executing.current = false; if (token === epoch.current) locked.current = false }
  }

  async function requireBalance(cost: number, action: Pending['action'], label = msg('이용하기')) {
    if (locked.current || pending.current || open) return
    if (!Number.isSafeInteger(cost) || cost < 0) throw new Error('Invalid balance quote')
    const token = ++epoch.current
    const request = { cost, action, label }
    locked.current = true; pending.current = request; setNeeded(request); setState('loading'); setError(null)
    try {
      const fresh = await readWallet()
      if (token !== epoch.current) return
      setWallet(fresh)
      if (fresh.available >= cost) await execute(request, token)
      else { setStage('insufficient'); setOpen(true); setState('idle') }
    } catch {
      if (token === epoch.current) { setError(msg('잔액을 불러오지 못했어요. 다시 확인해 주세요.')); setState('failed'); setOpen(true) }
    } finally { if (token === epoch.current) locked.current = false }
  }

  async function openRecharge() {
    if (locked.current || open) return
    const token = ++epoch.current
    pending.current = null; setNeeded(null); setStage('catalog'); setOpen(true); setError(null); setState('loading'); locked.current = true
    try { const fresh = await readWallet(); if (token === epoch.current) { setWallet(fresh); setState('idle') } }
    catch { if (token === epoch.current) { setError(msg('잔액을 불러오지 못했어요. 다시 확인해 주세요.')); setState('failed') } }
    finally { if (token === epoch.current) locked.current = false }
  }

  async function reflect(fresh: WalletSnapshot, token: number) {
    if (token !== epoch.current) return
    setWallet(fresh); setError(null)
    const order = fresh.order
    if (order?.settledAt && settledSeen.current !== order.id) {
      settledSeen.current = order.id; purchase.current = null
      setState('success'); toast(t('충전이 반영됐어요'))
      const request = pending.current
      if (request && fresh.available >= request.cost) await execute(request, token)
      else if (request) { setStage('insufficient'); setState('idle') }
    } else if (order && ['expired', 'rejected'].includes(order.status)) {
      purchase.current = null; setState('failed'); setError(order.status === 'expired' ? msg('입금 기한이 지났어요. 새 주문으로 다시 시작해 주세요.') : msg('주문이 취소됐어요. 내역을 확인하거나 다시 시작해 주세요.'))
    } else if (!pending.current) setState('idle')
  }

  const refresh = useCallback(async () => {
    if (refreshing.current || locked.current || !open) return
    refreshing.current = true; setChecking(true)
    const token = epoch.current
    try {
      const fresh = await readWallet(wallet?.order?.id)
      await reflect(fresh, token)
    } catch { if (token === epoch.current) setError(msg('반영 상태를 확인하지 못했어요. 잔액은 바뀌지 않았어요. 다시 확인해 주세요.')) }
    finally { refreshing.current = false; setChecking(false) }
  }, [open, wallet?.order?.id, toast, t])

  useEffect(() => {
    if (!open || !wallet?.order || wallet.order.settledAt || !['awaiting', 'approved'].includes(wallet.order.status)) return
    const check = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = setInterval(check, 15_000)
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check)
    return () => { clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [open, wallet?.order, refresh])

  async function checkout() {
    if (locked.current || !selected) return
    const token = epoch.current
    locked.current = true; setState('loading'); setError(null)
    // A timed-out POST is retried with exactly the same order ID, never a new purchase.
    if (!purchase.current || purchase.current.productId !== selected) purchase.current = { productId: selected, requestId: crypto.randomUUID() }
    try {
      const result = await purchaseCredits(selected, purchase.current.requestId)
      if (token !== epoch.current) return
      if (result.ok) { setState('idle'); await reflect(result.wallet, token) }
      else { setError(result.error); setState('failed') }
    } catch { if (token === epoch.current) { setError(msg('주문 상태를 확인하지 못했어요. 다시 눌러 확인해 주세요.')); setState('failed') } }
    finally { if (token === epoch.current) locked.current = false }
  }

  async function retryAction() {
    if (locked.current) return
    const request = pending.current
    if (!request) { await refresh(); return }
    const token = epoch.current
    locked.current = true; setState('loading')
    try {
      const fresh = await readWallet()
      if (token !== epoch.current) return
      setWallet(fresh); setError(null)
      if (fresh.available >= request.cost) await execute(request, token)
      else { setStage('insufficient'); setState('idle') }
    } catch { if (token === epoch.current) { setError(msg('잔액을 확인하지 못했어요. 다시 시도해 주세요.')); setState('failed') } }
    finally { if (token === epoch.current) locked.current = false }
  }

  const order = wallet?.order
  const waiting = order && !order.settledAt && ['awaiting', 'approved'].includes(order.status)
  const products = expanded ? wallet?.products : wallet?.products.slice(0, 3)
  const done = !!order?.settledAt && !pending.current
  const insufficient = stage === 'insufficient' && !waiting && state !== 'failed'
  const krw = (n: number) => t('{n}원', { n: n.toLocaleString(locale) })
  return <Context.Provider value={{ wallet, state, busy: state === 'loading', sync: setWallet, openRecharge: () => { void openRecharge() }, requireBalance }}>
    {children}
    {/* 잔액 부족은 제목을 아이콘과 함께 본문 가운데에 그린다 — 시트 머리에는 닫기만 남는다. */}
    <Sheet open={open} onClose={cancel} title={insufficient ? undefined : 'Miro Pay'} label={insufficient ? t('미로가 부족해요') : undefined}>
      <div className={styles.stack} data-pay-state={state}>
        {!insufficient && wallet && <div className={styles.balanceLine}>
          <span>{t('충전 잔액')}</span>
          <strong data-sheet-balance={wallet.rechargeRemaining}>{t('{n} 미로', { n: wallet.rechargeRemaining.toLocaleString(locale) })}</strong>
        </div>}
        {error && <Notice tone="danger" role="alert">{t(error)}</Notice>}
        {state === 'failed' && pending.current && <Button onClick={() => void retryAction()}>{t('다시 확인하기')}</Button>}
        {insufficient ? <div className={styles.stack} data-balance-required={needed?.cost}>
          {/* 세로 리듬: 아이콘–제목 12, 제목–버튼 24, 버튼–버튼 8, 아래 여백은 시트의 24. */}
          <div className={styles.center}>
            <svg className={styles.dangerIcon} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>
            <h2 className="t-title-2">{t('미로가 부족해요')}</h2>
          </div>
          <div className={styles.actions}>
            <Button variant="secondary" style={SHEET_BUTTON} full onClick={() => setStage('catalog')}>{t('충전하고 이어가기')}</Button>
            <Button variant="ghost" full onClick={cancel} style={{ color: 'var(--color-text-primary)' }}>{t('나중에')}</Button>
          </div>
        </div> : waiting ? <section className={styles.stack} data-bank-order={order.status}>
          <h3 className="t-title-3">{order.status === 'approved' ? t('입금 확인 · 지급 대기') : t('입금 대기 중')}</h3>
          {order.status === 'awaiting' && wallet?.account && <>
            <div>
              <p className={`t-caption ${styles.muted}`}>{t('보낼 금액')}</p>
              <p className={`t-title-1 ${styles.amount}`} style={{ margin: 'var(--space-1) 0 0' }} data-order-amount={order.amountMinor}>{krw(order.amountMinor)}</p>
            </div>
            <TransferActions bank={wallet.account.bank} accountNumber={wallet.account.number} amount={order.amountMinor} onOpen={() => setTransferTapped(true)} />
          </>}
          {order.status === 'approved' && <p className="t-body">{t('입금이 확인됐어요. 잔액 반영까지 최대 15분 정도 걸릴 수 있어요.')}</p>}
          {/* 송금 버튼을 눌러야 열린다 — 그 전엔 흐린 글씨로 잠겨 있다. */}
          <div className={styles.actions}>
            <Button variant="secondary" full data-confirm-deposit onClick={() => void refresh()} status={state === 'loading' || checking ? 'loading' : 'idle'}
              disabled={order.status === 'awaiting' && !transferTapped}
              style={{ ...SHEET_BUTTON, ...(order.status === 'awaiting' && !transferTapped ? { color: 'var(--color-text-quaternary)' } : {}) }}>{t('입금 확인하기')}</Button>
            <Button full variant="ghost" size="sm" onClick={cancel} style={{ color: 'var(--color-text-primary)' }}>{t('나중에')}</Button>
          </div>
        </section> : done ? <>
          <Notice>{t('지급이 완료됐어요. 잔액에 반영했습니다.')}</Notice>
          <Button full variant="primary" onClick={cancel}>{t('확인')}</Button>
        </> : <>
          {wallet && !wallet.account && <Notice>{t('지금은 충전을 받지 않고 있어요.')}</Notice>}
          {wallet?.account && <>
            <fieldset className={styles.options} disabled={state === 'loading'}>
              <legend className="t-title-3">{t('충전할 금액')}</legend>
              {products?.map(p => <label key={p.id} className={styles.option}>
                <input type="radio" name="wallet-product" value={`recharge:${p.id}`} checked={selected === `recharge:${p.id}`} onChange={() => setSelected(`recharge:${p.id}`)} />
                <span><strong>{t('{n} 미로', { n: p.units.toLocaleString(locale) })}</strong></span>
                <b>{krw(p.priceMinor)}</b>
              </label>)}
              {!wallet.products.length && <p className={`t-caption ${styles.muted}`}>{t('판매 중인 미로 상품이 없어요.')}</p>}
              {(wallet.products.length > 3 && !expanded) && <Button variant="ghost" full onClick={() => setExpanded(true)}>{t('금액 더 보기')}</Button>}
            </fieldset>
            <div className={`${styles.footer} ${styles.actions}`}>
              <Button full variant="secondary" style={SHEET_BUTTON} onClick={() => void checkout()} status={state === 'loading' ? 'loading' : 'idle'} disabled={!selected}>{t('다음으로')}</Button>
              <Button full variant="ghost" size="sm" onClick={cancel} style={{ color: 'var(--color-text-primary)' }}>{t('나중에')}</Button>
            </div>
          </>}
          {!wallet && <Button onClick={() => void refresh()} status={checking ? 'loading' : 'idle'} full>{t('잔액 다시 불러오기')}</Button>}
        </>}
      </div>
    </Sheet>
  </Context.Provider>
}

/** 둥근 ? — 누르면 설명이 펼쳐진다. */
export function HelpToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  const t = useT()
  return <button type="button" className={styles.helpButton} aria-label={t('도움말')} aria-expanded={open} aria-controls={controls} onClick={onToggle}><span className={styles.helpDot} aria-hidden>?</span></button>
}
