'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { LANGUAGES, PERSONA_LIMITS, type Language } from '@miro/domain'
import { Button } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { box } from '@/app/(main)/create/form-parts'
import { duration, ease, press, spring } from '@/lib/motion/tokens'
import { ONBOARDING_STEPS, REQUIRED_TERMS, type Taste } from '@/lib/onboarding-options'
import { loadMessages, useLanguage, useSwitchLanguage, useT } from '@/lib/i18n/client'
import { msg } from '@/lib/i18n'
import { useRouter } from 'next/navigation'
import { checkNickname, finishOnboarding } from './actions'
import { markPushAsked, settingsPath, subscribeToPush } from '@/components/push-subscribe'

const COPY = [
  { title: msg('언어를 골라 주세요'), lead: msg('메뉴·버튼 같은 앱 화면과 캐릭터가 보내는 대화·문자·전화가 모두 이 언어로 바뀌어요. 캐릭터 이름과 작성자가 쓴 소개글은 원래 언어 그대로 보여요. 마이페이지 > 설정 > 언어에서 언제든 바꿀 수 있어요.') },
  { title: msg('어떻게 불러 드릴까요?'), lead: msg('캐릭터가 대화에서 부를 닉네임이에요. 마이페이지에서 언제든 바꿀 수 있어요.') },
  { title: msg('성별을 알려 주세요'), lead: msg('캐릭터가 나를 알아보는 데 쓰여요.') },
  { title: msg('좋아하는 관계를 모두 골라 주세요'), lead: msg('취향에 맞는 캐릭터를 추천할 때 써요.') },
  { title: msg('생년월일을 알려 주세요'), lead: msg('태어난 날을 숫자 8자리로 입력해 주세요. 예) 19980314') },
  { title: msg('시작하기 전에'), lead: msg('MIRO를 이용하려면 필수 항목에 동의해 주세요.') },
] as const

const GENDERS = [{ value: 'female', label: msg('여성') }, { value: 'male', label: msg('남성') }, { value: 'none', label: msg('밝히지 않음') }] as const
const TASTE_OPTIONS: Array<{ value: Taste; label: string; sub: string }> = [
  { value: 'bl', label: 'BL', sub: msg('남자와 남자의 이야기') },
  { value: 'hl', label: 'HL', sub: msg('남자와 여자의 이야기') },
  { value: 'gl', label: 'GL', sub: msg('여자와 여자의 이야기') },
]
const TERMS = [
  { key: 'terms', title: msg('[필수] 서비스 이용약관'), href: '/terms/service' },
  { key: 'privacy', title: msg('[필수] 개인정보 처리방침'), href: '/terms/privacy' },
  { key: 'ai', title: msg('[필수] AI 생성 콘텐츠 안내'), href: '/terms/ai' },
  // 브라우저 알림 권한 — 필수(2026-10-01 결정, 예외 없음). 시작하기를 누를 때 묻고, 허용·구독까지 끝나야 가입이 끝난다.
  { key: 'push', title: msg('[필수] 캐릭터 알림 받기'), sub: msg('캐릭터가 먼저 보내는 문자·전화를 알림으로 받아요') },
  { key: 'marketing', title: msg('[선택] 이벤트·혜택 알림 받기'), sub: msg('광고성 정보 수신 동의'), href: '/terms/marketing' },
  { key: 'nightMarketing', title: msg('[선택] 야간 혜택 알림 받기'), sub: msg('오후 9시 ~ 다음날 오전 8시에도 받아요'), href: '/terms/night-marketing' },
] as const

/** '다음' 은 작게(2026-09-30 요청): 높이 56 → 44(터치 영역 최소), 글자 17 → 14. 잠겨 있을 땐 옅은 주황(.btn-next). */
const NEXT_BUTTON: React.CSSProperties = { minHeight: 44, padding: '4px 24px', fontSize: 14 }

