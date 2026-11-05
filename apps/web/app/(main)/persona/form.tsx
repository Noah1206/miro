'use client'
import { useActionState, useState, useEffect, useRef, useId } from 'react'
import { PERSONA_LIMITS, type UserPersona } from '@miro/domain'
import { SubmitButton } from '@/components/ui/submit-button'
import { savePersonaAction, saveConversationPersonaAction } from './actions'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'
import styles from './form.module.css'

const GENDERS = [{ value: '', label: msg('밝히지 않음') }, { value: 'female', label: msg('여성') }, { value: 'male', label: msg('남성') }]

/** guide(11/4) — 세계관 카드에서 쓸 때: '나에 대해'가 필수가 되고 만든 사람의 작성 안내가 칸 안내로 보인다. */
export function PersonaForm({ initial, next, submitLabel, sessionId, onDone, presets = [], guide }: { initial: UserPersona | null; next: string; submitLabel: string; sessionId?: string; onDone?: () => void; presets?: UserPersona[]; guide?: string }) {
  const [state, action] = useActionState(sessionId ? saveConversationPersonaAction : savePersonaAction, null)
  const [gender, setGender] = useState<string>(initial?.gender ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [about, setAbout] = useState(initial?.description ?? '')
  const t = useT()
  useEffect(() => { if (state?.saved) onDone?.() }, [state, onDone])
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      {sessionId && <input type="hidden" name="sessionId" value={sessionId} />}
      {/* 만든 사람이 준비한 페르소나(11/3) — 11/5: 드롭다운으로 고르고, 고른 것을 다시 누르면 해제(칸 비움). 고른 뒤 고쳐 쓸 수 있다. */}
      {presets.length > 0 && <PresetDropdown presets={presets}
        isOn={p => name === p.name && gender === (p.gender ?? '') && about === (p.description ?? '')}
        onPick={p => { if (p) { setName(p.name); setGender(p.gender ?? ''); setAbout(p.description ?? '') } else { setName(''); setGender(''); setAbout('') } }} />}
      <label className={styles.field}>
        <span className={styles.top}><span>{t('이름')}<b aria-hidden>*</b></span><span>{name.length}/{PERSONA_LIMITS.name}</span></span>
        <input name="name" value={name} onChange={e => setName(e.target.value)} maxLength={PERSONA_LIMITS.name} required autoComplete="off" placeholder={t('예) 지우')} />
      </label>
      <div className={styles.genders} role="group" aria-label={t('성별')}>
        <span className={styles.top}>{t('성별')}</span>
        <input type="hidden" name="gender" value={gender} />
        <div className={styles.seg}>
          {GENDERS.map(g => <button key={g.value} type="button" aria-pressed={gender === g.value} onClick={() => setGender(g.value)}>{t(g.label)}</button>)}
        </div>
      </div>
      <label className={styles.field}>
        <span className={styles.top}><span>{t(guide === undefined ? '나에 대해' : '이 세계에서의 나')}{guide !== undefined && <b aria-hidden>*</b>}</span><span>{about.length}/{PERSONA_LIMITS.description}</span></span>
        <textarea name="description" value={about} onChange={e => setAbout(e.target.value)} maxLength={PERSONA_LIMITS.description} rows={4} required={guide !== undefined}
          placeholder={guide || t('예) 스물여섯, 출판사 편집자. 낯을 가리지만 친해지면 장난이 많다.')} />
      </label>
      {state?.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(state.error)}</p>}
      <div className={styles.submit}><SubmitButton full variant="primary" size="lg">{submitLabel}</SubmitButton></div>
    </form>
  )
}

function PresetDropdown({ presets, isOn, onPick }: { presets: UserPersona[]; isOn: (p: UserPersona) => boolean; onPick: (p: UserPersona | null) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = presets.find(isOn)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} className={styles.presets}>
      <span className={styles.top}>{t('준비된 페르소나')}</span>
      <button type="button" className={styles.presetToggle} aria-expanded={open} aria-controls={listId} onClick={() => setOpen(o => !o)}>
        <span>{current ? current.name : t('선택 안 함')}</span>
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <div id={listId} role="group" aria-label={t('준비된 페르소나')} className={styles.presetList}>
        {presets.map(p => {
          const on = isOn(p)
          return <button key={p.name} type="button" aria-pressed={on} className={styles.preset}
            onClick={() => { onPick(on ? null : p); setOpen(false) }}>
            <strong>{p.name}{p.gender && <span> · {t(p.gender === 'female' ? '여성' : '남성')}</span>}</strong>
            {p.description && <small>{p.description}</small>}
          </button>
        })}
      </div>}
    </div>
  )
}
