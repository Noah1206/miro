'use client'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Sheet } from './sheet'
import { LogoMark } from './logo'
import { Button } from './button'

export type SocialProviderId = 'google' | 'kakao'
export type LoginProvider = { id: SocialProviderId; label: string }

type Ask = (next?: string) => void
const Ctx = createContext<Ask>(() => {})

/** 로그인이 필요한 곳에서 부른다. 인자는 로그인 후 돌아올 경로. */
export const useLoginSheet = () => useContext(Ctx)

/** 로그인 화면으로 보내지 않고 시트로 묻는 버튼. 로그인 뒤에는 지금 보던 화면으로 돌아온다. 로그인 화면 자체는 직접 열면 그대로 있다. */
export function LoginButton({ next, ...rest }: Omit<React.ComponentProps<typeof Button>, 'onClick' | 'type'> & { next?: string }) {
  const ask = useLoginSheet()
  return <Button type="button" onClick={() => ask(next)} {...rest} />
}

/**
 * 로그인을 화면 이동 대신 시트로 묻는다.
 *
 * 보던 화면을 떠나지 않으므로 캐릭터를 고르던 맥락이 유지되고, 취소하면 그대로 남는다.
 * 로그인 자체는 외부 OAuth 로 나가야 하므로 여기서도 결국 페이지를 떠나지만, 그 선택을
 * 하기 전까지는 보던 것을 잃지 않는다.
 */
export function LoginSheetProvider({ providers, children }: { providers: LoginProvider[]; children: ReactNode }) {
  const [next, setNext] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const ask = useCallback<Ask>((to) => {
    // 현재 화면으로 돌아오는 것이 기본이다.
    setNext(to ?? (typeof location === 'undefined' ? null : location.pathname + location.search))
    setOpen(true)
  }, [])
  return (
    <Ctx.Provider value={ask}>
      {children}
      {/* 제목 줄 대신 로고와 한 줄을 가운데 세운다 — 무엇에 로그인하는지가 먼저 보인다. */}
      <Sheet open={open} onClose={() => setOpen(false)} label="MIRO 로그인" snap={{ half: 0.46, full: 0.62 }}>
        <div data-login-sheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LogoMark size={32} />
              <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.08em' }}>MIRO</span>
            </div>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              내 일상 속에 살아있는 캐릭터와 관계를 쌓아보세요
            </p>
          </div>
          {providers.map(p => <SocialButton key={p.id} {...p} next={next} />)}
        </div>
      </Sheet>
    </Ctx.Provider>
  )
}

/** 로그인 화면과 같은 브랜드 규정을 따른다 — Google 흰 바탕, Kakao #FEE500 에 검정 글자. */
function SocialButton({ id, label, next }: LoginProvider & { next: string | null }) {
  const style: Record<SocialProviderId, React.CSSProperties> = {
    google: { background: '#FFFFFF', color: '#111111', border: '1px solid #FFFFFF' },
    kakao: { background: '#FEE500', color: '#000000', border: '1px solid #FEE500' },
  }
  return (
    <a href={`/api/auth/${id}/start${next ? `?next=${encodeURIComponent(next)}` : ''}`} data-login-provider={id}
      className="button-link" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, padding: '12px 20px', borderRadius: 'var(--radius-button)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--font-body-size)', ...style[id] }}>
      <Icon id={id} />
      <span>{label}로 계속하기</span>
    </a>
  )
}

function Icon({ id }: { id: SocialProviderId }) {
  if (id === 'kakao') return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.9 3 2.8 6.3 2.8 10.3c0 2.6 1.7 4.9 4.3 6.2l-1 3.7c-.1.3.2.6.5.4l4.4-2.9c.3 0 .7.1 1 .1 5.1 0 9.2-3.3 9.2-7.5S17.1 3 12 3z" /></svg>
  )
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z" /><path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 20.9 7.6 23.5 12 23.5z" /><path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4l3.8-3z" /><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.3 15.1.5 12 .5 7.6.5 3.7 3.1 1.8 6.8l3.8 3c.9-2.7 3.4-4.7 6.4-4.7z" /></svg>
  )
}