/**
 * 첫 로그인 온보딩. 한 화면에 한 질문 — 위에 뒤로·진행 막대·n/6, 아래에 다음 버튼 하나.
 * 첫 질문은 언어다 — 고르는 순간 화면이 그 언어로 바뀌고(쿠키), 나머지 질문은 그 언어로 묻는다.
 * 값은 이 컴포넌트가 들고 있다가 마지막 단계에서 숨은 칸으로 한 번에 보낸다. 서버가 틀린 칸을 알려 주면 그 단계로 돌아간다.
 */
export function OnboardingForm() {
  const reduce = useReducedMotion()
  const t = useT()
  const language = useLanguage()
  // 언어도 직접 골라야 '다음' 이 열린다 — 처음엔 아무것도 골라져 있지 않다(2026-09-30 요청). 화면은 기기 언어로 시작한다.
  const [languagePicked, setLanguagePicked] = useState(false)
  const [state, action] = useActionState(finishOnboarding, null)
  const [step, setStep] = useState(1)
  const [nickname, setNickname] = useState('')
  const [gender, setGender] = useState('')
  const [tastes, setTastes] = useState<Taste[]>([])
  const [birthDate, setBirthDate] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  // 알림이 차단된 기기 — 이 브라우저에서 다시 켜는 길(오류 아래 한 줄).
  const [pushPath, setPushPath] = useState<string | null>(null)
  // '캐릭터 알림 받기' 권한 창이 떠 있는 동안 — 시작하기를 잠가 둔다(넘어가 버리면 권한 창이 닫힌다).
  const [asking, setAsking] = useState(false)
  // 이 기기에서 알림이 허용됐는가 — 아래 버튼의 '알림 허용하기'(또는 알림 줄·전체 동의)로 허용해야 그 버튼이 '시작하기'로 바뀐다(2026-10-01 요청).
  // 알림 키가 없는 환경(테스트 등)은 물을 수 없으니 처음부터 열려 있다.
  const [pushGranted, setPushGranted] = useState(!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  const pushHandled = useRef(false)
  // 단계가 바뀌면 새 제목이 나타날 때 초점을 옮긴다 — 스크린 리더가 새 질문부터 읽는다(첫 화면은 닉네임 칸이 초점).
  const focusHeading = useRef(false)

  useEffect(() => { if (state) { focusHeading.current = true; setStep(state.step); setError(state.error) } }, [state])

  const go = (n: number) => { focusHeading.current = true; setError(null); setPushPath(null); setStep(n) }
  const router = useRouter()
  // 닉네임을 넘기면 안전 검사를 뒤에서 미리 한다. 막히면 닉네임 단계로 돌아가 이유를 보인다.
  const leaveNickname = () => {
    const name = nickname
    void checkNickname(name).then((r) => { if (!r.ok) { focusHeading.current = true; setStep(2); setError(r.error) } }).catch(() => {})
    go(3)
  }
  // 약관 단계가 열리면 다음 화면(홈)을 미리 받아 둔다 — '시작하기' 뒤에 바로 넘어가게.
  useEffect(() => { if (step === ONBOARDING_STEPS) router.prefetch('/home') }, [step, router])
  const nameOk = nickname.trim().length > 0
  // 단계별로 '다음' 을 누를 수 있는가.
  const ready: Record<number, boolean> = { 1: languagePicked, 2: nameOk, 3: !!gender, 4: tastes.length > 0 }
  const requiredOk = REQUIRED_TERMS.every((k) => checked[k])
  const allOn = TERMS.every((t) => checked[t.key])
  const agreeAll = (on: boolean) => setChecked(Object.fromEntries(TERMS.map((t) => [t.key, on])))
  const copy = COPY[step - 1]!
  const fail = (why: string, path: string | null = null) => { focusHeading.current = true; setError(why); setPushPath(path) }
  /**
   * 브라우저 알림 권한을 묻는다. 허용이면 true. 웹 알림이 없는 브라우저(홈 화면에 추가하지 않은 iPhone, 카톡·인스타 안 브라우저 등)는
   * 이유를 보이고 false. 거절·차단이면 이유를 보이고 false — 차단은 브라우저가 다시 묻게 두지 않아서, '알림 허용하기'를 눌렀을 때(howTo)
   * 이 브라우저에서 켜는 길을 보인다. 알림 키가 없는 환경(테스트 등)은 물을 수 없으니 true.
   * 가입 뒤 알림 시트는 다시 뜨지 않는다(markPushAsked). 권한 창은 누른 순간에만 뜰 수 있어서 첫 await 전에 requestPermission 을 부른다.
   */
  const askPermission = async (howTo = false): Promise<boolean> => {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return true
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      const ua = navigator.userAgent
      const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      fail(ios ? msg('iPhone은 Safari에서 공유 → 홈 화면에 추가한 뒤, 홈 화면의 MIRO로 열어 시작해 주세요. 알림은 그 앱에서만 받을 수 있어요.')
        : msg('이 브라우저에서는 알림을 받을 수 없어요. 크롬이나 사파리에서 열어 주세요.'))
      return false
    }
    const blocked = (permission: NotificationPermission) => {
      setPushGranted(false); fail(msg('알림을 허용해야 시작할 수 있어요.'), howTo && permission === 'denied' ? settingsPath() : null); return false
    }
    if (Notification.permission === 'denied') return blocked('denied')
    markPushAsked()
    if (Notification.permission === 'granted') { setPushGranted(true); return true }
    setAsking(true); setError(null); setPushPath(null)
    const permission = await Notification.requestPermission().catch((): NotificationPermission => 'default')
    setAsking(false)
    if (permission !== 'granted') return blocked(permission)
    setPushGranted(true)
    return true
  }
  // '알림 허용하기' — 아직 정하지 않았으면 권한 창을 다시 띄우고, 설정에서 켠 뒤라면 바로 통과. 허용되면 알림 줄을 켠다.
  const allowPush = () => { void askPermission(true).then((ok) => { if (ok) { setChecked((c) => ({ ...c, push: true })); setError(null); setPushPath(null) } }) }
  // '캐릭터 알림 받기'를 켜는 순간(그 줄·전체 동의) 그 자리에서 권한을 묻는다(2026-10-01 요청). 허용하지 않으면 다시 끈다.
  const turnOnPush = () => { void askPermission().then((ok) => { if (!ok) setChecked((c) => ({ ...c, push: false })) }) }
  const toggleTerm = (key: string) => {
    const on = !checked[key]
    setChecked((c) => ({ ...c, [key]: on }))
    if (key === 'push' && on) turnOnPush()
  }
  /**
   * 시작하기 — 캐릭터 알림은 필수다(2026-10-01 결정, 예외 없음). 시작하기는 알림이 허용된 뒤에만 열리고, 여기서 구독까지 끝나야 제출한다.
   * 권한은 한 번 더 확인한다(그사이 설정에서 끈 경우).
   */
  const askPushThenSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (pushHandled.current || !vapid) return
    e.preventDefault()
    const form = e.currentTarget, submitter = (e.nativeEvent as SubmitEvent).submitter
    void askPermission()
      .then(async (granted) => {
        if (!granted) return false
        setAsking(true)
        const subscribed = await Promise.race([subscribeToPush(vapid).catch(() => false), new Promise<boolean>((done) => setTimeout(() => done(false), 8000))])
        if (!subscribed) fail(msg('알림을 켜지 못했어요. 잠시 뒤 다시 눌러 주세요.'))
        return subscribed
      })
      .catch(() => { fail(msg('알림을 켜지 못했어요. 잠시 뒤 다시 눌러 주세요.')); return false })
      // 잠금을 먼저 풀어야(동기로 그림) 잠긴 버튼으로 제출하지 않는다.
      .then((ok) => { flushSync(() => setAsking(false)); if (ok) { pushHandled.current = true; form.requestSubmit(submitter) } })
  }
  // 고르면 화면만 그 언어로 바뀌고, 넘어가는 건 '다음' 으로(2026-09-30 요청).
  const switchLanguage = useSwitchLanguage()
  const pickLanguage = (l: Language) => {
    setLanguagePicked(true)
    if (l !== language) void switchLanguage(l)
  }
  // 언어 단계가 열리면 다른 언어 사전을 미리 받아 둔다 — 누르는 순간 바로 바뀌게.
  useEffect(() => { for (const l of Object.keys(LANGUAGES) as Language[]) void loadMessages(l) }, [])

  return (
    <form action={action} onSubmit={askPushThenSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
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
                <Option key={l} role="radio" selected={languagePicked && language === l} dimmed={languagePicked && language !== l} title={LANGUAGES[l]} lang={l} center
                  onClick={() => pickLanguage(l)} />
              ))}
            </div>
          )}

          {step === 2 && <NicknameField value={nickname} onChange={setNickname} onEnter={() => nameOk && leaveNickname()} invalid={!!error} />}

          {step === 3 && (
            <div role="radiogroup" aria-label={t('성별')} className="stack" style={{ gap: 8 }}>
              {GENDERS.map((g) => (
                <Option key={g.value} role="radio" selected={gender === g.value} dimmed={!!gender && gender !== g.value} title={t(g.label)} center icon={<GenderIcon kind={g.value} />} onClick={() => setGender(g.value)} />
              ))}
            </div>
          )}

          {step === 4 && (
            <div role="group" aria-label={t('좋아하는 관계')} className="stack" style={{ gap: 8 }}>
              {TASTE_OPTIONS.map((o) => (
                <Option key={o.value} role="checkbox" selected={tastes.includes(o.value)} dimmed={tastes.length > 0 && !tastes.includes(o.value)} center title={o.label} sub={t(o.sub)} icon={<TasteIcon kind={o.value} />}
                  onClick={() => setTastes((cur) => cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value])} />
              ))}
            </div>
          )}

          {step === 5 && <BirthDateField value={birthDate} onChange={setBirthDate} onEnter={() => go(6)} invalid={!!error} />}

          {step === 6 && (
            // 약관은 글자 줄로 — 토스 약관 동의 화면처럼(2026-09-30 요청): 위에 큰 '전체 동의'(동그라미 체크), 아래에 항목 줄(작은 체크 + 글자 + 보기 화살표).
            <div>
              <TermsCheck all checked={allOn} title={t('전체 동의')} onToggle={() => { agreeAll(!allOn); if (!allOn && !checked.push) turnOnPush() }} />
              <hr style={{ border: 0, borderTop: '1px solid var(--color-border)', margin: '8px 0' }} />
              {TERMS.map((item) => (
                <TermsCheck key={item.key} checked={!!checked[item.key]} title={t(item.title)} sub={'sub' in item ? t(item.sub) : undefined}
                  onToggle={() => toggleTerm(item.key)}
                  link={'href' in item ? { href: item.href, label: t('{title} 전문 보기', { title: t(item.title) }) } : undefined} />
              ))}
            </div>
          )}

          {error && <p role="alert" className="t-caption" style={{ marginTop: 12, color: 'var(--color-danger)' }}>{t(error)}</p>}
          {pushPath && <p className="t-caption" style={{ marginTop: 4, color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)', wordBreak: 'keep-all' }}>{t(pushPath)}</p>}

          <div className="stack" style={{ gap: 4, marginTop: 'auto', paddingTop: 'var(--space-6)' }}>
            {/* 고르는 단계는 모두 같은 '다음' 하나로 넘어간다 — 고르기만으로는 넘어가지 않는다(2026-09-30 요청). */}
            {step <= 4 && <Button type="button" variant="primary" size="lg" full className="btn-next" style={NEXT_BUTTON} disabled={!ready[step]} onClick={() => (step === 2 ? leaveNickname() : go(step + 1))}>{t('다음')}</Button>}
            {step === 5 && <>
              <Button type="button" variant="primary" size="lg" full className="btn-next" style={NEXT_BUTTON} disabled={!birthDate} onClick={() => go(6)}>{t('다음')}</Button>
              <Button type="button" variant="ghost" size="sm" full onClick={() => { setBirthDate(''); go(6) }}>{t('건너뛰기')}</Button>
            </>}
            {step === 6 && (
              // 버튼 하나(2026-10-01 요청): '알림 허용하기'로 시작해, 알림이 허용되면 토스처럼 주황으로 차오르며 글자가 위로 넘어가 '시작하기'가 된다.
              // 허용 전에는 눌러도 제출하지 않고 권한을 묻는다(알림 줄·전체 동의로 허용해도 똑같이 바뀐다).
              <motion.div initial={false} animate={{ scale: pushGranted && !reduce ? [1, 1.03, 1] : 1 }} transition={{ duration: 0.4, ease: ease.standard }}>
                <SubmitButton variant={pushGranted ? 'primary' : 'secondary'} size="lg" full disabled={asking || (pushGranted && !requiredOk)}
                  onClick={(e) => { if (!pushGranted) { e.preventDefault(); allowPush() } }}
                  style={{ transition: 'background-color 360ms var(--ease-standard), color 360ms var(--ease-standard), border-color 360ms var(--ease-standard)' }}>
                  {/* 글자가 넘어가는 창 — 두 글자를 같은 칸에 겹쳐(가운데 맞춤) 위아래로만 자른다. 옆으로는 자르지 않아 긴 글자도 온전히 빠진다. */}
                  <span style={{ display: 'inline-grid', justifyItems: 'center', clipPath: 'inset(0 -64px)' }}>
                    <AnimatePresence initial={false}>
                      <motion.span key={pushGranted ? 'start' : 'allow'} initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-100%', opacity: 0 }}
                        transition={reduce ? { duration: 0 } : spring.default} style={{ gridArea: '1 / 1', whiteSpace: 'nowrap' }}>
                        {pushGranted ? t('시작하기') : t('알림 허용하기')}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </SubmitButton>
              </motion.div>
            )}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 18px', ...box(focused, invalid), borderRadius: 999 }}>
      <input aria-label={t('닉네임')} value={value} maxLength={PERSONA_LIMITS.name} autoFocus autoComplete="nickname" placeholder={t('예) 지우')}
        onChange={(e) => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter() }}
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 14 }} />
      <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{[...value].length}/{PERSONA_LIMITS.name}</span>
    </div>
  )
}

