'use client'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { flushSync } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { LANGUAGES, PERSONA_LIMITS, type Language } from '@miro/domain'
import { Button } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { box } from '@/app/(main)/create/form-parts'
import { duration, ease, press, spring } from '@/lib/motion/tokens'
import { ONBOARDING_STEPS, REQUIRED_TERMS, type Taste } from '@/lib/onboarding-options'
import { setLanguage } from '@/lib/i18n/actions'
import { useLanguage, useT } from '@/lib/i18n/client'
import { msg } from '@/lib/i18n'
import { finishOnboarding } from './actions'

const COPY = [
  { title: msg('언어를 골라 주세요'), lead: msg('메뉴·버튼 같은 앱 화면과 캐릭터가 보내는 대화·문자·전화가 모두 이 언어로 바뀌어요. 캐릭터 이름과 작성자가 쓴 소개글은 원래 언어 그대로 보여요. 마이페이지 > 설정 > 언어에서 언제든 바꿀 수 있어요.') },
  { title: msg('어떻게 불러 드릴까요?'), lead: msg('캐릭터가 대화에서 부를 닉네임이에요. 마이페이지에서 언제든 바꿀 수 있어요.') },
  { title: msg('성별을 알려 주세요'), lead: msg('캐릭터가 나를 알아보는 데 쓰여요.') },
  { title: msg('좋아하는 관계를 모두 골라 주세요'), lead: msg('취향에 맞는 캐릭터를 추천할 때 써요.') },
  { title: msg('생년월일을 알려 주세요'), lead: msg('선택 항목이에요. 비워 두고 넘어가도 돼요.') },
  { title: msg('시작하기 전에'), lead: msg('MIRO를 이용하려면 필수 항목에 동의해 주세요.') },
] as const

const GENDERS = [{ value: 'female', label: msg('여성') }, { value: 'male', label: msg('남성') }, { value: 'none', label: msg('밝히지 않음') }] as const
const TASTE_OPTIONS: Array<{ value: Taste; label: string; sub: string }> = [
  { value: 'bl', label: 'BL', sub: msg('남자와 남자의 이야기') },
  { value: 'hl', label: 'HL', sub: msg('남자와 여자의 이야기') },
]
const TERMS = [
  { key: 'terms', title: msg('[필수] 서비스 이용약관'), href: '/terms/service' },
  { key: 'privacy', title: msg('[필수] 개인정보 처리방침'), href: '/terms/privacy' },
  { key: 'ai', title: msg('[필수] AI 생성 콘텐츠 안내'), href: '/terms/ai' },
  { key: 'marketing', title: msg('[선택] 이벤트·혜택 알림 받기'), sub: msg('광고성 정보 수신 동의') },
  { key: 'nightMarketing', title: msg('[선택] 야간 혜택 알림 받기'), sub: msg('오후 9시 ~ 다음날 오전 8시에도 받아요') },
] as const

/**
 * 첫 로그인 온보딩. 한 화면에 한 질문 — 위에 뒤로·진행 막대·n/6, 아래에 다음 버튼 하나.
 * 첫 질문은 언어다 — 고르는 순간 화면이 그 언어로 바뀌고(쿠키), 나머지 질문은 그 언어로 묻는다.
 * 값은 이 컴포넌트가 들고 있다가 마지막 단계에서 숨은 칸으로 한 번에 보낸다. 서버가 틀린 칸을 알려 주면 그 단계로 돌아간다.
 */
