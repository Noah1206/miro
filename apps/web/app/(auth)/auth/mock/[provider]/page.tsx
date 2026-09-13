import { notFound } from 'next/navigation'
import { OAUTH_LABEL, resolveOAuth } from '@miro/providers'
import { Button, Field, Input, Notice, Page, PageHeader } from '@/components/ui'
import { isProvider } from '@/lib/oauth-state'

/**
 * 제공자 미구성 시의 동의 화면 시뮬레이션. 실제 키가 있으면 이 화면은 존재하지 않는다.
 * 운영에서는 dev API 가 켜져 있지 않으면 404.
 */
export default async function MockConsent({ params, searchParams }: { params: Promise<{ provider: string }>; searchParams: Promise<{ state?: string; redirect_uri?: string }> }) {
  const { provider } = await params
  if (!isProvider(provider)) notFound()
  if (resolveOAuth(provider).info.mode !== 'mock') notFound()
  if (process.env.VERCEL_ENV === 'production') notFound()
  const { state = '', redirect_uri = '' } = await searchParams
  return (
    <Page style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <PageHeader align="center" eyebrow="개발용 시뮬레이션" title={`${OAUTH_LABEL[provider]} 로그인`} lead="실제 인증이 아닙니다. 아래 이메일로 계정을 만들거나 이어서 들어갑니다." />
      <Notice style={{ marginBottom: 16 }}>⚠ {resolveOAuth(provider).info.notice}</Notice>
      <form method="GET" action={redirect_uri} className="stack" style={{ gap: 12 }}>
        <input type="hidden" name="state" value={state} />
        <Field label="이메일"><Input name="email" type="email" placeholder="이메일" required autoComplete="email" /></Field>
        <Field label="이름 (선택)"><Input name="name" placeholder="표시 이름" autoComplete="name" /></Field>
        <MockCode />
        <Button type="submit" variant="primary" size="lg" full>계속</Button>
      </form>
    </Page>
  )
}

/** email/name 을 code 로 묶어 콜백 형식(code=…)을 그대로 탄다. */
function MockCode() {
  return (
    <script dangerouslySetInnerHTML={{ __html: `
      document.currentScript.parentElement.addEventListener('submit', function (e) {
        var f = e.currentTarget, em = f.elements.namedItem('email'), nm = f.elements.namedItem('name')
        var code = btoa(unescape(encodeURIComponent(JSON.stringify({ email: em.value, name: nm.value || undefined })))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')
        var i = document.createElement('input'); i.type = 'hidden'; i.name = 'code'; i.value = code; f.appendChild(i)
        em.removeAttribute('name'); nm.removeAttribute('name')
      })` }} />
  )
}
