import { redirect } from 'next/navigation'
import { LANGUAGES, type Language } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { Page, PageHeader } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { setLanguage } from '@/lib/i18n/actions'
import { getLanguage, getT } from '@/lib/i18n/server'

/** 언어 바꾸기 — 앱 화면과 캐릭터의 말이 함께 바뀐다. 언어 이름은 그 언어로 적는다. */
export default async function LanguagePage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [current, t] = await Promise.all([getLanguage(), getT()])
  return (
    <Page style={{ maxWidth: 520 }}>
      <PageHeader back="/my/settings" title={t('언어')} lead={t('앱 화면과 캐릭터의 말이 이 언어로 바뀌어요.')} />
      <div className="stack" style={{ gap: 8 }}>
        {(Object.keys(LANGUAGES) as Language[]).map((l) => (
          <form key={l} action={setLanguage.bind(null, l)}>
            <SubmitButton full variant="secondary" lang={l} aria-pressed={l === current}
              style={{ justifyContent: 'space-between', padding: '16px 18px', fontWeight: 'var(--weight-regular)',
                background: l === current ? 'var(--color-accent-soft)' : 'var(--color-surface-1)',
                border: `1px solid ${l === current ? 'var(--color-accent)' : 'transparent'}` }}>
              {LANGUAGES[l]}
              {l === current && <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
            </SubmitButton>
          </form>
        ))}
      </div>
    </Page>
  )
}
