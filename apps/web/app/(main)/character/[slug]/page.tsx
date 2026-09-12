import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getOfficialBySlug } from '@/lib/characters'
import { Back, Button, Chip, Page, Reveal } from '@/components/ui'
import { DetailHero } from './hero'
import { startRoleplay } from './actions'

/** 상세는 설정집이 아니다. 비주얼 → 한 줄 → 세계 → 시작 장면 → 문. */
export default async function CharacterDetail({ params }: { params: Promise<{ slug: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { slug } = await params
  const c = await getOfficialBySlug(slug)
  if (!c) notFound()
  const enter = startRoleplay.bind(null, slug)

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + 120px)' }}>
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 5, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(10,10,11,0.6)' }}>
        <Back href="/home" />
      </div>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <DetailHero name={c.name} accent={c.accentA} slug={c.slug!} />
        <div style={{ padding: '0 var(--space-5)', marginTop: 'calc(-1 * var(--space-6))', position: 'relative' }}>
          <Reveal>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {c.relationshipKeywords.map((k) => <Chip key={k}>{k}</Chip>)}
            </div>
            <h1 className="t-hero t-name" style={{ marginBottom: 6 }}>{c.name}</h1>
            <p className="t-caption" style={{ marginBottom: 'var(--space-6)' }}>
              {[c.role, c.age && `${c.age}세`, c.nationality, c.occupation].filter(Boolean).join(' · ')}
            </p>
          </Reveal>

          <Reveal inView as="section" style={{ marginBottom: 'var(--space-6)' }}>
            <h2 className="t-micro" style={{ marginBottom: 8 }}>세계</h2>
            <p className="t-caption" style={{ marginBottom: 8 }}>{[c.worldEra, c.worldLocation, c.worldGenre].filter(Boolean).join(' · ')}</p>
            <p className="t-body-lg" style={{ lineHeight: 1.75 }}>{c.worldSetting}</p>
          </Reveal>
          <Reveal inView as="section" style={{ marginBottom: 'var(--space-6)' }}>
            <h2 className="t-micro" style={{ marginBottom: 8 }}>당신이 들어가는 장면</h2>
            <p className="t-body-lg t-quote" style={{ lineHeight: 1.8 }}>{c.startingContext}</p>
          </Reveal>
        </div>
      </div>

      {/* n18 — 문. 고정 하단, 흰 버튼 하나. */}
      {/* 하단 내비 위에 올라앉는다 — 내비가 CTA 를 가리면 누를 수도, 초점이 보일 수도 없다 (2.5.8 / 2.4.11) */}
      <form action={enter} className="detail-cta" style={{ position: 'fixed', left: 0, right: 0, zIndex: 25, padding: '16px var(--space-5)', background: 'linear-gradient(to top, rgba(10,10,11,0.96) 60%, rgba(10,10,11,0))' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Button type="submit" variant="primary" size="lg" full>역할극 시작하기</Button>
        </div>
      </form>
    </Page>
  )
}