export function OnboardingForm() {
  const reduce = useReducedMotion()
  const t = useT()
  const language = useLanguage()
  const [switching, startSwitch] = useTransition()
  const [state, action] = useActionState(finishOnboarding, null)
  const [step, setStep] = useState(1)
  const [nickname, setNickname] = useState('')
  const [gender, setGender] = useState('')
  const [tastes, setTastes] = useState<Taste[]>([])
  const [birthDate, setBirthDate] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  // 단계가 바뀌면 새 제목이 나타날 때 초점을 옮긴다 — 스크린 리더가 새 질문부터 읽는다(첫 화면은 닉네임 칸이 초점).
  const focusHeading = useRef(false)

  useEffect(() => { if (state) { focusHeading.current = true; setStep(state.step); setError(state.error) } }, [state])

  const go = (n: number) => { focusHeading.current = true; setError(null); setStep(n) }
  const nameOk = nickname.trim().length > 0
  // 단계별로 '다음' 을 누를 수 있는가.
  const ready: Record<number, boolean> = { 1: true, 2: nameOk, 3: !!gender, 4: tastes.length > 0 }
  const requiredOk = REQUIRED_TERMS.every((k) => checked[k])
  const allOn = TERMS.every((t) => checked[t.key])
  const agreeAll = (on: boolean) => setChecked(Object.fromEntries(TERMS.map((t) => [t.key, on])))
  const copy = COPY[step - 1]!
  // 고르면 화면만 그 언어로 바뀌고, 넘어가는 건 '다음' 으로(2026-09-30 요청).
  const pickLanguage = (l: Language) => { if (l !== language) startSwitch(() => setLanguage(l)) }

  return (
    <form action={action} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && step < ONBOARDING_STEPS) e.preventDefault() }}>
      <input type="hidden" name="language" value={language} />
      <input type="hidden" name="nickname" value={nickname} />
      <input type="hidden" name="gender" value={gender} />
      {tastes.map((t) => <input key={t} type="hidden" name="taste" value={t} />)}
      <input type="hidden" name="birthDate" value={birthDate} />
      {TERMS.map((t) => checked[t.key] && <input key={t.key} type="hidden" name={t.key} value="on" />)}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
        <button type="button" onClick={() => go(step - 1)} aria-label={t('이전 단계')} disabled={step === 1} className="hit"
          style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, marginLeft: -6, padding: 0, background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-text-primary)', visibility: step === 1 ? 'hidden' : 'visible' }}>
          <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <div role="progressbar" aria-label={t('온보딩 진행')} aria-valuemin={1} aria-valuemax={ONBOARDING_STEPS} aria-valuenow={step}
          style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--color-surface-2)', overflow: 'hidden' }}>
          <motion.div initial={false} animate={{ width: `${(step / ONBOARDING_STEPS) * 100}%` }} transition={reduce ? { duration: 0 } : spring.default}
            style={{ height: '100%', background: 'var(--color-text-primary)' }} />
        </div>
        <span className="t-caption" aria-hidden style={{ minWidth: 28, textAlign: 'right', color: 'var(--color-text-tertiary)' }}>{step}/{ONBOARDING_STEPS}</span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: -16, transition: { duration: duration.fast, ease: ease.exit } }}
          transition={{ duration: duration.normal, ease: ease.enter }}>
          <header className="stack" style={{ gap: 6, margin: 'var(--space-6) 0 var(--space-6)' }}>
            <h1 ref={(el) => { if (el && focusHeading.current) { focusHeading.current = false; el.focus() } }} tabIndex={-1} className="t-title-1" style={{ outline: 'none' }}>{t(copy.title)}</h1>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t(copy.lead)}</p>
          </header>

          {step === 1 && (
            <div role="radiogroup" aria-label={t('언어')} className="stack" style={{ gap: 8 }}>
              {/* 언어 이름은 번역하지 않는다 — 자기 언어를 그 언어의 글자로 알아본다. */}
              {(Object.keys(LANGUAGES) as Language[]).map((l) => (
                <Option key={l} role="radio" selected={language === l} title={LANGUAGES[l]} lang={l} center
                  onClick={() => pickLanguage(l)} />
              ))}
            </div>
          )}

          {step === 2 && <NicknameField value={nickname} onChange={setNickname} onEnter={() => nameOk && go(3)} invalid={!!error} />}

          {step === 3 && (
            <div role="radiogroup" aria-label={t('성별')} className="stack" style={{ gap: 8 }}>
              {GENDERS.map((g) => (
                <Option key={g.value} role="radio" selected={gender === g.value} title={t(g.label)} center icon={<GenderIcon kind={g.value} />} onClick={() => setGender(g.value)} />
              ))}
            </div>
          )}

          {step === 4 && (
            <div role="group" aria-label={t('좋아하는 관계')} className="stack" style={{ gap: 8 }}>
              {TASTE_OPTIONS.map((o) => (
                <Option key={o.value} role="checkbox" selected={tastes.includes(o.value)} title={o.label} sub={t(o.sub)}
                  onClick={() => setTastes((cur) => cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value])} />
              ))}
            </div>
          )}

          {step === 5 && <BirthDateField value={birthDate} onChange={setBirthDate} invalid={!!error} />}

          {step === 6 && (
            <div className="stack" style={{ gap: 2 }}>
              <CheckRow checked={allOn} onToggle={() => agreeAll(!allOn)} title={t('전체 동의')} strong />
              <hr style={{ border: 0, borderTop: '1px solid var(--color-border)', margin: '6px 0' }} />
              {TERMS.map((item) => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center' }}>
                  <CheckRow checked={!!checked[item.key]} onToggle={() => setChecked((c) => ({ ...c, [item.key]: !c[item.key] }))}
                    title={t(item.title)} sub={'sub' in item ? t(item.sub) : undefined} />
                  {'href' in item && (
                    <a href={item.href} target="_blank" rel="noreferrer" aria-label={t('{title} 전문 보기', { title: t(item.title) })}
                      style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, flexShrink: 0, color: 'var(--color-text-tertiary)' }}>
                      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && <p role="alert" className="t-caption" style={{ marginTop: 12, color: 'var(--color-danger)' }}>{t(error)}</p>}

          <div className="stack" style={{ gap: 4, marginTop: 'auto', paddingTop: 'var(--space-6)' }}>
            {/* 고르는 단계는 모두 같은 '다음' 하나로 넘어간다 — 고르기만으로는 넘어가지 않는다(2026-09-30 요청). */}
            {step <= 4 && <Button type="button" variant="primary" size="lg" full disabled={!ready[step] || switching} onClick={() => go(step + 1)}>{t('다음')}</Button>}
            {step === 5 && <>
              <Button type="button" variant="primary" size="lg" full disabled={!birthDate} onClick={() => go(6)}>{t('다음')}</Button>
              <Button type="button" variant="ghost" size="sm" full onClick={() => { setBirthDate(''); go(6) }}>{t('건너뛰기')}</Button>
            </>}
            {step === 6 && <>
              <SubmitButton variant="primary" size="lg" full disabled={!requiredOk}>{t('시작하기')}</SubmitButton>
              {/* 한 번에 모두 켜고 바로 제출 — 숨은 칸이 먼저 그려져야 폼 값에 들어가므로 동기로 그린다.
                  누르는 순간 사라지면 제출이 취소되므로 늘 둔다. */}
              <SubmitButton variant="ghost" size="lg" full onClick={() => flushSync(() => agreeAll(true))}>{t('전체 동의하고 시작하기')}</SubmitButton>
            </>}
          </div>
        </motion.div>
      </AnimatePresence>
    </form>
  )
}

function NicknameField({ value, onChange, onEnter, invalid }: { value: string; onChange: (v: string) => void; onEnter: () => void; invalid: boolean }) {
  const t = useT()
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 52, padding: '0 14px', ...box(focused, invalid) }}>
      <input aria-label={t('닉네임')} value={value} maxLength={PERSONA_LIMITS.name} autoFocus autoComplete="nickname" placeholder={t('예) 지우')}
        onChange={(e) => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter() }}
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-lg)' }} />
      <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{[...value].length}/{PERSONA_LIMITS.name}</span>
    </div>
  )
}

