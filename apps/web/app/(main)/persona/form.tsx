'use client'
import { useActionState, useState, useEffect } from 'react'
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
      {/* 만든 사람이 준비한 페르소나(11/3) — 누르면 아래 칸이 채워지고, 그다음 고쳐 쓸 수 있다. */}
      {presets.length > 0 && <div className={styles.presets} role="group" aria-label={t('준비된 페르소나')}>
        <span className={styles.top}>{t('준비된 페르소나')}</span>
        {presets.map(p => {
          const on = name === p.name && gender === (p.gender ?? '') && about === (p.description ?? '')
          return <button key={p.name} type="button" aria-pressed={on} className={styles.preset}
            onClick={() => { setName(p.name); setGender(p.gender ?? ''); setAbout(p.description ?? '') }}>
            <strong>{p.name}{p.gender && <span> · {t(p.gender === 'female' ? '여성' : '남성')}</span>}</strong>
            {p.description && <small>{p.description}</small>}
          </button>
        })}
      </div>}
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
