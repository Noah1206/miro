'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { login, signup } from '@/lib/auth'
import { track } from '@/lib/analytics/track'

const Credentials = z.object({
  email: z.string().email('올바른 이메일을 입력해 주세요.'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
})

export type AuthState = { error: string | null }

const MESSAGES: Record<string, string> = {
  EMAIL_TAKEN: '이미 가입된 이메일입니다. 로그인해 주세요.',
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다.',
}

/** n6, n7 — 제출 → 성공 시 약관(n9), 실패 시 원인 안내 후 재시도(n8 → n5). */
export async function authenticate(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = Credentials.safeParse({
    email: form.get('email'),
    password: form.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력을 확인해 주세요.' }
  }

  const mode = form.get('mode') === 'signup' ? 'signup' : 'login'
  try {
    const u = mode === 'signup'
      ? await signup(parsed.data.email, parsed.data.password)
      : await login(parsed.data.email, parsed.data.password)
    if (mode === 'signup') void track(u.id, 'signup', {})
  } catch (e) {
    const code = e instanceof Error ? e.message : 'UNKNOWN'
    return { error: MESSAGES[code] ?? '로그인에 실패했습니다. 다시 시도해 주세요.' }
  }

  redirect('/terms')
}
