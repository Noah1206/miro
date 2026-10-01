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
      <PageHeader back="/my" title={t('언어')} lead={t('메뉴·버튼 같은 앱 화면과 캐릭터가 보내는 대화·문자가 모두 이 언어로 바뀌어요. 캐릭터 이름과 작성자가 쓴 소개글은 원래 언어 그대로 보여요.')} />
      <div className="stack" style={{ gap: 8 }}>
        {(Object.keys(LANGUAGES) as Language[]).map((l) => (
          // 옅게는 폼에 — 버튼(Pressable)이 제 불투명도를 스스로 다룬다.
          <form key={l} action={setLanguage.bind(null, l)} style={{ opacity: l === current ? 1 : 0.45, transition: 'opacity var(--motion-fast) var(--ease-standard)' }}>
            {/* 온보딩의 언어 고르기와 같은 모양: 글자 가운데, 고른 칸은 테두리 없이 밝은 바탕+흰 체크, 나머지는 옅게. */}
            <SubmitButton full variant="secondary" lang={l} aria-pressed={l === current}
              style={{ position: 'relative', justifyContent: 'center', minHeight: 50, padding: '8px 44px', fontWeight: 'var(--weight-regular)',
                background: l === current ? 'var(--color-surface-2)' : 'var(--color-surface-1)',
                border: `1px solid ${l === current ? 'transparent' : 'var(--color-border)'}`}}>
              {LANGUAGES[l]}
              {l === current && <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-white)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 16 }}><path d="M20 6 9 17l-5-5" /></svg>}
            </SubmitButton>
          </form>
        ))}
      </div>
    </Page>
  )
}
