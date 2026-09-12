'use client'
import { useActionState, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button, Input, LogoMark, Page, Tabs } from '@/components/ui'
import { tween } from '@/lib/motion/tokens'
import { authenticate, type AuthState } from './actions'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [state, action, pending] = useActionState(authenticate, { error: null } satisfies AuthState)
  return (
    <Page style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 420, paddingBottom: 'var(--space-7)' }}>
      <div style={{ marginBottom: 'var(--space-7)' }}><LogoMark size={28} /></div>
      <h1 className="sr-only">{mode === 'login' ? '로그인' : '회원가입'}</h1>
      <Tabs id="auth" active={mode} onChange={(k) => setMode(k as 'login' | 'signup')} tabs={[{ key: 'login', label: '로그인' }, { key: 'signup', label: '회원가입' }]} />
      <form action={action} className="stack" style={{ gap: 12, marginTop: 'var(--space-5)' }}>
        <input type="hidden" name="mode" value={mode} />
        <Input name="email" type="email" placeholder="이메일" aria-label="이메일" required autoComplete="email" />
        <Input name="password" type="password" placeholder="비밀번호 (8자 이상)" aria-label="비밀번호" aria-describedby="pw-hint" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        <p id="pw-hint" className="sr-only">8자 이상</p>
        <AnimatePresence>
          {state.error && (
            <motion.p role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween.enter} className="t-caption" style={{ color: 'var(--color-danger)' }}>{state.error}</motion.p>
          )}
        </AnimatePresence>
        <Button type="submit" variant="primary" size="lg" full status={pending ? 'loading' : 'idle'} style={{ marginTop: 8 }}>
          {mode === 'login' ? '로그인' : '회원가입'}
        </Button>
      </form>
    </Page>
  )
}