/**
 * 생년월일 — 숫자만 치면 점이 알아서 들어간다(19980314 → 1998.03.14). 휴대폰은 숫자 자판.
 * 달력 선택기는 몇 십 년 전 해를 고르려면 한참 넘겨야 해서 바꿨다(2026-09-30 요청). 8자리가 되면 바로 확인해
 * 있을 수 없는 날짜면 그 자리에서 알려 주고, 맞으면 '다음' 이 열린다. 값은 'YYYY-MM-DD' 로 넘긴다.
 */
function BirthDateField({ value, onChange, onEnter, invalid }: { value: string; onChange: (v: string) => void; onEnter: () => void; invalid: boolean }) {
  const t = useT()
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(value ? value.replaceAll('-', '.') : '')
  const digits = text.replace(/\D/g, '')
  const wrong = digits.length === 8 && !value

  function type(raw: string) {
    let d = raw.replace(/\D/g, '').slice(0, 8)
    // 점을 지우면 숫자는 그대로라 다시 점이 붙는다 — 글자가 줄었으면 앞 숫자 하나를 함께 지운다.
    if (raw.length < text.length && d === digits) d = d.slice(0, -1)
    setText(d.slice(0, 4) + (d.length > 4 ? '.' + d.slice(4, 6) : '') + (d.length > 6 ? '.' + d.slice(6) : ''))
    onChange(d.length === 8 && realDate(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : '')
  }

  return (
    <label className="stack" style={{ gap: 8 }}>
      <span className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>{t('생년월일')} <span className="t-caption" style={{ fontWeight: 'var(--weight-regular)' }}>{t('선택')}</span></span>
      <input value={text} onChange={(e) => type(e.target.value)} inputMode="numeric" enterKeyHint="next" autoComplete="bday" autoFocus placeholder="YYYY.MM.DD" maxLength={10}
        aria-invalid={wrong || invalid} onKeyDown={(e) => { if (e.key === 'Enter' && value) onEnter() }}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ minHeight: 44, padding: '0 18px', color: 'var(--color-text-primary)', fontSize: 14, fontFamily: 'inherit', letterSpacing: '0.02em', outline: 'none',
          ...box(focused, wrong || invalid), borderRadius: 999 }} />
      {wrong && <span role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t('생년월일을 다시 확인해 주세요.')}</span>}
    </label>
  )
}

