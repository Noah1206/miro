'use client'
import { useState, useTransition } from 'react'
import { Button, Checkbox, Sheet, useToast } from '@/components/ui'
import { SHEET_BUTTON } from '@/app/(main)/recharge/transfer-actions'
import sheet from '@/components/push-subscribe.module.css'
import { useT } from '@/lib/i18n/client'
import { setAdultMode } from './actions'
import styles from './chat.module.css'

/**
 * 대화방 머리의 성인 모드 토글(10/2, 사용자 결정: 캐릭터가 아니라 사용자가 대화 화면에서 켜고 끔).
 * 처음 켤 때만 한 번 묻는다 — 나이 확인·성인 콘텐츠 정책 동의 두 체크가 있어야 켜진다(본인인증과 함께 쓰는 동의 절차, 10/2). 한 번 켠 방은 꺼도 성인 전용 모델이 이어 맡는다(화면엔 AI 를 말하지 않는다 — 10/2 결정). 판정은 서버가 한다.
 */
export function AdultToggle({ sessionId, on, everOn }: { sessionId: string; on: boolean; everOn: boolean }) {
  const t = useT()
  const toast = useToast()
  const [ask, setAsk] = useState(false)
  const [pending, start] = useTransition()
  const apply = (next: boolean, agreed = false) => start(async () => {
    const { error } = await setAdultMode(sessionId, next, agreed)
    setAsk(false)
    if (error) toast(t(error))
  })
  return <>
    <button type="button" role="switch" aria-checked={on} aria-label={t('성인 모드')} disabled={pending} data-on={on || undefined}
      className={styles.adultToggle} onClick={() => on ? apply(false) : everOn ? apply(true) : setAsk(true)}>
      19<span aria-hidden className={styles.adultTrack}><span className={styles.adultKnob} /></span>
    </button>
    <Sheet open={ask} onClose={() => setAsk(false)} label={t('성인 모드를 켤까요?')} compact>
      {/* 두 체크는 required — 브라우저가 둘 다 체크해야 제출한다. 서버도 처음 켤 때 agreed 를 다시 본다. */}
      <form className={sheet.stack} onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        apply(true, f.get('age') === 'on' && f.get('policy') === 'on')
      }}>
        <div className={sheet.center}>
          <span aria-hidden className={styles.adultBadge}>19</span>
          <h2 className="t-title-2" tabIndex={-1} data-initial-focus>{t('성인 모드를 켤까요?')}</h2>
          <p>{t('이 대화방에서 성인 표현이 나올 수 있어요. 언제든 다시 끌 수 있어요.')}</p>
        </div>
        <div className={styles.adultConsent}>
          <Checkbox name="age" required label={t('19세가 되는 해의 1월 1일이 지났습니다')} />
          <Checkbox name="policy" required label={t('성인 콘텐츠 정책에 동의합니다')} />
        </div>
        <div className={sheet.actions}>
          <Button type="submit" variant="secondary" full style={SHEET_BUTTON} status={pending ? 'loading' : 'idle'} disabled={pending}>{t('켜기')}</Button>
          <Button type="button" variant="ghost" size="sm" full onClick={() => setAsk(false)} style={{ color: 'var(--color-text-primary)' }}>{t('나중에')}</Button>
        </div>
      </form>
    </Sheet>
  </>
}
