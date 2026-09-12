import { OAUTH_LABEL, resolveOAuth, type OAuthProviderId } from '@miro/providers'
import { LogoMark, Notice, Page } from '@/components/ui'
import { NoAccount } from './no-account'

const ERRORS: Record<string, string> = {
  deleted: '삭제된 계정이에요. 같은 계정으로는 다시 들어올 수 없어요.',
  denied: '로그인을 취소했어요. 준비되면 다시 시도해 주세요.',
  failed: '잠시 연결이 끊겼어요. 다시 이어볼까요?',
}

/** n5 — 로그인. 가입과 로그인을 나누지 않는다: 소셜 계정으로 계속하면 처음이면 만들어진다. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const providers = (['google', 'kakao', 'naver'] as OAuthProviderId[]).map((id) => ({ id, p: resolveOAuth(id) }))
  const mock = providers.find(({ p }) => p.info.mode === 'mock')
  return (
    <Page style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 420, paddingBottom: 'var(--space-7)' }}>
      <div style={{ marginBottom: 'var(--space-6)' }}><LogoMark size={40} /></div>
      <h1 className="t-title-1" style={{ marginBottom: 6 }}>다시, 그 세계로</h1>
      <p className="t-body" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>쓰던 계정으로 계속해요.</p>
      {error && ERRORS[error] && <Notice role="alert" tone={error === 'failed' ? 'danger' : 'muted'} style={{ marginBottom: 16 }}>{ERRORS[error]}</Notice>}
      {mock && <Notice style={{ marginBottom: 16 }}>⚠ {mock.p.info.notice}</Notice>}

      <div className="stack" style={{ gap: 10 }}>
        {providers.map(({ id }) => <SocialButton key={id} id={id} />)}
      </div>
      <NoAccount />
    </Page>
  )
}

/**
 * 브랜드 규정: Google 흰 바탕, Kakao #FEE500 에 검정 글자, Naver 는 초록 위 흰 글자가 2.3:1 이라
 * 초록을 아이콘에만 쓰고 글자는 어두운 면 위 흰색으로 둔다 (AA).
 */
function SocialButton({ id }: { id: OAuthProviderId }) {
  const style: Record<OAuthProviderId, React.CSSProperties> = {
    google: { background: '#FFFFFF', color: '#111111', border: '1px solid #FFFFFF' },
    kakao: { background: '#FEE500', color: '#000000', border: '1px solid #FEE500' },
    naver: { background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-strong)' },
  }
  return (
    <a href={`/api/auth/${id}/start`} className="button-link" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, padding: '12px 20px', borderRadius: 'var(--radius-button)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--font-body-size)', ...style[id] }}>
      <Icon id={id} />
      <span>{OAUTH_LABEL[id]}로 계속하기</span>
    </a>
  )
}
function Icon({ id }: { id: OAuthProviderId }) {
  if (id === 'google') return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
  )
  if (id === 'kakao') return <svg aria-hidden width="18" height="18" viewBox="0 0 24 24"><path fill="#000" d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.2 4.6 6.6L5.5 21l4.5-3c.7.1 1.3.1 2 .1 5.5 0 10-3.6 10-8.1S17.5 3 12 3z"/></svg>
  return <svg aria-hidden width="18" height="18" viewBox="0 0 24 24"><path fill="#03C75A" d="M4 3h5.2l5.6 8.4V3H20v18h-5.2L9.2 12.6V21H4z"/></svg>
}