/** 8자리 숫자가 실제로 있는 날짜이고 1900-01-01 ~ 오늘 사이인가(서버 parseOnboarding 과 같은 기준). */
function realDate(d: string): boolean {
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso && iso >= '1900-01-01' && date <= new Date()
}

/** 큰 선택 칸. 고르면 한 단 밝은 바탕과 흰 체크(2026-09-30 요청) — 색만이 아니라 체크 모양으로도 갈린다. */
function Option({ role, selected, dimmed, title, sub, lang, center, icon, onClick }: { role: 'radio' | 'checkbox'; selected: boolean; dimmed?: boolean; title: string; sub?: string; lang?: string; center?: boolean; icon?: React.ReactNode; onClick: () => void }) {
  const reduce = useReducedMotion()
  return (
    <motion.button type="button" role={role} aria-checked={selected} onClick={onClick} lang={lang}
      whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 50, padding: center ? '8px 44px' : '8px 16px', textAlign: center ? 'center' : 'left', cursor: 'pointer',
        borderRadius: 'var(--radius-lg)', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        background: selected ? 'var(--color-surface-2)' : 'var(--color-surface-1)',
        // 고른 칸은 테두리 없이 한 단 밝은 바탕과 흰 체크로만 갈린다(2026-09-30 요청). 굵기는 그대로 둬 칸이 움직이지 않게.
        border: `1px solid ${selected ? 'transparent' : 'var(--color-border)'}`,
        // 무리 안에서 하나라도 골랐으면 안 고른 칸은 옅게 — 고른 것이 한눈에 보이게(2026-09-30 요청). 누를 수는 그대로다.
        opacity: dimmed ? 0.45 : 1,
        transition: 'background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard), opacity var(--motion-fast) var(--ease-standard)',
      }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: icon ? 'center' : 'baseline', justifyContent: center ? 'center' : undefined, gap: 10, flexWrap: 'wrap' }}>
        {/* 가운데 정렬은 글자 기준 — 그림은 글자 왼쪽 옆에 띄워 둬서 가운데를 밀지 않는다(2026-09-30 요청). */}
        {/* 글자는 작게(2026-09-30 요청): 제목 17 → 14, 설명 13 → 12. */}
        <span style={{ position: 'relative', fontSize: 14, lineHeight: 1.4, fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>
          {icon && <span style={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 8, display: 'flex' }}>{icon}</span>}
          {title}
        </span>
        {sub && <span className="t-caption" style={{ fontSize: 'var(--font-micro)' }}>{sub}</span>}
      </span>
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        // 가운데 정렬일 때 체크는 오른쪽 끝에 띄워 둔다 — 글자가 정확히 가운데에 오게.
        style={{ flexShrink: 0, stroke: selected ? 'var(--color-white)' : 'transparent', ...(center ? { position: 'absolute', right: 16 } : {}) }}><path d="M20 6 9 17l-5-5" /></svg>
    </motion.button>
  )
}

