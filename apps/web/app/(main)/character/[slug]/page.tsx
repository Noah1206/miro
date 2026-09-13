import { notFound } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getOfficialBySlug } from '@/lib/characters'
import { countComments, isBookmarked, listComments, similarCharacters } from '@/lib/social'
import { db, roleplaySessions } from '@miro/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { Back, Button, ButtonLink, Page } from '@/components/ui'
import { COPY } from '@/lib/copy'
import { DetailHero } from './hero'
import { galleryFor, portraitFor } from '@/components/character-visual'
import { Section, Stat, SimilarRow, Comments, BookmarkButton, SampleDialogue, Gallery } from './sections'
import { compact, subject, withParticle } from '@/lib/format'
import { startRoleplay } from './actions'

/**
 * 상세는 작품 소개 화면이다 (레퍼런스 구조):
 * 히어로 → 제목·한 줄·해시태그·통계 → 소개 → 프로필 → 세계 → 시작 장면 → 댓글 → 비슷한 작품 → 문.
 */
export default async function CharacterDetail({ params }: { params: Promise<{ slug: string }> }) {
  // 로그인 전에도 캐릭터를 살펴볼 수 있다 — 문 앞에서 묻는다 (E-48).
  const user = await currentUser()
  const { slug } = await params
  const c = await getOfficialBySlug(slug)
  if (!c) notFound()

  const [plays, comments, commentCount, saved, similar] = await Promise.all([
    playCount(c.id),
    listComments(c.id, user?.id ?? null),
    countComments(c.id),
    isBookmarked(c.id, user?.id ?? null),
    similarCharacters(c.id, c.worldGenre),
  ])

  const enter = startRoleplay.bind(null, slug)
  const gallery = galleryFor(slug)
  const tags = [...(c.worldGenre ?? '').split('·').map((g) => g.trim().replace(/\s+/g, '')), ...c.relationshipKeywords].filter(Boolean)
  // 라벨을 붙인 표 대신 읽히는 문장으로. 값이 없으면 그 문장이 통째로 빠진다.
  const hobbies = c.hobbies as string[]
  const dislikes = c.dislikes as string[]
  // socialPosition 이 직업을 이미 품고 있으면 직업을 빼서 같은 말을 두 번 하지 않는다
  // (히사시: '조직의 중간 간부' + '오사카 조직의 중간 간부').
  const job = c.occupation && c.socialPosition?.includes(c.occupation) ? null : c.occupation
  const profile: string[] = [
    [
      // 앞줄은 '32세 · 영국 · 고서 복원가.' 처럼 마침표로 닫는다 — 없으면 다음 문장과 붙어 읽힌다.
      [[c.age && `${c.age}세`, c.nationality, job].filter(Boolean).join(' · '), '.'].join(''),
      c.socialPosition ? `${withParticle(c.socialPosition, '이다', '다')}.` : '',
      c.mbti ? `MBTI는 ${c.mbti}.` : '',
    ].filter((x) => x && x !== '.').join(' '),
    [
      hobbies.length > 0 ? `${withParticle(hobbies.join(', '), '을', '를')} 좋아하고,` : '',
      dislikes.length > 0 ? `${withParticle(dislikes.join(', '), '은', '는')} 싫어한다.` : '',
    ].filter(Boolean).join(' '),
    [c.speechStyle, c.values].filter(Boolean).join(' '),
  ].filter((line) => line.trim())

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + 110px)' }}>
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 5, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(10,10,11,0.6)' }}>
        <Back href="/home" />
      </div>

      <DetailHero name={c.name} accent={c.accentA} slug={c.slug!} />

      <div style={{ padding: '0 var(--space-5)', marginTop: 'calc(-1 * var(--space-6))', position: 'relative' }}>
        <h1 className="t-hero t-name" style={{ marginBottom: 8, fontWeight: 800, letterSpacing: '-0.03em' }}>{c.name}</h1>
        {c.tagline && <p className="t-body-lg t-quote" style={{ color: 'var(--color-text-primary)', lineHeight: 1.6, marginBottom: 12 }}>{c.tagline}</p>}

        {tags.length > 0 && (
          <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 14 }}>
            {tags.map((t) => `#${t}`).join(' ')}
          </p>
        )}

        {/* 통계 칩 — 레퍼런스의 '대화량 · 설정집 · 댓글' 자리. */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
          {plays > 0 && <Stat icon="chat" label={`${compact(plays)}`} />}
          <Stat icon="comment" label={`댓글 ${commentCount}`} />
          {/* 하단 CTA 는 '대화 시작하기' 하나만 둔다 — 북마크는 여기에 (사용자 결정). */}
          <BookmarkButton slug={slug} saved={saved} />
        </div>

        <Section title="소개" noBg>
          <div className="detail-prose">
            <p className="t-body-lg" style={{ color: 'var(--color-text-secondary)' }}>{c.personality}</p>
          </div>
        </Section>

        {(profile.length > 0 || gallery.length > 0) && (
          <Section title="프로필">
            {profile.length > 0 && (
              <div className="detail-prose">
                {profile.map((line) => (
                  <p key={line} className="t-body-lg" style={{ color: 'var(--color-text-secondary)' }}>{line}</p>
                ))}
              </div>
            )}
            {gallery.length > 0 && (
              <div style={{ marginTop: profile.length > 0 ? 16 : 0 }}>
                <Gallery name={c.name} images={gallery} />
              </div>
            )}
          </Section>
        )}

        <Section title="인트로">
          <div className="detail-prose">
            <p className="t-body-lg t-quote">{c.startingContext}</p>
            <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginTop: 8 }}>
              {[c.worldLocation, c.startingTime].filter(Boolean).join(' · ')}부터 시작합니다.
            </p>
          </div>
          {c.sampleDialogue.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <SampleDialogue name={c.name} portrait={portraitFor(slug)} turns={c.sampleDialogue} />
            </div>
          )}
        </Section>

        <Section title={`댓글 ${commentCount}`}>
          <Comments slug={slug} items={comments} signedIn={Boolean(user)} />
        </Section>
      </div>

      {similar.length > 0 && (
        <section aria-labelledby="similar" style={{ marginTop: 'var(--space-7)' }}>
          <h2 id="similar" className="t-title-3" style={{ padding: '0 var(--space-5)', marginBottom: 12 }}>
            {subject(c.name)} 마음에 들었다면
          </h2>
          <SimilarRow items={similar} />
        </section>
      )}

      {/* n18 — 문. 고정 하단. 내비 위에 올라앉는다 (2.5.8 / 2.4.11). */}
      {/* 위치(left/right/width)는 .detail-cta 가 정한다 — 인라인으로 left:0 을 주면
          넓은 화면에서 앱 폭 밖으로 튀어나간다 (인라인이 CSS 를 이긴다). */}
      <div className="detail-cta" style={{ zIndex: 25, padding: '14px var(--space-5)', background: 'linear-gradient(to top, rgba(10,10,11,0.96) 60%, rgba(10,10,11,0))' }}>
        {user
          ? <form action={enter}><Button type="submit" variant="primary" size="lg" full>{COPY.cta.startRoleplay}</Button></form>
          : <ButtonLink href={`/login?next=${encodeURIComponent(`/character/${slug}`)}`} variant="primary" size="lg" full>로그인하고 시작하기</ButtonLink>}
      </div>
    </Page>
  )
}

/** 실제로 이 캐릭터와 대화한 사람 수. */
async function playCount(characterId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(distinct ${roleplaySessions.userId})::int` })
    .from(roleplaySessions)
    .where(and(eq(roleplaySessions.characterId, characterId), isNull(roleplaySessions.deletedAt)))
  return r?.n ?? 0
}


