'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { PERSONA_LIMITS } from '@miro/domain'
import { Button } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { box } from '@/app/(main)/create/form-parts'
import { duration, ease, press, spring } from '@/lib/motion/tokens'
import { ONBOARDING_STEPS, REQUIRED_TERMS } from '@/lib/onboarding-options'
import { useLanguage, useT } from '@/lib/i18n/client'
import type { VisitorConsent } from '@/lib/visitor-consent'
import { msg } from '@/lib/i18n'
import { useRouter } from 'next/navigation'
import { checkNickname, finishOnboarding } from './actions'
import { markPushAsked, settingsPath, subscribeToPush } from '@/components/push-subscribe'

const COPY = [
  { title: msg('어떻게 불러 드릴까요?'), lead: msg('캐릭터가 대화에서 부를 닉네임이에요. 마이페이지에서 언제든 바꿀 수 있어요.') },
  { title: msg('성별을 알려 주세요'), lead: msg('캐릭터가 나를 알아보는 데 쓰여요.') },
  { title: msg('시작하기 전에'), lead: msg('MIRO를 이용하려면 필수 항목에 동의해 주세요.') },
] as const

const GENDERS = [{ value: 'female', label: msg('여성') }, { value: 'male', label: msg('남성') }, { value: 'none', label: msg('밝히지 않음') }] as const
const TERMS = [
  // 11/13 사용자: 생년월일 대신 나이 확인 한 줄(가입 연령은 시행 중인 약관대로 — minAge).
  { key: 'age', title: msg('[필수] 만 19세 이상이에요') },
  { key: 'terms', title: msg('[필수] 서비스 이용약관'), href: '/terms/service' },
  { key: 'privacy', title: msg('[필수] 개인정보 처리방침'), href: '/terms/privacy' },
  // 국외 이전은 처리방침과 따로 받는 동의다(개인정보 보호법 제28조의8, 10/5) — 묶어서 받지 않는다.
  { key: 'transfer', title: msg('[필수] 개인정보 국외 이전 동의'), sub: msg('AI 응답 생성 등을 위해 개인정보가 국외 업체에서 처리돼요'), href: '/terms/transfer' },
  { key: 'ai', title: msg('[필수] AI 생성 콘텐츠 안내'), href: '/terms/ai' },
  // 브라우저 알림 권한 — 선택(11/13 사용자: 필수였을 때 가입 중 이탈이 컸다). 켜면 그 자리에서 권한을 묻고, 안 켜도 가입은 끝난다.
  { key: 'push', title: msg('[선택] 캐릭터 알림 받기'), sub: msg('캐릭터가 먼저 보내는 문자를 알림으로 받아요') },
  { key: 'marketing', title: msg('[선택] 이벤트·혜택 알림 받기'), sub: msg('광고성 정보 수신 동의'), href: '/terms/marketing' },
  { key: 'nightMarketing', title: msg('[선택] 야간 혜택 알림 받기'), sub: msg('오후 9시 ~ 다음날 오전 8시에도 받아요'), href: '/terms/night-marketing' },
] as const

/** '다음' 은 작게(2026-09-30 요청): 높이 56 → 44(터치 영역 최소), 글자 17 → 14. 잠겨 있을 땐 옅은 주황(.btn-next). */
// 모서리는 16px(2026-10-01 요청: 6 → 12 → 16 으로 키움) — 마지막 단계의 '알림 허용하기/시작하기'와 위의 선택 칸(Option)도 같은 값.
const NEXT_RADIUS = 16

/**
 * 첫 로그인 온보딩. 한 화면에 한 질문 — 위에 뒤로·진행 막대·n/5, 아래에 다음 버튼 하나.
 * 11/20 사용자: 언어 단계는 뺐다 — 지금 화면 언어(기기 언어·쿠키)로 저장한다. 설정의 언어 메뉴도 같은 날 뺐다.
 * 값은 이 컴포넌트가 들고 있다가 마지막 단계에서 숨은 칸으로 한 번에 보낸다. 서버가 틀린 칸을 알려 주면 그 단계로 돌아간다.
 */
