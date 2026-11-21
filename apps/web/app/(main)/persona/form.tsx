'use client'
import { useActionState, useState, useEffect, useRef, useId } from 'react'
import { PERSONA_LIMITS, type UserPersona } from '@miro/domain'
import { SubmitButton } from '@/components/ui/submit-button'
import { savePersonaAction, saveConversationPersonaAction } from './actions'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'
import styles from './form.module.css'

// 11/21 사용자(레퍼런스): 여성 · 남성 · 비공개 순서의 버튼 세 개.
const GENDERS = [{ value: 'female', label: msg('여성') }, { value: 'male', label: msg('남성') }, { value: '', label: msg('비공개') }]

/** guide(11/4) — 세계관 카드에서 쓸 때: '나에 대해'가 필수가 되고 만든 사람의 작성 안내가 칸 안내로 보인다. */
/** formId·hideSubmit(11/21): 머리 오른쪽 '저장' 버튼이 이 폼을 보낼 때 — 폼 아래 버튼은 숨긴다. */
export function PersonaForm({ initial, next, submitLabel, sessionId, onDone, presets = [], guide, submitStyle, formId, hideSubmit = false }: { initial: UserPersona | null; next: string; submitLabel: string; sessionId?: string; onDone?: () => void; presets?: UserPersona[]; guide?: string; submitStyle?: React.CSSProperties; formId?: string; hideSubmit?: boolean }) {
  const [state, action] = useActionState(sessionId ? saveConversationPersonaAction : savePersonaAction, null)
  const [gender, setGender] = useState<string>(initial?.gender ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [about, setAbout] = useState(initial?.description ?? '')
  const [age, setAge] = useState(initial?.age ?? '')
  const t = useT()
  const nameId = useId(), aboutId = useId(), ageId = useId()
  useEffect(() => { if (state?.saved) onDone?.() }, [state, onDone])
  return (
    <form id={formId} action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      {sessionId && <input type="hidden" name="sessionId" value={sessionId} />}
      {/* 만든 사람이 준비한 페르소나(11/3) — 11/5: 드롭다운으로 고르고, 고른 것을 다시 누르면 해제(칸 비움). 고른 뒤 고쳐 쓸 수 있다. */}
      {presets.length > 0 && <PresetDropdown presets={presets}
        isOn={p => name === p.name && gender === (p.gender ?? '') && about === (p.description ?? '')}
        onPick={p => { if (p) { setName(p.name); setGender(p.gender ?? ''); setAbout(p.description ?? ''); setAge(p.age ?? '') } else { setName(''); setGender(''); setAbout(''); setAge('') } }} />}
      {/* 11/21 사용자(레퍼런스): 칸 위에 굵은 이름표 + 분홍 안내 + 빨간 별표, 아래에 채운 칸, 글자 수는 칸 밑 오른쪽. */}
      <div className={styles.group}>
        <label htmlFor={nameId} className={styles.label}>{t('이름')}<span className={styles.hint}>{t('캐릭터가 나를 부르는 이름이에요')}</span><b aria-hidden>*</b></label>
        <input id={nameId} className={styles.input} name="name" value={name} onChange={e => setName(e.target.value)} maxLength={PERSONA_LIMITS.name} required autoComplete="off" placeholder={t('이름을 입력하세요')} />
        <span className={styles.count}>{name.length}/{PERSONA_LIMITS.name}</span>
      </div>
      {/* 11/21 사용자: 나이 칸(비워도 된다). */}
      <div className={styles.group}>
        <label htmlFor={ageId} className={styles.label}>{t('나이')}</label>
        <input id={ageId} className={styles.input} name="age" value={age} onChange={e => setAge(e.target.value)} maxLength={PERSONA_LIMITS.age} autoComplete="off" inputMode="numeric" placeholder={t('나이를 입력하세요')} />
      </div>
      <div className={styles.group} role="group" aria-label={t('성별')}>
        <span className={styles.label}>{t('성별')}</span>
        <input type="hidden" name="gender" value={gender} />
        <div className={styles.genderRow}>
          {GENDERS.map(g => <button key={g.value} type="button" aria-pressed={gender === g.value} onClick={() => setGender(g.value)}>{t(g.label)}</button>)}
        </div>
      </div>
      <div className={styles.group}>
        <label htmlFor={aboutId} className={styles.label}>{t(guide === undefined ? '상세정보' : '이 세계에서의 나')}<span className={styles.hint}>{t('적어 두면 캐릭터가 나를 알고 대화해요')}</span>{guide !== undefined && <b aria-hidden>*</b>}</label>
        <textarea id={aboutId} className={styles.input} name="description" value={about} onChange={e => setAbout(e.target.value)} maxLength={PERSONA_LIMITS.description} rows={7} required={guide !== undefined}
          placeholder={guide || t('이렇게 적어 보세요\n\n· 외모: 키, 머리 모양, 인상\n· 성격·말투: 무뚝뚝하지만 다정함, 존댓말\n· 좋아하는 것 / 싫어하는 것\n· 직업·특징: 대학원생, 밤샘이 잦음\n· 캐릭터와의 사이: 오래된 이웃')} />
        <span className={styles.count}>{about.length.toLocaleString()}/{PERSONA_LIMITS.description.toLocaleString()}</span>
      </div>
      {state?.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(state.error)}</p>}
      {!hideSubmit && <div className={styles.submit}><SubmitButton full variant="primary" size="lg" style={submitStyle}>{submitLabel}</SubmitButton></div>}
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
