'use client'
import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Sheet } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { useWallet } from '@/components/wallet/provider'
import { requestPhoto, type MediaState } from './media-actions'
import styles from './chat.module.css'

/** 입력창의 사진 버튼(11/2) — 누르면 시트: 고정 세부사항(머리·옷·속옷 색 등)을 적고 사진을 만든다.
 * 세부사항은 이 대화방에 저장해 두고 매번 같이 보낸다 — 사진마다 머리색·속옷 색이 바뀌지 않게. */
export function PhotoButton({ sessionId, unveil, cost, disabled }: { sessionId: string; unveil: boolean; cost: number; disabled?: boolean }) {
  const t = useT(), router = useRouter()
  const { refreshBalance } = useWallet()
  const [open, setOpen] = useState(false)
  const key = `miro:photo-details:${sessionId}`
  const [details, setDetails] = useState('')
  useEffect(() => { try { setDetails(localStorage.getItem(key) ?? '') } catch { /* 저장소가 막혀도 사진은 만든다 */ } }, [key])
  const save = (value: string) => { setDetails(value); try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key) } catch { /* ignore */ } }
  const [state, action, pending] = useActionState(requestPhoto, { error: null, notice: null } satisfies MediaState)
  useEffect(() => {
    if (state.notice || state.error) void refreshBalance(true)
    if (state.notice) { router.refresh(); setOpen(false) }
  }, [state, router, refreshBalance])
  return <>
    <button type="button" className={styles.toolButton} disabled={disabled} aria-label={t('사진 만들기')} onClick={() => setOpen(true)}>
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/></svg>
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title={t(unveil ? '언베일 사진 만들기' : '사진 만들기')} variant="choice">
      <form action={action} style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('지금 장면을 사진으로 그려요. 적어 둔 세부사항은 이 대화방 사진마다 똑같이 들어가요.')}</p>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="t-caption" style={{ fontWeight: 600 }}>{t('고정할 세부사항')}</span>
          <textarea name="details" value={details} onChange={e => save(e.currentTarget.value.slice(0, 300))} rows={3} maxLength={300}
            placeholder={t('예: 허리까지 오는 흑발, 검은 레이스 속옷, 왼쪽 눈 밑 점')}
            style={{ width: '100%', resize: 'none', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 12, background: 'var(--color-surface-1, transparent)', color: 'inherit', font: 'inherit', fontSize: 15 }} />
        </label>
        {state.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(state.error)}</p>}
        <Button type="submit" variant="primary" full status={pending ? 'loading' : undefined} disabled={pending}>
          {t('사진 만들기 · {n} 미로', { n: cost })}
        </Button>
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{t('같은 장면에 이미 만든 사진이 있으면 무료로 다시 보여 줘요')}</p>
      </form>
    </Sheet>
  </>
}
