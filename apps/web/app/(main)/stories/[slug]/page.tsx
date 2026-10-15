import { notFound } from 'next/navigation'
import { Back, ButtonLink, Notice, Page } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { currentUser } from '@/lib/auth'
import { getPersona } from '@/lib/persona'
import { liveRun, storyBySlug } from '@/lib/stories/repo'
import { audienceLabel, CoverTitle, coverShowsTitle, isLightCover } from '../story-card'
import { LoginToStart, StartForm } from './start-form'

export const dynamic = 'force-dynamic'

export default async function StoryDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [story, user] = await Promise.all([storyBySlug(slug), currentUser()])
  if (!story) notFound()
  const [run, persona] = user ? await Promise.all([liveRun(user.id, story.id), getPersona(user.id)]) : [null, null]
  const firstParagraph = story.opening.split('\n\n')[0]

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
      <div style={{ position: 'relative' }}>
        <CharacterVisual name={story.title} accent={null} slug={story.slug} photo={story.cover} ratio={story.cover ? "2 / 3" : "4 / 3"} size="detail" loading="eager" shared={false} scrim={!isLightCover(story.slug)} style={{ borderRadius: 0 }} />
        {coverShowsTitle(story) && <CoverTitle title={story.title} slug={story.slug} size="hero" />}
        <div style={{ position: 'absolute', top: 16, left: 16, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(var(--color-bg-rgb),0.6)' }}><Back href="/stories" /></div>
      </div>
      <div className="stack" style={{ padding: '18px var(--gutter) 0', gap: 'var(--space-4)' }}>
        <div className="stack" style={{ gap: 6 }}>
          <p className="t-micro" style={{ color: 'var(--color-accent-text)' }}>{audienceLabel(story.audience)}{!story.published && ' · 미공개(개발 환경에서만 보임)'}</p>
          <h1 className="t-title-1">{story.title}</h1>
          <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{story.genres.concat(story.tags).map(t => `#${t.replace(/\s+/g, '')}`).join(' ')}</p>
        </div>
        <Notice>{`당신의 역할: ${story.protagonist.role}. ${story.notice}`}</Notice>
        <p className="t-body" style={{ lineHeight: 1.7, whiteSpace: 'pre-line' }}>{story.intro}</p>

        <section className="stack" style={{ gap: 10 }}>
          <h2 className="t-title-3">등장인물</h2>
          {story.characters.map(c => (
            <div key={c.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 72, flexShrink: 0 }}><CharacterVisual name={c.name} accent={null} slug={`${story.slug}-${c.key}`} photo={c.image} ratio="1 / 1" shared={false} scrim={false} /></div>
              <div className="stack" style={{ gap: 2 }}>
                <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>{c.name} <span className="t-caption" style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>{c.age}세</span></p>
                <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{c.persona} {c.look}.</p>
                <p className="t-caption" style={{ color: 'var(--color-text-tertiary, var(--color-text-secondary))' }}>시작 관계: {c.relation}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="stack" style={{ gap: 8 }}>
          <h2 className="t-title-3">첫 장면</h2>
          <p className="t-body" style={{ lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>{firstParagraph}</p>
        </section>

        <section className="stack" style={{ gap: 12 }}>
          {run && <ButtonLink href={`/stories/play/${run.id}`} variant="primary" full size="lg">{run.status === 'ended' ? `${run.runNo}회차 이어 보기(시즌 종료)` : `${run.runNo}회차 이어하기`}</ButtonLink>}
          {user
            ? <StartForm slug={story.slug} protagonist={story.protagonist} defaultName={persona?.name ?? ''} medium={story.medium} hasRun={!!run} />
            : <LoginToStart slug={story.slug} />}
        </section>
      </div>
    </Page>
  )
}