function BirthDateField({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid: boolean }) {
  const t = useT()
  const [focused, setFocused] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  return (
    <label className="stack" style={{ gap: 8 }}>
      <span className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>{t('생년월일')} <span className="t-caption" style={{ fontWeight: 'var(--weight-regular)' }}>{t('선택')}</span></span>
      {/* 기기의 날짜 선택기를 그대로 쓴다 — 어두운 화면에 맞게 color-scheme 만 맞춘다. */}
      <input type="date" value={value} min="1900-01-01" max={today} onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ minHeight: 52, padding: '0 14px', colorScheme: 'dark', color: value ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 'var(--font-body-lg)', fontFamily: 'inherit', outline: 'none', ...box(focused, invalid) }} />
    </label>
  )
}

/** 큰 선택 칸. 고르면 한 단 밝은 바탕과 흰 체크(2026-09-30 요청) — 색만이 아니라 체크 모양으로도 갈린다. */
function Option({ role, selected, title, sub, lang, center, icon, onClick }: { role: 'radio' | 'checkbox'; selected: boolean; title: string; sub?: string; lang?: string; center?: boolean; icon?: React.ReactNode; onClick: () => void }) {
  const reduce = useReducedMotion()
  return (
    <motion.button type="button" role={role} aria-checked={selected} onClick={onClick} lang={lang}
      whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 60, padding: center ? '12px 44px' : '12px 16px', textAlign: center ? 'center' : 'left', cursor: 'pointer',
        borderRadius: 'var(--radius-lg)', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        background: selected ? 'var(--color-surface-2)' : 'var(--color-surface-1)',
        // 고른 칸은 테두리 없이 한 단 밝은 바탕과 흰 체크로만 갈린다(2026-09-30 요청). 굵기는 그대로 둬 칸이 움직이지 않게.
        border: `1px solid ${selected ? 'transparent' : 'var(--color-border)'}`,
        transition: 'background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard)',
      }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: icon ? 'center' : 'baseline', justifyContent: center ? 'center' : undefined, gap: 10, flexWrap: 'wrap' }}>
        {icon}
        <span className="t-body-lg" style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>{title}</span>
        {sub && <span className="t-caption">{sub}</span>}
      </span>
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        // 가운데 정렬일 때 체크는 오른쪽 끝에 띄워 둔다 — 글자가 정확히 가운데에 오게.
        style={{ flexShrink: 0, stroke: selected ? 'var(--color-white)' : 'transparent', ...(center ? { position: 'absolute', right: 16 } : {}) }}><path d="M20 6 9 17l-5-5" /></svg>
    </motion.button>
  )
}

