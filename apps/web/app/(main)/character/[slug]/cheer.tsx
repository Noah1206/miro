'use client'
import { useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import { useWallet } from '@/components/wallet/provider'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { cheerCreator } from './actions'

const AMOUNTS = [100, 300, 500, 1000] as const

/** 11/11 응원하기(창작 보상 2단계) — 다른 사람이 만든 공개 캐릭터의 상세 화면에서 만든 사람에게 충전한 토큰을 보낸다. 만든 사람은 70% 를 받는다. */
export function CheerButton({ characterId, creatorName }: { characterId: string; creatorName: string }) {
  const t = useT()
  const toast = useToast()
  const locale = INTL_LOCALE[useLanguage()]
  const { wallet, refreshBalance, openRecharge } = useWallet()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState<number>(AMOUNTS[1])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const send = async () => {
    setPending(true); setError('')
    try {
      const r = await cheerCreator(characterId, amount, requestId)
      if (r.ok) { setOpen(false); setRequestId(crypto.randomUUID()); void refreshBalance(true); toast(t('{name}님에게 {n} 토큰을 응원했어요.', { name: creatorName, n: amount.toLocaleString(locale) })); return }
      setError(r.reason === 'insufficient' ? t('충전한 토큰이 부족해요. 응원은 충전한 토큰으로만 할 수 있어요.') : r.reason === 'own_character' ? t('내 캐릭터는 응원할 수 없어요.') : t('지금은 이 캐릭터를 응원할 수 없어요.'))
    } catch { setError(t('응원을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.')) } finally { setPending(false) }
  }

  return <>
    <button type="button" onClick={() => { setError(''); setOpen(true); void refreshBalance() }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10, border: 0, background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
      <img src="/miro-token.svg" alt="" aria-hidden width={14} height={14} />{t('응원하기')}
    </button>
    <Sheet open={open} onClose={() => { if (!pending) setOpen(false) }} title={t('{name}님 응원하기', { name: creatorName })} variant="choice" snap={{ half: 0.6, full: 0.9 }}>
      <div className="stack" style={{ gap: 14, padding: '0 var(--space-4) var(--space-5)' }}>
        <p className="t-caption" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{t('보낸 토큰의 70%가 만든 사람에게 전해져요. 충전한 토큰으로만 응원할 수 있어요.')}</p>
        <div role="radiogroup" aria-label={t('응원할 토큰')} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          {AMOUNTS.map(a => { const on = amount === a
            return <button key={a} type="button" role="radio" aria-checked={on} onClick={() => setAmount(a)}
              style={{ minHeight: 52, borderRadius: 'var(--radius-md)', font: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`, background: on ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface-1))' : 'var(--color-surface-1)', color: 'var(--color-text-primary)' }}>{a.toLocaleString(locale)}</button> })}
        </div>
        <p className="t-caption" style={{ margin: 0, display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
          <span>{t('남은 토큰')} {wallet ? wallet.available.toLocaleString(locale) : '—'}</span>
          <button type="button" onClick={() => { setOpen(false); openRecharge() }} style={{ border: 0, background: 'transparent', color: 'var(--color-text-secondary)', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>{t('충전하기')}</button>
        </p>
        {error && <p role="alert" className="t-caption" style={{ margin: 0, color: 'var(--color-danger)' }}>{error}</p>}
        <Button variant="primary" full onClick={send} disabled={pending}>{pending ? t('보내는 중…') : t('{n} 토큰 응원하기', { n: amount.toLocaleString(locale) })}</Button>
      </div>
    </Sheet>
  </>
}
