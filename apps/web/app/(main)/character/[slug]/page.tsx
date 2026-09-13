import { notFound } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getOfficialBySlug } from '@/lib/characters'
import { countComments, isBookmarked, listComments, similarCharacters } from '@/lib/social'
import { db, roleplaySessions } from '@miro/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { Back, Button, ButtonLink, Page } from '@/components/ui'
import { COPY } from '@/lib/copy'
import { DetailHero } from './hero'
import { Section, Stat, SimilarRow, Comments, BookmarkButton } from './sections'
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
  const tags = [...(c.worldGenre ?? '').split('·').map((g) => g.trim().replace(/\s+/g, '')), ...c.relationshipKeywords].filter(Boolean)
  const profile: Array<[string, string]> = [
    ['나이', c.age ? `${c.age}세` : ''],
    ['국적', c.nationality ?? ''],
    ['직업', c.occupation ?? ''],
    ['MBTI', c.mbti ?? ''],
    ['위치', c.socialPosition ?? ''],
    ['좋아하는 것', (c.hobbies as string[]).join(', ')],
    ['싫어하는 것', (c.dislikes as string[]).join(', ')],
    ['말투', c.speechStyle ?? ''],
    ['가치관', c.values ?? ''],
  ].filter(([, v]) => v) as Array<[string, string]>

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + 110px)' }}>
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 5, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(10,10,11,0.6)' }}>
        <Back href="/home" />
      </div>

      <DetailHero name={c.name} accent={c.accentA} slug={c.slug!} />

      <div style={{ padding: '0 var(--space-5)', marginTop: 'calc(-1 * var(--space-6))', position: 'relative' }}>
        <h1 className="t-hero t-name" style={{ marginBottom: 8 }}>{c.name}</h1>
        {c.tagline && <p className="t-body-lg t-quote" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>{c.tagline}</p>}

        {tags.length > 0 && (
          <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 14 }}>
            {tags.map((t) => `#${t}`).join(' ')}
          </p>
        )}

        {/* 통계 칩 — 레퍼런스의 '대화량 · 설정집 · 댓글' 자리. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
          {plays > 0 && <Stat icon="chat" label={`${compact(plays)}`} />}
          <Stat icon="comment" label={`댓글 ${commentCount}`} />
          {/* 하단 CTA 는 '대화 시작하기' 하나만 둔다 — 북마크는 여기에 (사용자 결정). */}
          <BookmarkButton slug={slug} saved={saved} />
        </div>

        <Section title="소개">
          <p className="t-body" style={{ lineHeight: 1.8, color: 'var(--color-text-secondary)' }}>{c.personality}</p>
        </Section>

        {profile.length > 0 && (
          <Section title="프로필">
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 14px' }}>
              {profile.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt className="t-caption" style={{ color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{k}</dt>
                  <dd className="t-caption" style={{ margin: 0, color: 'var(--color-text-primary)' }}>{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        <Section title="세계">
          <p className="t-caption" style={{ marginBottom: 8, color: 'var(--color-text-tertiary)' }}>
            {[c.worldEra, c.worldLocation, c.worldGenre].filter(Boolean).join(' · ')}
          </p>
          <p className="t-body" style={{ lineHeight: 1.8, color: 'var(--color-text-secondary)' }}>{c.worldSetting}</p>
        </Section>

        <Section title="인트로">
          <p className="t-body-lg t-quote" style={{ lineHeight: 1.85 }}>{c.startingContext}</p>
          <p className="t-caption" style={{ marginTop: 10, color: 'var(--color-text-tertiary)' }}>
            {[c.worldLocation, c.startingTime].filter(Boolean).join(' · ')}부터 시작합니다.
          </p>
        </Section>

        <Section title={`댓글 ${commentCount}`}>
          <Comments slug={slug} items={comments} signedIn={Boolean(user)} />
        </Section>
      </div>

      {similar.length > 0 && (
        <section aria-labelledby="similar" style={{ marginTop: 'var(--space-7)' }}>
          <h2 id="similar" className="t-title-3" style={{ padding: '0 var(--space-5)', marginBottom: 12 }}>
            {withSubject(c.name)} 마음에 들었다면
          </h2>
          <SimilarRow items={similar} />
        </section>
      )}

      {/* n18 — 문. 고정 하단. 내비 위에 올라앉는다 (2.5.8 / 2.4.11). */}
      <div className="detail-cta" style={{ position: 'fixed', left: 0, right: 0, zIndex: 25, padding: '14px var(--space-5)', background: 'linear-gradient(to top, rgba(10,10,11,0.96) 60%, rgba(10,10,11,0))' }}>
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

/**
 * 한글 조사. 받침이 있으면 '이', 없으면 '가' — '토마스이(가)' 처럼 쓰지 않는다.
 * 한글이 아니면 조사를 붙이지 않는다 (영문 이름에 '이/가' 는 어색하다).
 */
function withSubject(name: string): string {
  const last = name.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return name
  const hasFinal = (code - 0xac00) % 28 !== 0
  return `${name}${hasFinal ? '이' : '가'}`
}

function compact(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}만`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}천`
  return String(n)
}
