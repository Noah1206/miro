import { redirect } from 'next/navigation'
import { currentAdmin, login } from '@/lib/auth'

async function submit(form: FormData) {
  'use server'
  const ok = await login(String(form.get('email') ?? ''), String(form.get('password') ?? ''))
  redirect(ok ? '/reports' : '/login?error=1')
}
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentAdmin()) redirect('/reports')
  const { error } = await searchParams
  return (
    <form action={submit} className="card" style={{ maxWidth: 380, margin: '80px auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h1 style={{ fontSize: 18, margin: '0 0 6px' }}>운영자 로그인</h1>
      <input name="email" type="email" placeholder="이메일" required /><input name="password" type="password" placeholder="비밀번호" required />
      {error && <p role="alert" style={{ color: '#E05A7A', fontSize: 12.5, margin: 0 }}>로그인에 실패했습니다.</p>}
      <button className="btn" type="submit">로그인</button>
    </form>
  )
}