/** 체크 표시 + 항목명이 하나의 버튼. 꺼짐 = 빈 박스, 켜짐 = 흰 체크 (옛 약관 화면과 같은 모양). */
function CheckRow({ checked, onToggle, title, sub, strong }: { checked: boolean; onToggle: () => void; title: string; sub?: string; strong?: boolean }) {
  const reduce = useReducedMotion()
  return (
    <motion.button type="button" role="checkbox" aria-checked={checked} onClick={onToggle}
      whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}
      style={{
        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        background: 'transparent', border: 0, padding: '10px 4px', minHeight: 48, cursor: 'pointer',
        borderRadius: 'var(--radius-sm)', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}>
      <motion.svg aria-hidden viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        animate={{ stroke: checked ? 'var(--color-white)' : 'var(--color-border-strong)', scale: checked && !reduce ? [1, 1.18, 1] : 1 }}
        transition={{ duration: reduce ? 0 : 0.34, ease: ease.enter, times: [0, 0.45, 1] }}
        style={{ width: 20, height: 20, flexShrink: 0 }}>
        {checked ? <path d="M20 6 9 17l-5-5" /> : <rect x="4" y="4" width="16" height="16" rx="3" strokeWidth="2" />}
      </motion.svg>
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span className="t-body" style={{ color: checked ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontWeight: strong ? 'var(--weight-semibold)' : undefined }}>{title}</span>
        {sub && <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</span>}
      </span>
    </motion.button>
  )
}

/**
 * 성별 그림(직접 그린 것 — 이모지는 기기마다 모양이 달라서 쓰지 않는다). 바탕 없이 사람 하나:
 * 여성은 치마(사다리꼴), 남성은 어깨가 각진 몸, 밝히지 않음은 둥근 몸에 물음표.
 */
/** 성별마다 한 색(2026-09-30 요청) — 여성 분홍, 남성 파랑, 밝히지 않음 회색. 이 화면에서만 쓰는 색이라 토큰으로 올리지 않았다. */
const GENDER_COLOR = { female: '#F472B6', male: '#60A5FA', none: 'var(--color-text-tertiary)' } as const
function GenderIcon({ kind }: { kind: 'female' | 'male' | 'none' }) {
  return (
    <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, flexShrink: 0, color: GENDER_COLOR[kind] }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="3" />
        {kind === 'female' && <><path d="M9.6 9.5h4.8l3.1 8H6.5z" /><rect x="9.4" y="17" width="1.9" height="5" rx=".95" /><rect x="12.7" y="17" width="1.9" height="5" rx=".95" /></>}
        {kind === 'male' && <><rect x="7.5" y="9.5" width="9" height="7.5" rx="1.6" /><rect x="8.9" y="16" width="2.2" height="6" rx="1.1" /><rect x="12.9" y="16" width="2.2" height="6" rx="1.1" /></>}
        {kind === 'none' && <><rect x="7.5" y="9.5" width="9" height="12.5" rx="4.5" opacity=".35" /><text x="12" y="19.4" textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="system-ui, sans-serif">?</text></>}
      </svg>
    </span>
  )
}
