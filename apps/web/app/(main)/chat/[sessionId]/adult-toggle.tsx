'use client'
import { useState, useTransition } from 'react'
import { Button, Checkbox, Sheet, useToast } from '@/components/ui'
import { Popover } from '@/components/ui/popover'
import { msg } from '@/lib/i18n'
import sheet from '@/components/push-subscribe.module.css'
import { useT } from '@/lib/i18n/client'
import { setAdultMode } from './actions'
import styles from './chat.module.css'

/**
 * 대화방 머리의 성인 모드 토글 '언베일'(10/2, 사용자 결정: 캐릭터가 아니라 사용자가 대화 화면에서 켜고 끔, 이름은 제타의 '언리밋'처럼 영어를 한글로).
 * 처음 켤 때만 한 번 묻는다 — 나이 확인·성인 콘텐츠 정책 동의 두 체크가 있어야 켜진다(본인인증과 함께 쓰는 동의 절차, 10/2). 한 번 켠 방은 꺼도 성인 전용 모델이 이어 맡는다(화면엔 AI 를 말하지 않는다 — 10/2 결정). 판정은 서버가 한다.
 */
type Level = 'soft' | 'deep' | 'explicit'
/** 언베일 수위 메뉴(10/3 사용자 요청: 모드 고르기 목록처럼). 수위는 한도이고, 속도는 여전히 사용자가 이끈다(engine adultRule). */
const LEVELS: Array<{ value: Level | 'off'; title: string }> = [
  // 단계는 한 단어(10/3 사용자 결정, 설명 줄은 뺐다). 뜻: 설렘=키스·스킨십까지, 몰입=노골적 세부 없이, 언베일=노골적.
  { value: 'off', title: msg('끔') },
  { value: 'soft', title: msg('설렘') },
  { value: 'deep', title: msg('몰입') },
  { value: 'explicit', title: msg('언베일') },
]

export function AdultToggle({ sessionId, on, everOn, level }: { sessionId: string; on: boolean; everOn: boolean; level: Level }) {
  const t = useT()
  const toast = useToast()
  const [menu, setMenu] = useState(false)
  const [ask, setAsk] = useState<Level | null>(null)
  const [pending, start] = useTransition()
  const apply = (next: Level | 'off', agreed = false) => start(async () => {
    const { error } = await setAdultMode(sessionId, next !== 'off', agreed, next === 'off' ? undefined : next)
    setAsk(null)
    if (error) toast(t(error))
  })
  const current = on ? level : 'off'
  const choose = (v: Level | 'off') => {
    setMenu(false)
    if (v === current) return
    // 처음 켜는 방은 동의 시트부터 — 고른 수위는 시트를 마치면 적용한다.
    if (v !== 'off' && !everOn) setAsk(v)
    else apply(v)
  }
  return <>
    <span className={styles.adultControl} data-on={on || undefined}>
      <button type="button" role="switch" aria-checked={on} aria-label={t('언베일 (성인 모드)')} disabled={pending}
        className={styles.adultToggle} onClick={() => choose(on ? 'off' : level)}>
        <span className={styles.adultPill}><span className={styles.adultLabel}>{t('언베일')}</span><span aria-hidden className={styles.adultTrack}><span className={styles.adultKnob} /></span></span>
      </button>
      <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label={t('언베일 (성인 모드)')} disabled={pending}
        className={styles.adultMenuToggle} onClick={() => setMenu((m) => !m)}>
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <Popover open={menu} onClose={() => setMenu(false)} anchor="right" style={{ minWidth: 268 }}>
        <p className={styles.adultMenuHead}>{t('언베일')}</p>
        {LEVELS.map((l) => (
          <button key={l.value} type="button" role="menuitemradio" aria-checked={current === l.value} className={styles.adultMenuItem} onClick={() => choose(l.value)}>
            <span className={styles.adultMenuTitle}>{t(l.title)}</span>
            {current === l.value && <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
          </button>
        ))}
      </Popover>
    </span>
    <Sheet open={ask !== null} onClose={() => setAsk(null)} label={t('언베일을 켤까요?')} compact>
      {/* 두 체크는 required — 브라우저가 둘 다 체크해야 제출한다. 서버도 처음 켤 때 agreed 를 다시 본다. */}
      <form className={sheet.stack} onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        apply(ask ?? 'deep', f.get('age') === 'on' && f.get('policy') === 'on')
      }}>
        <div className={sheet.center}>
          <span aria-hidden className={styles.adultBadge}>19</span>
          <h2 className="t-title-2" tabIndex={-1} data-initial-focus>{t('언베일을 켤까요?')}</h2>
          <p>{t('이 대화방에서 성인 표현이 나올 수 있어요. 언제든 다시 끌 수 있어요.')}</p>
        </div>
        <div className={styles.adultConsent}>
          <Checkbox name="age" required label={t('19세가 되는 해의 1월 1일이 지났습니다')} />
          <Checkbox name="policy" required label={t('성인 콘텐츠 정책에 동의합니다')} />
          <a href="/terms/adult" target="_blank" rel="noopener" className="t-caption" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{t('언베일 이용 정책 보기')}</a>
        </div>
        <div className={sheet.actions}>
          <Button type="submit" variant="primary" full status={pending ? 'loading' : 'idle'} disabled={pending}>{t('켜기')}</Button>
          <Button type="button" variant="ghost" size="sm" full onClick={() => setAsk(null)} style={{ color: 'var(--color-text-primary)' }}>{t('나중에')}</Button>
        </div>
      </form>
    </Sheet>
  </>
}
