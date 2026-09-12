import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { featuredFor } from '@/lib/home'
import { ButtonLink, Chip, LogoMark, Page, Reveal, TransitionLink } from '@/components/ui'
import { COPY } from '@/lib/copy'
import { CharacterVisual } from '@/components/character-visual'
import { PushSubscribe } from '@/components/push-subscribe'
import { IncomingCall } from '@/components/incoming-call'
import { WorldPager } from './pager'

/** 홈은 캐릭터 목록이 아니라 세계로 들어가는 입구다. 화면의 대부분을 한 사람이 차지한다 (DESIGN §9). */
export default async function Home() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { featured: f, others } = await featuredFor(user.id)

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
      <IncomingCall userId={user.id} />
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-5) var(--space-5) var(--space-4)', maxWidth: 720, margin: '0 auto' }}>
        <LogoMark size={22} />
        <p className="t-micro">{f.sessionId ? '이어지는 인연' : <span lang="en">MIRO ORIGINALS</span>}</p>
      </header>

      <section style={{ padding: '0 var(--space-5)', maxWidth: 720, margin: '0 auto' }}>
        <TransitionLink href={`/character/${f.slug}`} aria-label={COPY.a11y.hero(f.name)} style={{ display: 'block' }}>
          <CharacterVisual name={f.name} accent={f.accentA} slug={f.slug} ratio="4 / 5" className="hero-visual" />
        </TransitionLink>
        <Reveal delay={0.08}>
          <div className="stack" style={{ gap: 8, padding: 'var(--space-5) 2px 0' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="t-caption">{f.role}</span>
              {f.relationship && <Chip tone="relationship">{f.relationship}</Chip>}
            </div>
            <TransitionLink href={`/character/${f.slug}`}><h1 className="t-hero t-name">{f.name}</h1></TransitionLink>
            {f.situation && <p className="t-body-lg t-quote" style={{ color: 'var(--color-text-secondary)' }}>“{f.situation}”</p>}
            <div style={{ marginTop: 'var(--space-3)' }}>
              <ButtonLink href={f.sessionId ? `/chat/${f.sessionId}` : `/character/${f.slug}`} variant="primary" size="lg" full>{f.sessionId ? COPY.cta.continueWorld : COPY.cta.enterWorld}</ButtonLink>
            </div>
          </div>
        </Reveal>
        <div style={{ margin: 'var(--space-6) 0' }}>
          <PushSubscribe vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
        </div>
      </section>

      <Reveal inView as="section" style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2 className="t-micro" style={{ padding: '0 var(--space-5) var(--space-4)' }}>다른 세계</h2>
        <WorldPager items={others} />
      </Reveal>
    </Page>
  )
}