export function OnboardingForm({ visitorConsent, minAge, allowChild = false }: { visitorConsent: VisitorConsent | null; minAge: 14 | 19; allowChild?: boolean }) {
  const reduce = useReducedMotion()
  const t = useT()
  const language = useLanguage()
  const [state, action] = useActionState(finishOnboarding, null)
  const [step, setStep] = useState(1)
  const [nickname, setNickname] = useState('')
  const [gender, setGender] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>(visitorConsent ? { terms: true, privacy: true, transfer: true, ai: true, marketing: visitorConsent.marketing, nightMarketing: visitorConsent.nightMarketing } : {})
  const [error, setError] = useState<string | null>(null)
  // 11/20 '만 14세 미만 — 보호자 동의'(시행일부터, allowChild). 나이 줄과 둘 중 하나만 켜진다.
  const [under14, setUnder14] = useState(false)
  useEffect(() => { if (checked.age) setUnder14(false) }, [checked.age])
  // 알림이 차단된 기기 — 이 브라우저에서 다시 켜는 길(오류 아래 한 줄).
  const [pushPath, setPushPath] = useState<string | null>(null)
  // '캐릭터 알림 받기' 권한 창이 떠 있는 동안 — 시작하기를 잠가 둔다(넘어가 버리면 권한 창이 닫힌다).
  const [asking, setAsking] = useState(false)
  // 이 기기에서 알림이 허용됐는가 — 아래 버튼의 '알림 허용하기'(또는 알림 줄·전체 동의)로 허용해야 그 버튼이 '시작하기'로 바뀐다(2026-10-01 요청).
  // 알림 키가 없는 환경(테스트 등)은 물을 수 없으니 처음부터 열려 있다.
  const [pushGranted, setPushGranted] = useState(!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  const pushHandled = useRef(false)
  // 웹 알림이 아예 없는 브라우저(카톡·인스타 안 브라우저, 홈 화면에 추가하지 않은 iPhone)는 알림 없이 가입한다(10/3 사용자 결정 — 전엔 가입이 막혔다).
  // 알림을 지원하는 브라우저에서는 지금처럼 허용·구독까지 필수다.
  const noWebPush = () => !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)
  useEffect(() => { if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && noWebPush()) setPushGranted(true) }, [])
  // 단계가 바뀌면 새 제목이 나타날 때 초점을 옮긴다 — 스크린 리더가 새 질문부터 읽는다(첫 화면은 닉네임 칸이 초점).
  const focusHeading = useRef(false)

  useEffect(() => { if (state) { focusHeading.current = true; setStep(state.step); setError(state.error) } }, [state])

  const go = (n: number) => { focusHeading.current = true; setError(null); setPushPath(null); setStep(n) }
  const router = useRouter()
  // 닉네임을 넘기면 뒤에서 미리 저장한다. 막히면 닉네임 단계로 돌아가 이유를 보인다.
  const leaveNickname = () => {
    const name = nickname
    void checkNickname(name).then((r) => { if (!r.ok) { focusHeading.current = true; setStep(1); setError(r.error) } }).catch(() => {})
    go(2)
  }
  // 약관 단계가 열리면 다음 화면(홈)을 미리 받아 둔다 — '시작하기' 뒤에 바로 넘어가게.
  useEffect(() => { if (step === ONBOARDING_STEPS) router.prefetch('/home') }, [step, router])
  const nameOk = nickname.trim().length > 0
  // 단계별로 '다음' 을 누를 수 있는가.
  const ready: Record<number, boolean> = { 1: nameOk, 2: !!gender }
  const requiredOk = REQUIRED_TERMS.every((k) => checked[k] || (k === 'age' && under14))
  const allOn = TERMS.every((t) => checked[t.key])
  const agreeAll = (on: boolean) => setChecked(Object.fromEntries(TERMS.map((t) => [t.key, on])))
  const copy = visitorConsent && step === 3 ? { title: msg('캐릭터의 연락을 받아보세요'), lead: msg('약관 동의는 완료됐어요. 이 기기에서 알림을 받을지만 설정해 주세요.') } : COPY[step - 1]!
  const fail = (why: string, path: string | null = null) => { focusHeading.current = true; setError(why); setPushPath(path) }
  /**
   * 브라우저 알림 권한을 묻는다. 허용이면 true. 웹 알림이 없는 브라우저(홈 화면에 추가하지 않은 iPhone, 카톡·인스타 안 브라우저 등)는
   * 이유를 보이고 false. 거절·차단이면 이유를 보이고 false — 차단은 브라우저가 다시 묻게 두지 않아서, '알림 허용하기'를 눌렀을 때(howTo)
   * 이 브라우저에서 켜는 길을 보인다. 알림 키가 없는 환경(테스트 등)은 물을 수 없으니 true.
   * 가입 뒤 알림 시트는 다시 뜨지 않는다(markPushAsked). 권한 창은 누른 순간에만 뜰 수 있어서 첫 await 전에 requestPermission 을 부른다.
   */
  const askPermission = async (howTo = false): Promise<boolean> => {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return true
    if (noWebPush()) return true
    const blocked = (permission: NotificationPermission) => {
      setPushGranted(false); fail(msg('알림이 꺼져 있어요. 나중에 설정에서 켤 수 있어요.'), howTo && permission === 'denied' ? settingsPath() : null); return false
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
  // '캐릭터 알림 받기'를 켜는 순간(그 줄·전체 동의) 그 자리에서 권한을 묻는다(2026-10-01 요청). 허용하지 않으면 다시 끈다.
  const turnOnPush = () => { void askPermission().then((ok) => { if (!ok) setChecked((c) => ({ ...c, push: false })) }) }
  const toggleTerm = (key: string) => {
    const on = !checked[key]
    setChecked((c) => ({ ...c, [key]: on }))
    if (key === 'push' && on) turnOnPush()
  }
  /**
   * 시작하기 — 캐릭터 알림은 선택이다(11/13, 그 전엔 필수). '캐릭터 알림 받기'를 켠 사람만 여기서 구독까지 하고, 못 켜도 가입은 끝난다.
   * 권한은 한 번 더 확인한다(그사이 설정에서 끈 경우).
   */
  const askPushThenSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    // 11/13 알림은 선택 — '캐릭터 알림 받기'를 켠 사람만 여기서 구독까지 한다. 안 켰으면 바로 가입을 끝낸다.
    if (pushHandled.current || !vapid || noWebPush() || !checked.push) return
    e.preventDefault()
    const form = e.currentTarget, submitter = (e.nativeEvent as SubmitEvent).submitter
    void askPermission()
      .then(async (granted) => {
        if (!granted) return false
        setAsking(true)
        const subscribed = await Promise.race([subscribeToPush(vapid).catch(() => false), new Promise<boolean>((done) => setTimeout(() => done(false), 8000))])
        return subscribed
      })
      .catch(() => false)
      // 잠금을 먼저 풀어야(동기로 그림) 잠긴 버튼으로 제출하지 않는다. 알림을 못 켰어도(거절·실패) 가입은 그대로 끝낸다 — 알림은 선택이다.
      .then(() => { flushSync(() => setAsking(false)); pushHandled.current = true; form.requestSubmit(submitter) })
  }

  return (
    <form action={action} onSubmit={askPushThenSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && step < ONBOARDING_STEPS) e.preventDefault() }}>
      <input type="hidden" name="language" value={language} />
      <input type="hidden" name="nickname" value={nickname} />
      <input type="hidden" name="gender" value={gender} />
      {TERMS.map((t) => checked[t.key] && <input key={t.key} type="hidden" name={t.key} value="on" />)}
      {under14 && <input type="hidden" name="under14" value="on" />}

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

          {step === 1 && <NicknameField value={nickname} onChange={setNickname} onEnter={() => nameOk && leaveNickname()} invalid={!!error} />}

          {step === 2 && (
            <div role="radiogroup" aria-label={t('성별')} className="stack" style={{ gap: 8 }}>
              {GENDERS.map((g) => (
                <Option key={g.value} role="radio" selected={gender === g.value} dimmed={!!gender && gender !== g.value} title={t(g.label)} center icon={<GenderIcon kind={g.value} />} onClick={() => setGender(g.value)} />
              ))}
            </div>
          )}

          {step === 3 && (
            // 약관은 글자 줄로 — 토스 약관 동의 화면처럼(2026-09-30 요청): 위에 큰 '전체 동의'(동그라미 체크), 아래에 항목 줄(작은 체크 + 글자 + 보기 화살표).
            <div>
              {!visitorConsent && <TermsCheck all checked={allOn} title={t('전체 동의')} onToggle={() => { agreeAll(!allOn); if (!allOn && !checked.push) turnOnPush() }} />}
              <hr style={{ border: 0, borderTop: '1px solid var(--color-border)', margin: '8px 0' }} />
              {TERMS.filter(item => !visitorConsent || item.key === 'push' || item.key === 'age').map((item) => (
                <TermsCheck key={item.key} checked={!!checked[item.key]} title={item.key === 'age' && minAge === 14 ? t('[필수] 만 14세 이상이에요') : t(item.title)} sub={'sub' in item ? t(item.sub) : undefined}
                  onToggle={() => toggleTerm(item.key)}
                  link={'href' in item ? { href: item.href, label: t('{title} 전문 보기', { title: t(item.title) }) } : undefined} />
              ))}
              {allowChild && <TermsCheck checked={under14} title={t('만 14세 미만이에요 (보호자 동의 필요)')} sub={t('다음 단계에서 보호자가 휴대전화로 본인인증을 하면 시작할 수 있어요')}
                onToggle={() => { setUnder14(v => !v); setChecked(c => ({ ...c, age: false })) }} />}
            </div>
          )}

          {error && <p role="alert" className="t-caption" style={{ marginTop: 12, color: 'var(--color-danger)' }}>{t(error)}</p>}
          {pushPath && <p className="t-caption" style={{ marginTop: 4, color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)', wordBreak: 'keep-all' }}>{t(pushPath)}</p>}

          <div className="stack" style={{ gap: 4, marginTop: 'auto', paddingTop: 'var(--space-6)' }}>
            {/* 고르는 단계는 모두 같은 '다음' 하나로 넘어간다 — 고르기만으로는 넘어가지 않는다(2026-09-30 요청). */}
            {step <= 2 && <Button type="button" variant="primary" full className="btn-next" disabled={!ready[step]} onClick={() => (step === 1 ? leaveNickname() : go(step + 1))}>{t('다음')}</Button>}
            {step === 3 && (
              // 11/13 알림이 선택이 되면서 버튼은 늘 '시작하기' — 필수 동의만 되면 열린다(예전엔 '알림 허용하기'로 시작해 허용해야 열렸다).
              <SubmitButton variant="primary" full disabled={asking || !requiredOk}>{t('시작하기')}</SubmitButton>
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

/** 큰 선택 칸. 고르면 한 단 밝은 바탕과 흰 체크(2026-09-30 요청) — 색만이 아니라 체크 모양으로도 갈린다. */
function Option({ role, selected, dimmed, title, sub, lang, center, icon, onClick }: { role: 'radio' | 'checkbox'; selected: boolean; dimmed?: boolean; title: string; sub?: string; lang?: string; center?: boolean; icon?: React.ReactNode; onClick: () => void }) {
  const reduce = useReducedMotion()
  return (
    <motion.button type="button" role={role} aria-checked={selected} onClick={onClick} lang={lang}
      whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 50, padding: center ? '8px 44px' : '8px 16px', textAlign: center ? 'center' : 'left', cursor: 'pointer',
        borderRadius: NEXT_RADIUS, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
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
