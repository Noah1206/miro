import type { Metadata } from 'next'
import './globals.css'
import { currentAdmin, logout } from '@/lib/auth'
import Link from 'next/link'

export const metadata: Metadata = { title: 'MIRO Admin', robots: { index: false, follow: false } }

/** 운영 콘솔. 사용자 앱과 링크·인증·배포 단위가 분리된다. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin()
  return (
    <html lang="ko"><body>
      <header style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
        <strong style={{ letterSpacing: '.18em', fontWeight: 500 }}>MIRO ADMIN</strong>
        {admin && <>
          <Link href="/ai">AI 운영</Link><Link href="/reports">신고</Link><Link href="/payments">입금 확인</Link><Link href="/audit">감사 로그</Link>
          <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }} data-admin-role={admin.role}>{admin.email} · {admin.role}</span>
          <form action={async () => { 'use server'; await logout() }}><button className="btn" type="submit">로그아웃</button></form>
        </>}
      </header>
      <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>{children}</main>
    </body></html>
  )
}
