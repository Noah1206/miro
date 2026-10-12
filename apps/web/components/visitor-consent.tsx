'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sheet, Button } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { acceptVisitorConsent } from '@/app/visitor-consent-actions'
import styles from './visitor-consent.module.css'
const items = [
  ['terms', '[필수] 서비스 이용약관', '/terms/service'],
  ['privacy', '[필수] 개인정보 처리방침', '/terms/privacy'],
  ['transfer', '[필수] 개인정보 국외 이전 동의', '/terms/transfer'],
  ['ai', '[필수] AI 생성 콘텐츠 안내', '/terms/ai'],
  ['marketing', '[선택] 이벤트·혜택 알림 받기', '/terms/marketing'],
  ['nightMarketing', '[선택] 야간 혜택 알림 받기', '/terms/night-marketing'],
] as const
export function VisitorConsent({ needed }: { needed: boolean }) {
  const t = useT(), path = usePathname()
  const [done, setDone] = useState(false), [dismissed, setDismissed] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false), [error, setError] = useState(false)
  const eligible = path === '/home' || path === '/search' || path === '/login' || path.startsWith('/character/')
  return <Sheet open={needed && !done && !dismissed && eligible} onClose={() => setDismissed(true)} label={t('MIRO를 시작하기 전에')} compact snap={{ half: .9, full: .96 }}>
    <form className={styles.content} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError(false)
      const form = new FormData(e.currentTarget)
      // The explicit submit action accepts the displayed required items; optional items remain opt-in.
      for (const [key] of items.slice(0, 4)) form.set(key, 'on')
      try { if (await acceptVisitorConsent(form)) setDone(true); else setError(true) }
      catch { setError(true) } finally { setBusy(false) }
    }}>
      <header className={styles.heading}><span>WELCOME TO MIRO</span><h2>{t('이야기를 시작하기 전에')}<br />{t('잠깐만 확인해 주세요')}</h2></header>
      <p className={styles.notice}>{t('캐릭터와의 대화는 AI가 만들어요. 실제와 다를 수 있으니 중요한 내용은 확인하고, 민감한 개인정보는 입력하지 마세요.')}</p>
      <div className={styles.items}>{[items.slice(0, 4), items.slice(4)].map((group, index) => <fieldset className={styles.group} key={index}>
        <legend>{t(index === 0 ? '필수 동의' : '선택 동의')}</legend>
        {group.map(([key, title, href]) => <div className={styles.row} key={key}>
          {index === 0 ? <span className={styles.requiredText}>{t(title).replace(/^\[[^\]]+\]\s*/, '')}</span> : <label><input type="checkbox" name={key} checked={!!checked[key]} onChange={e => setChecked(prev => ({ ...prev, [key]: e.target.checked }))} /><svg className={styles.check} viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg><span>{t(title).replace(/^\[[^\]]+\]\s*/, '')}</span></label>}
          {href && <a href={href} target="_blank" rel="noopener noreferrer" aria-label={t('{title} 전문 보기', { title: t(title) })}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></a>}
        </div>)}
      </fieldset>)}</div>
      <p className={styles.hint}>{t('동의합니다를 누르면 위 필수 항목에 동의해요. 선택 항목은 선택한 경우에만 동의해요.')}</p>
      {error && <p role="alert">{t('잠시 뒤 다시 시도해 주세요.')}</p>}
      <Button className={styles.submit} type="submit" full disabled={busy}>{t(busy ? '저장 중' : '동의합니다')}</Button>
    </form>
  </Sheet>
}