/**
 * 약관 한 줄(토스 약관 동의 화면 방식). 전체 동의는 큰 동그라미 체크 + 굵은 글자, 항목은 작은 체크 + 글자.
 * 켜지면 체크는 주황(전체 동의는 주황 동그라미에 흰 체크, 2026-10-01 요청), 글자는 흰색 — 꺼져 있으면 옅은 회색. 문서가 있으면 오른쪽 끝에 보기 화살표(버튼 밖 링크).
 */
function TermsCheck({ all, checked, title, sub, link, onToggle }: {
  all?: boolean; checked: boolean; title: string; sub?: string; link?: { href: string; label: string }; onToggle: () => void
}) {
  const reduce = useReducedMotion()
  const on = checked ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <motion.button type="button" role="checkbox" aria-checked={checked} onClick={onToggle}
        whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: sub ? 'flex-start' : 'center', gap: all ? 12 : 10, textAlign: 'left',
          minHeight: all ? 56 : 44, padding: all ? '10px 0' : '8px 0', background: 'none', border: 0, cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
        {all ? (
          <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, flexShrink: 0, borderRadius: 13,
            background: checked ? 'var(--color-accent)' : 'var(--color-surface-3)', transition: 'background var(--motion-fast) var(--ease-standard)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={checked ? 'var(--color-accent-on)' : 'var(--color-text-tertiary)'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
        ) : (
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={checked ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0, margin: sub ? '3px 2px 0' : '0 2px', transition: 'stroke var(--motion-fast) var(--ease-standard)' }}><path d="M20 6 9 17l-5-5" /></svg>
        )}
        <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
          <span className={all ? 't-body-lg' : 't-body'} style={{ color: all ? 'var(--color-text-primary)' : on, fontWeight: all ? 'var(--weight-bold)' : undefined,
            transition: 'color var(--motion-fast) var(--ease-standard)' }}>{title}</span>
          {sub && <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</span>}
        </span>
      </motion.button>
      {link && (
        <a href={link.href} target="_blank" rel="noreferrer" aria-label={link.label}
          style={{ display: 'grid', placeItems: 'center', width: 36, height: 44, marginRight: -10, flexShrink: 0, color: 'var(--color-text-tertiary)' }}>
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </a>
      )}
    </div>
  )
}

