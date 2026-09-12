import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getOfficialBySlug } from '@/lib/characters'
import { startRoleplay } from './actions'

export default async function CharacterDetail({
  params,
}: { params: Promise<{ slug: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const { slug } = await params
  const c = await getOfficialBySlug(slug)
  if (!c) notFound()

  const a = c.accentA ?? 'var(--accent)'
  const b = c.accentB ?? 'var(--accent-strong)'
  const enter = startRoleplay.bind(null, slug)

  return (
    <main style={{ minHeight: '100dvh', paddingBottom: 120 }}>
      {/* 대표 이미지 영역 — Visual Identity 연결 전까지 accent 그라디언트로 표현 */}
      <div style={{
        position: 'relative', height: 320,
        background: `linear-gradient(155deg, ${a}30 0%, ${b}18 50%, var(--bg) 100%)`,
      }}>
        <Link href="/home" aria-label="뒤로" style={{
          position: 'absolute', top: 20, left: 18, width: 36, height: 36,
          display: 'grid', placeItems: 'center', borderRadius: 999,
          background: 'rgba(14,14,16,0.55)', fontSize: 18,
        }}>‹</Link>

        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, var(--bg) 8%, transparent 65%)',
        }} />
      </div>

      <div style={{ padding: '0 24px', marginTop: -32, position: 'relative' }}>
        <p style={{ fontSize: 12, letterSpacing: '0.1em', color: b, margin: '0 0 6px' }}>
          {c.role}
        </p>
        <h1 style={{ fontSize: 32, margin: '0 0 4px', fontWeight: 600 }}>{c.name}</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 18px' }}>
          {[c.age && `${c.age}세`, c.nationality, c.occupation].filter(Boolean).join(' · ')}
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28 }}>
          {c.relationshipKeywords.map((k) => (
            <span key={k} style={{
              fontSize: 12, padding: '5px 11px', borderRadius: 999,
              border: `1px solid ${a}55`, color: 'var(--text-secondary)',
            }}>{k}</span>
          ))}
        </div>

        <Section label="세계관">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            {[c.worldEra, c.worldLocation, c.worldGenre].filter(Boolean).join(' · ')}
          </p>
          <Body>{c.worldSetting}</Body>
        </Section>

        <Section label="시작 상황">
          <Body>{c.startingContext}</Body>
        </Section>
      </div>

      {/* n18 — 역할극 입장 */}
      <form action={enter} style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, padding: '16px 24px',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        background: 'linear-gradient(to top, var(--bg) 60%, transparent)',
      }}>
        <button type="submit" style={{
          width: '100%', padding: 17, border: 'none', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--text-primary)',
          fontSize: 16, fontWeight: 600, cursor: 'pointer',
        }}>
          역할극 시작하기
        </button>
      </form>
    </main>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{
        fontSize: 11.5, letterSpacing: '0.14em', color: 'var(--text-secondary)',
        margin: '0 0 10px', fontWeight: 500,
      }}>{label}</h2>
      {children}
    </section>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14.5, lineHeight: 1.75, margin: 0, color: 'var(--text-primary)' }}>
      {children}
    </p>
  )
}
