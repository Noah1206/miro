'use client'
import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { msg } from '@/lib/i18n'
import { useWallet } from '@/components/wallet/provider'
import { MALE_GROUP_OF, MALE_GROUPS, PHOTO_COMPOSITIONS, PHOTO_PRICE, PHOTO_SCENES, photoPrice, type CompositionKey } from '@/lib/photo-scenes'
import { requestPhoto, type MediaState } from './media-actions'
import styles from './chat.module.css'

/** 입력창의 사진 버튼(11/2, 11/3 개편) — 위 장 탭(1장 2장 +)으로 장을 고르고, 그 장의 장면·구도(드롭다운 3개)를 바꾼다.
 * '+ 한 장 더'는 지금 장의 장면·구도를 복사한다. 세부사항은 이 대화방에 저장해 두고 모든 장에 같이 보낸다 — 사진마다 머리색·속옷 색이 바뀌지 않게. */
type Shot = { key: number; scene: string; picks: number[] }
const KEYS = Object.keys(PHOTO_COMPOSITIONS) as CompositionKey[]
const SHORT: Record<CompositionKey, string> = { distance: msg('거리'), angle: msg('방향'), gaze: msg('시선'), outfit: msg('옷') }

export function PhotoButton({ sessionId, unveil, bundle, male = false, disabled, custom = [] }: { sessionId: string; unveil: boolean; bundle: boolean; male?: boolean; disabled?: boolean; custom?: Array<{ id: string; label: string; unveil: boolean }> }) {
  const t = useT(), router = useRouter()
  const { refreshBalance } = useWallet()
  const [open, setOpen] = useState(false)
  const key = `miro:photo-details:${sessionId}`
  const [details, setDetails] = useState('')
  const [shots, setShots] = useState<Shot[]>([{ key: 0, scene: '', picks: KEYS.map(() => 0) }])
  const [cur, setCur] = useState(0)
  useEffect(() => { try { setDetails(localStorage.getItem(key) ?? '') } catch { /* 저장소가 막혀도 사진은 만든다 */ } }, [key])
  const save = (value: string) => { setDetails(value); try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key) } catch { /* ignore */ } }
  const [state, action, pending] = useActionState(requestPhoto, { error: null, notice: null } satisfies MediaState)
  useEffect(() => {
    if (state.notice || state.error) void refreshBalance(true)
    if (state.notice) { router.refresh(); setOpen(false) }
  }, [state, router, refreshBalance])
  // 만든 사람이 정한 이 캐릭터만의 장면이 앞에 — 이름은 만든 사람이 쓴 그대로(번역하지 않는다).
  const own = custom.filter(s => unveil || !s.unveil)
  const scenes = PHOTO_SCENES.filter(s => (unveil || !s.unveil) && (male || !s.male))
  // 남성향(11/3): 상황이 많아서 묶음(표정·일상·스킨십…)을 먼저 고르고 그 묶음의 장면만 보여 준다. 옷은 남성향에서만.
  const groupOf = (s: (typeof scenes)[number]) => s.group ?? MALE_GROUP_OF[s.id] ?? '일상'
  const groups = male ? MALE_GROUPS.filter(g => scenes.some(s => groupOf(s) === g)) : []
  const [group, setGroup] = useState<string>('표정')
  const shown = male ? scenes.filter(s => groupOf(s) === group) : scenes
  const keys = male ? KEYS : KEYS.filter(k => k !== 'outfit')
  const sceneName = (id: string) => !id ? t('지금 대화') : own.find(s => s.id === id)?.label ?? t(scenes.find(s => s.id === id)?.label ?? '')
  const shot = shots[Math.min(cur, shots.length - 1)]!
  const update = (p: Partial<Shot>) => setShots(list => list.map(s => (s.key === shot.key ? { ...s, ...p } : s)))
  const count = shots.length
  const pill = (on: boolean) => ({ padding: '9px 14px', borderRadius: 999, border: 0, background: on ? 'var(--color-text-primary)' : 'var(--color-surface-2)',
    color: on ? 'var(--color-surface-1)' : 'var(--color-text-secondary)', font: 'inherit', fontSize: 14, fontWeight: on ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap' } as const)
  const tab = (on: boolean) => ({ height: 34, padding: '0 14px', borderRadius: 999, border: `1px solid ${on ? 'var(--color-lavender-500)' : '#ffffff12'}`, display: 'inline-flex', alignItems: 'center', gap: 6,
    background: on ? 'color-mix(in srgb, var(--color-lavender-500) 18%, transparent)' : 'transparent', color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', font: 'inherit', fontSize: 14, fontWeight: on ? 600 : 400, cursor: 'pointer' } as const)
  const label = { fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 10px', display: 'flex', justifyContent: 'space-between' } as const
  return <>
    <button type="button" className={`${styles.toolButton} ${styles.photoTool}`} disabled={disabled} aria-label={t('사진 만들기')} onClick={() => setOpen(true)}>
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 15.5-4.2-4.2a1.5 1.5 0 0 0-2.1 0L6 19.5"/></svg>
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title={t(unveil ? '언베일 사진 만들기' : '사진 만들기')} variant="choice" snap={{ half: 0.7, full: 0.92 }}>
      <form action={action} style={{ display: 'grid', gap: 22 }}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="count" value={count} />
        {shots.map((s, i) => <span key={s.key} hidden>
          <input type="hidden" name={`scene_${i}`} value={s.scene} />
          {KEYS.map((k, j) => <input key={k} type="hidden" name={`${k}_${i}`} value={s.picks[j]} />)}
        </span>)}
        {/* 사진 탭 — 장을 고르면 아래 장면·구도가 그 장의 것. '+'는 지금 장을 복사. */}
        <div>
          <p style={label}>{t('사진')}</p>
          <div role="tablist" aria-label={t('사진')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {shots.map((s, i) => <button key={s.key} type="button" role="tab" aria-selected={s.key === shot.key} onClick={() => setCur(i)} style={tab(s.key === shot.key)}>
              {t('{n}장', { n: i + 1 })} · {sceneName(s.scene)}
              {count > 1 && s.key === shot.key && <span role="button" tabIndex={0} aria-label={t('이 사진 빼기')}
                onClick={e => { e.stopPropagation(); setShots(list => list.filter(x => x.key !== s.key)); setCur(c => Math.max(0, c - 1)) }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setShots(list => list.filter(x => x.key !== s.key)); setCur(c => Math.max(0, c - 1)) } }}
                style={{ width: 18, height: 18, borderRadius: 9, display: 'grid', placeItems: 'center', fontSize: 11, background: '#ffffff14', color: 'var(--color-text-secondary)' }}>✕</span>}
            </button>)}
            {bundle && count < PHOTO_PRICE.max && <button type="button" disabled={pending} style={{ ...tab(false), color: 'var(--color-text-tertiary)' }}
              onClick={() => { setShots(list => [...list, { key: Math.max(...list.map(x => x.key)) + 1, scene: shot.scene, picks: [...shot.picks] }]); setCur(count) }}>{t('+ 한 장 더')}</button>}
          </div>
        </div>
        <div>
          <p style={label}><span>{t('장면')}</span>{count > 1 && <span>{t('{n}장째', { n: Math.min(cur, count - 1) + 1 })}</span>}</p>
          {male && <div role="tablist" aria-label={t('장면 묶음')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {groups.map(g => <button key={g} type="button" role="tab" aria-selected={group === g} onClick={() => setGroup(g)} style={tab(group === g)}>{t(g)}</button>)}
          </div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" aria-pressed={!shot.scene} style={pill(!shot.scene)} onClick={() => update({ scene: '' })}>{t('지금 대화 그대로')}</button>
            {own.map(s => <button key={s.id} type="button" aria-pressed={shot.scene === s.id} style={pill(shot.scene === s.id)} onClick={() => update({ scene: s.id })}>{s.label}</button>)}
            {shown.map(s => <button key={s.id} type="button" aria-pressed={shot.scene === s.id} style={pill(shot.scene === s.id)} onClick={() => update({ scene: s.id })}>{t(s.label)}</button>)}
          </div>
        </div>
        <div>
          <p style={label}>{t('구도')}</p>
          {/* 드롭다운 — 이름은 칸 안 위쪽, 값은 굵게. '자동'에서 바꾼 칸은 라벤더 바탕. */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${male ? 2 : 3}, minmax(0, 1fr))`, gap: 8 }}>
            {keys.map(k => [k, KEYS.indexOf(k)] as const).map(([k, j]) => <label key={k} className={styles.photoField} data-set={shot.picks[j] ? '' : undefined}>
              <span>{t(SHORT[k])}</span>
              <select value={shot.picks[j]} aria-label={t(PHOTO_COMPOSITIONS[k].label)} onChange={e => update({ picks: shot.picks.map((v, x) => (x === j ? Number(e.target.value) : v)) })}>
                {PHOTO_COMPOSITIONS[k].options.map(([name], i) => <option key={name} value={i}>{t(name)}</option>)}
              </select>
            </label>)}
          </div>
        </div>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>{t('고정할 세부사항')}</span>
          <textarea name="details" value={details} onChange={e => save(e.currentTarget.value.slice(0, 300))} rows={2} maxLength={300}
            placeholder={t('예: 허리까지 오는 흑발, 검은 레이스 속옷, 왼쪽 눈 밑 점')}
            style={{ width: '100%', padding: '12px', border: 0, borderRadius: 12, background: 'var(--color-surface-2)', color: 'inherit', font: 'inherit', fontSize: 15, resize: 'none' }} />
          <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('적어 둔 세부사항은 이 대화방 사진마다 똑같이 들어가요.')}</span>
        </label>
        {state.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(state.error)}</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          <button type="submit" disabled={pending} aria-busy={pending} style={{ minHeight: 54, width: '100%', border: 0, borderRadius: 12, background: 'var(--color-lavender-500)', color: '#fff',
            font: 'inherit', fontSize: 16, fontWeight: 650, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>
            {pending ? t('만드는 중…') : t('{n}장 만들기 · {price} 미로', { n: count, price: photoPrice(count) })}
          </button>
          <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', textAlign: 'center', margin: 0 }}>{t('첫 장은 1~2분 걸릴 수 있어요')}</p>
        </div>
      </form>
    </Sheet>
  </>
}
