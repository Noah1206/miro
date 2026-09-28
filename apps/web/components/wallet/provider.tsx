'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Button, Notice, Sheet, useToast } from '@/components/ui'
import { readWallet, purchaseCredits } from '@/app/(main)/recharge/wallet-actions'
import { TransferActions } from '@/app/(main)/recharge/transfer-actions'
import { COPY } from '@/lib/copy'
import type { BalanceActionResult, PayState, WalletSnapshot } from '@/lib/wallet/types'
import styles from './wallet.module.css'

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
        pending.current = request; setNeeded(request); setError('연결을 확인하지 못했어요. 다시 시도해 주세요.'); setState('failed'); setOpen(true)
      }
    } finally { executing.current = false; if (token === epoch.current) locked.current = false }
  }

  async function requireBalance(cost: number, action: Pending['action'], label = '이용하기') {
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
      if (token === epoch.current) { setError('잔액을 불러오지 못했어요. 다시 확인해 주세요.'); setState('failed'); setOpen(true) }
    } finally { if (token === epoch.current) locked.current = false }
  }

  async function openRecharge() {
    if (locked.current || open) return
    const token = ++epoch.current
    pending.current = null; setNeeded(null); setStage('catalog'); setOpen(true); setError(null); setState('loading'); locked.current = true
    try { const fresh = await readWallet(); if (token === epoch.current) { setWallet(fresh); setState('idle') } }
    catch { if (token === epoch.current) { setError('잔액을 불러오지 못했어요. 다시 확인해 주세요.'); setState('failed') } }
    finally { if (token === epoch.current) locked.current = false }
  }

  async function reflect(fresh: WalletSnapshot, token: number) {
    if (token !== epoch.current) return
    setWallet(fresh); setError(null)
    const order = fresh.order
    if (order?.settledAt && settledSeen.current !== order.id) {
      settledSeen.current = order.id; purchase.current = null
      setState('success'); toast(order.kind === 'pass' ? '이용권이 반영됐어요' : '충전이 반영됐어요')
      const request = pending.current
      if (request && fresh.available >= request.cost) await execute(request, token)
      else if (request) { setStage('insufficient'); setState('idle') }
    } else if (order && ['expired', 'rejected'].includes(order.status)) {
      purchase.current = null; setState('failed'); setError(order.status === 'expired' ? '입금 기한이 지났어요. 새 주문으로 다시 시작해 주세요.' : '주문이 취소됐어요. 내역을 확인하거나 다시 시작해 주세요.')
    } else if (!pending.current) setState('idle')
  }

  const refresh = useCallback(async () => {
    if (refreshing.current || locked.current || !open) return
    refreshing.current = true; setChecking(true)
    const token = epoch.current
    try {
      const fresh = await readWallet(wallet?.order?.id)
      await reflect(fresh, token)
    } catch { if (token === epoch.current) setError('반영 상태를 확인하지 못했어요. 잔액은 바뀌지 않았어요. 다시 확인해 주세요.') }
    finally { refreshing.current = false; setChecking(false) }
  }, [open, wallet?.order?.id, toast])

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
    } catch { if (token === epoch.current) { setError('주문 상태를 확인하지 못했어요. 다시 눌러 확인해 주세요.'); setState('failed') } }
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
    } catch { if (token === epoch.current) { setError('잔액을 확인하지 못했어요. 다시 시도해 주세요.'); setState('failed') } }
    finally { if (token === epoch.current) locked.current = false }
  }

  const order = wallet?.order
  const waiting = order && !order.settledAt && ['awaiting', 'approved'].includes(order.status)
  const products = expanded ? wallet?.products : wallet?.products.slice(0, 3)
  const done = !!order?.settledAt && !pending.current
  return <Context.Provider value={{ wallet, state, busy: state === 'loading', sync: setWallet, openRecharge: () => { void openRecharge() }, requireBalance }}>
    {children}
    <Sheet open={open} onClose={cancel} title={stage === 'insufficient' && !waiting ? '크레딧이 부족해요' : 'Miro Pay'}>
      <div className={styles.content} data-pay-state={state}>
        {wallet && <div className={styles.balanceLine}>
          <span>충전 잔액</span><strong data-sheet-balance={wallet.rechargeRemaining}>{wallet.rechargeRemaining.toLocaleString('ko-KR')} 크레딧</strong>
        </div>}
        {needed && <p className="t-body" data-balance-required>
          {needed.label}에 {needed.cost} 크레딧이 필요해요.<br />
          현재 사용 가능 · {wallet?.available.toLocaleString('ko-KR') ?? '확인 중'} 크레딧 <span className={styles.muted}>(월간 제공량 포함)</span>
        </p>}
        {error && <Notice tone="danger" role="alert">{error}</Notice>}
        {state === 'failed' && pending.current && <Button onClick={() => void retryAction()}>다시 확인하기</Button>}
        {stage === 'insufficient' && !waiting && state !== 'failed' ? <>
          <p className={`t-caption ${styles.muted}`}>충전이 반영되면 이 화면에서 {needed?.label ?? '이용'}을 이어가요.</p>
          <Button variant="primary" full onClick={() => setStage('catalog')}>충전하고 이어가기</Button>
          <Button variant="ghost" full onClick={cancel}>나중에</Button>
        </> : waiting ? <section className={styles.content} data-bank-order={order.status}>
          <h3 className="t-title-3">{order.status === 'approved' ? '입금 확인 · 지급 대기' : '입금 대기 중'}</h3>
          {order.status === 'awaiting' && wallet?.account && <>
            <p className="t-body">{wallet.account.bank} <b>{wallet.account.number}</b> ({wallet.account.holder})</p>
            <p className="t-body">보낼 금액 · <b data-order-amount={order.amountMinor}>{order.amountMinor.toLocaleString('ko-KR')}원</b></p>
            <p className="t-body">입금자명 · <b>{order.depositName}</b></p>
            <p className={`t-caption ${styles.muted}`}>입금자명에는 위 코드만 적어 주세요. 보통 하루 안에 확인해요. {new Date(order.expiresAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}까지 입금해 주세요.</p>
            <TransferActions bank={wallet.account.bank} accountNumber={wallet.account.number} amount={order.amountMinor} depositName={order.depositName} />
          </>}
          {order.status === 'approved' && <p className="t-body">입금이 확인됐어요. 잔액 반영까지 최대 15분 정도 걸릴 수 있어요.</p>}
          <Button onClick={() => void refresh()} status={state === 'loading' || checking ? 'loading' : 'idle'} full>반영 확인하기</Button>
          <p className={`t-caption ${styles.muted}`}>닫아도 주문은 남아요.{needed ? ' 이 화면을 열어 두면 반영 후 자동으로 이어가요.' : ''}</p>
        </section> : done ? <>
          <Notice>지급이 완료됐어요. 잔액에 반영했습니다.</Notice>
          <Button full variant="primary" onClick={cancel}>확인</Button>
        </> : <>
          {wallet && !wallet.account && <Notice>지금은 충전을 받지 않고 있어요.</Notice>}
          {wallet?.account && <>
            <fieldset className={styles.options} disabled={state === 'loading'}>
              <legend className="t-title-3">충전할 금액</legend>
              {products?.map(p => <label key={p.id} className={styles.option}>
                <input type="radio" name="wallet-product" value={`recharge:${p.id}`} checked={selected === `recharge:${p.id}`} onChange={() => setSelected(`recharge:${p.id}`)} />
                <span><strong>{p.units.toLocaleString('ko-KR')} 크레딧</strong><small>{p.name}{p.validDays ? ` · 지급 후 ${p.validDays}일` : ''}</small></span>
                <b>{p.priceMinor.toLocaleString('ko-KR')}원</b>
              </label>)}
              {!wallet.products.length && <p className={`t-caption ${styles.muted}`}>판매 중인 크레딧 상품이 없어요.</p>}
              {(wallet.products.length > 3 && !expanded) && <Button variant="ghost" full onClick={() => setExpanded(true)}>금액 더 보기</Button>}
              <label className={styles.option}>
                <input type="radio" name="wallet-product" value="pass" checked={selected === 'pass'} onChange={() => setSelected('pass')} />
                <span><strong>Pro 1개월 이용권</strong><small>크레딧 충전과 별도 · 자동 갱신 없음</small></span><b>{wallet.passPrice.toLocaleString('ko-KR')}원</b>
              </label>
            </fieldset>
            <p className={`t-caption ${styles.muted}`}>계좌이체로 입금하면 확인 후 지급해요.</p>
            <ul className={styles.terms} data-refund-terms>{[COPY.refund.recharge, COPY.refund.pass, COPY.refund.failure, COPY.refund.how].map(line => <li key={line}>{line}</li>)}</ul>
            <div className={styles.footer}><Button full variant="primary" onClick={() => void checkout()} status={state === 'loading' ? 'loading' : 'idle'} disabled={!selected}>입금 안내 받기</Button></div>
          </>}
          {!wallet && <Button onClick={() => void refresh()} status={checking ? 'loading' : 'idle'} full>잔액 다시 불러오기</Button>}
        </>}
      </div>
    </Sheet>
  </Context.Provider>
}