/** 성별마다 한 색(2026-09-30 요청) — 여성 분홍, 남성 파랑, 밝히지 않음 회색. 이 화면에서만 쓰는 색이라 토큰으로 올리지 않았다. */
const GENDER_COLOR = { female: '#F472B6', male: '#60A5FA', none: 'var(--color-text-tertiary)' } as const

/**
 * 성별 기호(직접 그린 선 아이콘 — 이모지·글꼴 기호는 기기마다 모양이 달라서 쓰지 않는다, 2026-09-30 새로 그림):
 * 남성 ♂(원 + 오른쪽 위 화살표), 여성 ♀(원 + 아래 십자), 밝히지 않음 ⚲(원 + 아래 선). 색은 성별 색.
 */
function GenderSymbol({ kind, size = 20 }: { kind: 'female' | 'male' | 'none'; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, color: GENDER_COLOR[kind] }}>
      {kind === 'male' && <><circle cx="10" cy="14" r="6" /><path d="M14.3 9.7 20 4M15 4h5v5" /></>}
      {kind === 'female' && <><circle cx="12" cy="9" r="6" /><path d="M12 15v7M8.5 19h7" /></>}
      {kind === 'none' && <><circle cx="12" cy="9" r="6" /><path d="M12 15v7" /></>}
    </svg>
  )
}

function GenderIcon({ kind }: { kind: 'female' | 'male' | 'none' }) {
  return <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, flexShrink: 0 }}><GenderSymbol kind={kind} /></span>
}

/** 취향 기호 — 두 성별 기호를 살짝 겹쳐 한 쌍으로(2026-09-30 요청): BL ♂♂ 파랑, HL ♂♀ 파랑·분홍, GL ♀♀ 분홍. */
const TASTE_PAIR: Record<Taste, ['male' | 'female', 'male' | 'female']> = { bl: ['male', 'male'], hl: ['male', 'female'], gl: ['female', 'female'] }
function TasteIcon({ kind }: { kind: Taste }) {
  const [a, b] = TASTE_PAIR[kind]
  return (
    <span aria-hidden style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <GenderSymbol kind={a} size={18} />
      <span style={{ display: 'flex', marginLeft: -4 }}><GenderSymbol kind={b} size={18} /></span>
    </span>
  )
}
