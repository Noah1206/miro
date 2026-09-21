import { CharacterSettings } from './settings'
import { notFound } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getCharacterByKey } from '@/lib/characters'
import { characterLikeState, countComments, isBookmarked, listComments, similarCharacters } from '@/lib/social'
import { db, roleplaySessions } from '@miro/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { Accordion, Back, Button, Page, TransitionLink } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { COPY } from '@/lib/copy'
import { DetailHero } from './hero'
import { LikeButton, Rule, Stat, SimilarRow, CommentsPreview, BookmarkButton, SampleDialogue, RealityStrip } from './sections'
import { compact, subject, withParticle } from '@/lib/format'
import { startRoleplay } from './actions'
import { StartWithLogin } from './start-button'

/**
 * 상세는 '이 사람과 말을 섞으면 어떤 느낌인가' 를 먼저 보여주는 화면이다.
 * 히어로 → 이름·한 줄·해시태그·통계 → 현실 기능 → 첫 장면과 예시 대화 → 사진 →
 * 접어 둔 설명 → 댓글 → 비슷한 작품 → 문.
 * 설명을 위에 쌓지 않는다 — 읽고 싶은 사람만 펴게 두고, 장면을 먼저 보여준다.
 */
export default async function CharacterDetail({ params }: { params: Promise<{ slug: string }> }) {
  // 로그인 전에도 캐릭터를 살펴볼 수 있다 — 문 앞에서 묻는다 (E-48).
  const user = await currentUser()
  const { slug } = await params
  const c = await getCharacterByKey(slug, user?.id ?? null)
  if (!c) notFound()

  const [plays, comments, commentCount, saved, similar, likes] = await Promise.all([
    playCount(c.id),
    listComments(c.id, user?.id ?? null, 8, 'popular'),
    countComments(c.id),
    isBookmarked(c.id, user?.id ?? null),
    similarCharacters(c.id, c.worldGenre, c.experienceType),
    characterLikeState(c.id, user?.id ?? null),
  ])

  const enter = startRoleplay.bind(null, slug)
  // 공식 캐릭터의 추가 사진과 사용자가 올린 사진은 히어로 위 썸네일에서 바로 고른다.
  const heroImages = c.images
  const tags = [...(c.worldGenre ?? '').split('·').map((g) => g.trim().replace(/\s+/g, '')), ...c.relationshipKeywords].filter(Boolean)
  // 라벨을 붙인 표 대신 읽히는 문장으로. 값이 없으면 그 문장이 통째로 빠진다.
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
    [c.speechStyle, c.values].filter(Boolean).join(' '),
  ].filter((line) => line.trim())

  return (
    <Page immersive className="character-detail-theme" style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom))', background: '#141416' }}>
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 5, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(10,10,11,0.6)' }}>
        <Back href="/home" />
      </div>
      {/* 등록한 캐릭터를 고치는 길은 여기 하나다 — 주인에게만 보인다. */}
      {user && c.ownerId === user.id && (
        <TransitionLink href={`/my/characters/${c.id}/edit`} className="t-caption"
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 5, minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(10,10,11,0.6)', color: 'var(--color-text-primary)', fontWeight: 'var(--weight-medium)' }}>
          편집
        </TransitionLink>
      )}

      <div style={{ position: 'relative' }}>
        <DetailHero name={c.name} accent={c.accentA} slug={c.slug ?? c.id} images={heroImages} />
        <div style={{ position: 'absolute', bottom: 16, right: 'var(--gutter)', zIndex: 4 }}><LikeButton slug={slug} initial={likes} overlay /></div>
      </div>

      <div className="character-detail-copy" style={{ padding: '18px var(--gutter) 0', position: 'relative' }}>
        <h1 className="t-hero t-name" style={{ marginBottom: 4, fontWeight: 800, letterSpacing: '-0.045em' }}>{c.name}</h1>
        {c.tagline && <p className="t-body-lg t-quote" style={{ color: 'var(--color-text-primary)', lineHeight: 1.45, letterSpacing: '-0.025em', marginBottom: 6 }}>{c.tagline}</p>}

        {tags.length > 0 && (
          <p className="t-caption" style={{ color: 'var(--color-white)', letterSpacing: '-0.025em', marginBottom: 10 }}>
            {tags.map((t) => `#${t}`).join(' ')}
          </p>
        )}

        {/* 통계 칩 — 레퍼런스의 '대화량 · 설정집 · 댓글' 자리. */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {plays > 0 && <Stat icon="chat" label={`${compact(plays)}`} />}
          <Stat icon="comment" label={`댓글 ${commentCount}`} />
          <LikeButton slug={slug} initial={likes} />
          {/* 하단 CTA 는 '대화 시작하기' 하나만 둔다 — 북마크는 여기에 (사용자 결정). */}

        </div>

        {/* 사진·통화는 미로 캐릭터의 것이다. 일반 캐릭터챗 상세에는 없는 기능을 그리지 않는다. */}
        {c.experienceType === 'reality' && <RealityStrip />}
        {c.worldSetting && (
          <Rule label="세계관">
            <p className="t-body-lg" style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{c.worldSetting}</p>
          </Rule>
        )}
        <CharacterSettings characterId={c.id} name={c.name} />

        {/* 먼저 보여주는 것은 설명이 아니라 장면이다 — 이 사람과 말을 섞으면 어떤 느낌인지. */}
        <Rule label="첫 장면">
          <div className="detail-prose">
            <p className="t-body-lg t-quote">{c.startingContext}</p>
            <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginTop: 8 }}>
              {[c.worldLocation, c.startingTime].filter(Boolean).join(' · ')}부터 시작합니다.
            </p>
          </div>
          {c.sampleDialogue.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <SampleDialogue name={c.name} portrait={c.images[0] ?? null} turns={c.sampleDialogue} />
            </div>
          )}
        </Rule>

        {/* 설명글은 읽고 싶은 사람만 편다 — 카드를 쌓는 대신 한 겹 접어 둔다. */}
        <div style={{ marginTop: 'var(--space-7)' }}>
          <Accordion title="이 사람에 대해">
            <div className="detail-prose">
              <p className="t-body-lg" style={{ color: 'var(--color-text-secondary)' }}>{c.personality}</p>
              {profile.map((line) => (
                <p key={line} className="t-body-lg" style={{ color: 'var(--color-text-secondary)' }}>{line}</p>
              ))}
            </div>
          </Accordion>
        </div>

        <Rule label={`댓글 ${commentCount}`}
          action={<TransitionLink href={`/character/${slug}/comments`} className="t-caption" style={{ color: 'var(--color-accent-text)', fontWeight: 'var(--weight-semibold)' }}>전체보기</TransitionLink>}>
          <CommentsPreview slug={slug} items={comments} />
        </Rule>
      </div>

      {similar.length > 0 && (
        <section aria-labelledby="similar" style={{ marginTop: 'var(--space-7)' }}>
          <h2 id="similar" className="t-title-3" style={{ padding: '0 var(--gutter)', marginBottom: 12 }}>
            {subject(c.name)} 마음에 들었다면
          </h2>
          <SimilarRow items={similar} />
        </section>
      )}

      {/* n18 — 문. 고정 하단. 내비 위에 올라앉는다 (2.5.8 / 2.4.11). */}
      {/* 위치(left/right/width)는 .detail-cta 가 정한다 — 인라인으로 left:0 을 주면
          넓은 화면에서 앱 폭 밖으로 튀어나간다 (인라인이 CSS 를 이긴다). */}
      <div className="detail-cta" style={{ zIndex: 25, bottom: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px var(--gutter) calc(10px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--color-border-strong)', background: 'var(--color-bg)' }}>
        <BookmarkButton slug={slug} saved={saved} iconOnly />
        <div style={{ flex: 1 }}>
        {user
          ? <form action={enter}><SubmitButton variant="primary" size="lg" style={{ minHeight: 48, padding: '8px 16px', fontSize: 14 }} full>{COPY.cta.startRoleplay}</SubmitButton></form>
          : <StartWithLogin slug={slug} label="로그인하고 시작하기" />}
        </div>
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
