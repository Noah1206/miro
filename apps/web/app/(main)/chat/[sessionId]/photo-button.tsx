'use client'
import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Sheet } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { useWallet } from '@/components/wallet/provider'
import { PHOTO_COMPOSITIONS, PHOTO_PRICE, PHOTO_SCENES, type CompositionKey } from '@/lib/photo-scenes'
import { requestPhoto, type MediaState } from './media-actions'
import styles from './chat.module.css'

/** 입력창의 사진 버튼(11/2) — 시트에서 장면·구도·고정 세부사항을 고르고 1장 또는 4장 묶음으로 만든다.
 * 세부사항은 이 대화방에 저장해 두고 매번 같이 보낸다 — 사진마다 머리색·속옷 색이 바뀌지 않게. */
export function PhotoButton({ sessionId, unveil, bundle, disabled, custom = [] }: { sessionId: string; unveil: boolean; bundle: boolean; disabled?: boolean; custom?: Array<{ id: string; label: string; unveil: boolean }> }) {
  const t = useT(), router = useRouter()
  const { refreshBalance } = useWallet()
  const [open, setOpen] = useState(false)
  const key = `miro:photo-details:${sessionId}`
  const [details, setDetails] = useState('')
  const [scene, setScene] = useState('')
  useEffect(() => { try { setDetails(localStorage.getItem(key) ?? '') } catch { /* 저장소가 막혀도 사진은 만든다 */ } }, [key])
  const save = (value: string) => { setDetails(value); try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key) } catch { /* ignore */ } }
  const [state, action, pending] = useActionState(requestPhoto, { error: null, notice: null } satisfies MediaState)
  useEffect(() => {
    if (state.notice || state.error) void refreshBalance(true)
    if (state.notice) { router.refresh(); setOpen(false) }
  }, [state, router, refreshBalance])
  // 11/3: 만든 사람이 정한 이 캐릭터만의 장면이 앞에 — 이름은 만든 사람이 쓴 그대로(번역하지 않는다).
  const own = custom.filter(s => unveil || !s.unveil)
  const scenes = PHOTO_SCENES.filter(s => unveil || !s.unveil)
  const pill = (on: boolean) => ({ padding: '8px 14px', borderRadius: 999, border: `1px solid ${on ? 'var(--color-text-primary)' : 'var(--color-border)'}`,
    background: on ? 'var(--color-text-primary)' : 'transparent', color: on ? 'var(--color-surface-2)' : 'inherit', font: 'inherit', fontSize: 13, cursor: 'pointer' } as const)
  const field = { width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 12, background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 15 } as const
  return <>
    <button type="button" className={`${styles.toolButton} ${styles.photoTool}`} disabled={disabled} aria-label={t('사진 만들기')} onClick={() => setOpen(true)}>
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 15.5-4.2-4.2a1.5 1.5 0 0 0-2.1 0L6 19.5"/></svg>
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title={t(unveil ? '언베일 사진 만들기' : '사진 만들기')} variant="choice" snap={{ half: 0.7, full: 0.92 }}>
      <form action={action} style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="scene" value={scene} />
        <div style={{ display: 'grid', gap: 8 }}>
          <span className="t-caption" style={{ fontWeight: 600 }}>{t('장면')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button type="button" aria-pressed={!scene} style={pill(!scene)} onClick={() => setScene('')}>{t('지금 대화 그대로')}</button>
            {own.map(s => <button key={s.id} type="button" aria-pressed={scene === s.id} style={pill(scene === s.id)} onClick={() => setScene(s.id)}>{s.label}</button>)}
            {scenes.map(s => <button key={s.id} type="button" aria-pressed={scene === s.id} style={pill(scene === s.id)} onClick={() => setScene(s.id)}>{t(s.label)}</button>)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {(Object.keys(PHOTO_COMPOSITIONS) as CompositionKey[]).map(k => <label key={k} style={{ display: 'grid', gap: 6 }}>
            <span className="t-caption" style={{ fontWeight: 600 }}>{t(PHOTO_COMPOSITIONS[k].label)}</span>
            <select name={k} defaultValue="0" style={field}>
              {PHOTO_COMPOSITIONS[k].options.map(([label], i) => <option key={label} value={i}>{t(label)}</option>)}
            </select>
          </label>)}
        </div>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="t-caption" style={{ fontWeight: 600 }}>{t('고정할 세부사항')}</span>
          <textarea name="details" value={details} onChange={e => save(e.currentTarget.value.slice(0, 300))} rows={2} maxLength={300}
            placeholder={t('예: 허리까지 오는 흑발, 검은 레이스 속옷, 왼쪽 눈 밑 점')} style={{ ...field, resize: 'none' }} />
          <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('적어 둔 세부사항은 이 대화방 사진마다 똑같이 들어가요.')}</span>
        </label>
        {state.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(state.error)}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: bundle ? '1fr 1fr' : '1fr', gap: 8 }}>
          <Button type="submit" name="count" value="1" variant={bundle ? 'secondary' : 'primary'} full disabled={pending} status={pending ? 'loading' : undefined}>
            {t('1장 · {n} 미로', { n: PHOTO_PRICE.single })}
          </Button>
          {bundle && <Button type="submit" name="count" value={String(PHOTO_PRICE.bundleCount)} variant="primary" full disabled={pending} status={pending ? 'loading' : undefined}>
            {t('4장 묶음 · {n} 미로', { n: PHOTO_PRICE.bundle })}
          </Button>}
        </div>
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{t('누를 때마다 새로 그려요 · 첫 장은 1~2분 걸릴 수 있어요')}</p>
      </form>
    </Sheet>
  </>
}
