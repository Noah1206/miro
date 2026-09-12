import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, termsConsents } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { agreeToTerms } from './actions'

/** n9 — 약관·개인정보 동의. */
export default async function TermsPage() {
  const user = await currentUser()
  if (!user) redirect('/login')

  const existing = await db.select({ id: termsConsents.id }).from(termsConsents)
    .where(eq(termsConsents.userId, user.id)).limit(1)
  if (existing.length > 0) redirect('/home')

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column',
                   padding: '56px 24px 32px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>약관 및 개인정보 처리 동의</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 32px' }}>
        MIRO를 이용하려면 아래 항목에 동의해야 합니다.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <Item title="서비스 이용약관" body="MIRO 서비스 이용에 관한 기본 약관입니다." />
        <Item title="개인정보 처리방침"
              body="계정 식별 정보와 역할극 기록의 처리 목적·보관 범위를 안내합니다." />
        <Item title="AI 생성 콘텐츠 안내"
              body="캐릭터의 응답과 생성 이미지는 AI가 만든 허구의 콘텐츠입니다." />
      </div>

      <form action={agreeToTerms}>
        <button type="submit" style={{
          width: '100%', marginTop: 32, padding: 16, border: 'none',
          borderRadius: 'var(--radius)', background: 'var(--accent)',
          color: 'var(--text-primary)', fontWeight: 600, fontSize: 16, cursor: 'pointer',
        }}>
          모두 동의하고 시작하기
        </button>
      </form>
    </main>
  )
}

function Item({ title, body }: { title: string; body: string }) {
  return (
    <section style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 18,
    }}>
      <h2 style={{ fontSize: 15, margin: '0 0 6px', fontWeight: 600 }}>{title}</h2>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>
        {body}
      </p>
    </section>
  )
}
