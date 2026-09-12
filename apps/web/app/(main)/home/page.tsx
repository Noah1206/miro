import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { listOfficials, type OfficialCard } from '@/lib/characters'

export default async function Home() {
  const user = await currentUser()
  if (!user) redirect('/login')

  const officials = await listOfficials()

  return (
    <main style={{ minHeight: '100dvh', paddingBottom: 96 }}>
      <header style={{ padding: '28px 24px 20px' }}>
        <h1 style={{ fontSize: 22, letterSpacing: '0.2em', fontWeight: 300, margin: 0 }}>
          MIRO
        </h1>
      </header>

      <section style={{ padding: '0 24px' }}>
        <h2 style={{ fontSize: 13, letterSpacing: '0.14em', color: 'var(--text-secondary)',
                     margin: '0 0 16px', fontWeight: 500 }}>
          MIRO ORIGINALS
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {officials.map((c) => <Poster key={c.id} character={c} />)}
        </div>
      </section>

      <section style={{ padding: '32px 24px 0' }}>
        <Link href="/create" style={{
          display: 'block', padding: 20, textAlign: 'center',
          background: 'var(--surface)', border: '1px dashed var(--border)',
          borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: 14,
        }}>
          내 캐릭터 만들기
        </Link>
      </section>

      <TabBar />
    </main>
  )
}

/** 프리미엄 작품 포스터형 카드. 캐릭터별 accent 로 정체성을 구분한다. */
function Poster({ character: c }: { character: OfficialCard }) {
  const a = c.accentA ?? 'var(--accent)'
  const b = c.accentB ?? 'var(--accent-strong)'

  return (
    <Link href={`/character/${c.slug}`} style={{ display: 'block' }}>
      <article style={{
        position: 'relative', height: 220, borderRadius: 'var(--radius)',
        overflow: 'hidden', border: '1px solid var(--border)',
        background: `linear-gradient(150deg, ${a}22 0%, ${b}14 45%, var(--surface) 100%)`,
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(14,14,16,0.94) 22%, transparent 72%)',
        }} />
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 18 }}>
          <p style={{ fontSize: 11.5, letterSpacing: '0.1em', color: b, margin: '0 0 6px' }}>
            {c.role}
          </p>
          <h3 style={{ fontSize: 26, margin: '0 0 10px', fontWeight: 600 }}>{c.name}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {c.relationshipKeywords.map((k) => (
              <span key={k} style={{
                fontSize: 11, padding: '4px 9px', borderRadius: 999,
                border: `1px solid ${a}55`, color: 'var(--text-secondary)',
              }}>{k}</span>
            ))}
          </div>
        </div>
      </article>
    </Link>
  )
}

function TabBar() {
  const items = [
    { href: '/home', label: 'Home' },
    { href: '/archive', label: 'Chats' },
    { href: '/my', label: 'My' },
  ]
  return (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      display: 'flex', borderTop: '1px solid var(--border)',
      background: 'var(--bg)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} style={{
          flex: 1, textAlign: 'center', padding: '16px 0',
          fontSize: 12, color: 'var(--text-secondary)',
        }}>{i.label}</Link>
      ))}
    </nav>
  )
}
