'use client'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { msg } from '@/lib/i18n'
import { Sheet } from './sheet'
import { LogoMark } from './logo'
import { Button } from './button'
import { useT } from '@/lib/i18n/client'

import { SocialButton, type LoginProvider } from './social-button'
export type { SocialProviderId, LoginProvider } from './social-button'

/** next: 로그인 뒤 돌아올 경로. note: 시트에 한 줄 더 보일 문구(이미 번역된 것) — 예: 알림 종의 가입 선물. */
type Ask = (next?: string, note?: string) => void
const Ctx = createContext<Ask>(() => {})

/** 로그인이 필요한 곳에서 부른다. 인자는 로그인 후 돌아올 경로. */
export const useLoginSheet = () => useContext(Ctx)

/** 로그인 화면으로 보내지 않고 시트로 묻는 버튼. 로그인 뒤에는 지금 보던 화면으로 돌아온다. 로그인 화면 자체는 직접 열면 그대로 있다. */
export function LoginButton({ next, ...rest }: Omit<React.ComponentProps<typeof Button>, 'onClick' | 'type'> & { next?: string }) {
  const ask = useLoginSheet()
  return <Button type="button" onClick={() => ask(next)} {...rest} />
}

/** 카드·배너 전체를 덮는 투명한 버튼 — 누르면 로그인 시트(2026-09-30: 로그인 전 가입 선물 배너). 위치·모양은 className 이 정한다. */
export function LoginTapArea({ label, className }: { label: string; className?: string }) {
  const ask = useLoginSheet()
  return <button type="button" aria-label={label} className={className} onClick={() => ask()} />
}

/**
 * 로그인을 화면 이동 대신 시트로 묻는다.
 *
 * 보던 화면을 떠나지 않으므로 캐릭터를 고르던 맥락이 유지되고, 취소하면 그대로 남는다.
 * 로그인 자체는 외부 OAuth 로 나가야 하므로 여기서도 결국 페이지를 떠나지만, 그 선택을
 * 하기 전까지는 보던 것을 잃지 않는다.
 */
const LOGIN_ERRORS: Record<string, string> = {
  deleted: msg('삭제된 계정이에요. 같은 계정으로는 다시 들어올 수 없어요.'),
  denied: msg('로그인을 취소했어요. 준비되면 다시 시도해 주세요.'),
  failed: msg('잠시 연결이 끊겼어요. 다시 이어볼까요?'),
}

export function LoginSheetProvider({ providers, children }: { providers: LoginProvider[]; children: ReactNode }) {
  const pathname = usePathname()
  useEffect(() => {
    const query = new URLSearchParams(location.search)
    if (query.get('login') !== '1') return
    const to = query.get('next')
    setNext(to?.startsWith('/') && !to.startsWith('//') ? to : '/home')
    setNote(LOGIN_ERRORS[query.get('error') ?? ''] ?? null)
    setOpen(providers.length > 0)
    query.delete('login'); query.delete('next'); query.delete('error')
    history.replaceState(history.state, '', pathname + (query.size ? `?${query}` : '') + location.hash)
  }, [pathname, providers.length])
  const [next, setNext] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const t = useT()
  const ask = useCallback<Ask>((to, why) => {
    // 현재 화면으로 돌아오는 것이 기본이다.
    setNext(to ?? (typeof location === 'undefined' ? null : location.pathname + location.search))
    setNote(why ?? null)
    setOpen(true)
  }, [])
  return (
    <Ctx.Provider value={ask}>
      {children}
      {/* 제목 줄 대신 로고와 한 줄을 가운데 세운다 — 무엇에 로그인하는지가 먼저 보인다. */}
      <Sheet open={open} onClose={() => setOpen(false)} label={t('MIRO 로그인')} snap={{ half: 0.46, full: 0.62 }}>
        <div data-login-sheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LogoMark size={32} />
              <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.08em' }}>MIRO</span>
            </div>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              {t('내 일상 속에 살아있는 캐릭터와 관계를 쌓아보세요')}
            </p>
            {note && <p className="t-caption" style={{ margin: 0, color: 'var(--color-accent-bright)', fontWeight: 'var(--weight-semibold)', textAlign: 'center' }}>{t(note)}</p>}
          </div>
          {[...providers].sort((a, b) => Number(b.id === 'kakao') - Number(a.id === 'kakao')).map(p => <SocialButton key={p.id} {...p} next={next} surface="sheet" />)}
        </div>
      </Sheet>
    </Ctx.Provider>
  )
}
