import { features } from '@miro/config'
import { introDialogue, introScenes, sampleDialogue, sceneOpening } from '@/lib/intro-dialogue'
import { RichText } from '@/components/scene/rich-text'
import { characterEditorial } from '@/components/scene/character-editorial'
import { sampleWithAtmosphere } from '@/lib/sample-atmosphere'
import { IntroPreview, type IntroScene } from './intro-preview'
import { personalize } from '@/lib/personalize'
import { getPersona } from '@/lib/persona'
import { CharacterSettings } from './settings'
import { notFound } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getCharacterByKey } from '@/lib/characters'
import { characterLikeState, countComments, listComments, similarCharacters } from '@/lib/social'
import { Back, Page, TransitionLink } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { COPY } from '@/lib/copy'
import { DetailHero } from './hero'
import { LikeButton, Rule, Stat, SimilarRow, CommentsPreview, SampleDialogue, RealityStrip } from './sections'
import { subject, withParticle } from '@/lib/format'
import { startRoleplay } from './actions'
import { getT } from '@/lib/i18n/server'
import { StartWithLogin } from './start-button'

export default async function CharacterDetail({ params }: { params: Promise<{ slug: string }> }) {
  // 로그인 전에도 캐릭터를 살펴볼 수 있다 — 문 앞에서 묻는다 (E-48).
  const t = await getT()
  const user = await currentUser()
  const { slug } = await params
  const c = await getCharacterByKey(slug, user?.id ?? null)
  if (!c) notFound()

  const [comments, commentCount, similar, likes, persona] = await Promise.all([
    listComments(c.id, user?.id ?? null, 8, 'popular'),
    countComments(c.id),
    similarCharacters(c.id, c.worldGenre, c.experienceType),
    characterLikeState(c.id, user?.id ?? null),
    user ? getPersona(user.id) : null,
  ])
  // 서술의 "당신"을 내 페르소나 이름으로(10/5, 위프처럼). 로그인 전·페르소나 없으면 그대로.
  const me = (text: string | null) => personalize(text ?? '', persona?.name)
  // 시작 상황(도입부)이 둘 이상이면 고른다 — 고른 값은 아래 '대화 시작하기' 폼으로 간다(form 속성).
  const scenes = introScenes(c.sampleDialogue)
  // 각 캐릭터의 분위기에 맞는 이름·당신·핵심어 색. 페르소나가 있으면 서술의 '당신'이 그 이름이 된다.
  const names = { character: c.name, user: [...new Set([persona?.name?.trim(), '당신'].filter((n): n is string => !!n))],
    ...characterEditorial({ slug: c.slug, name: c.name, genre: c.worldGenre, occupation: c.occupation }) }
  const introScenesData: IntroScene[] = (scenes.length ? scenes : ['']).map((scene) => {
    const opening = sceneOpening(c.sampleDialogue, scene)
    return {
      value: scene,
      label: scene || t('처음부터'),
      meta: [opening?.time ?? c.startingTime, opening?.location ?? c.worldLocation].filter(Boolean).join(' | '),
      context: me(opening?.context ?? c.startingContext),
      lines: introDialogue(c.sampleDialogue, scene).map((d) => ({
        role: d.role === 'character' ? 'character' as const : 'narrator' as const,
        text: d.role === 'narrator' ? me(d.text) : d.text,
        ...(d.image ? { image: d.image } : {}),
      })),
    }
  })

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
      [[c.age && t('{age}세', { age: c.age }), c.nationality, job].filter(Boolean).join(' · '), '.'].join(''),
      c.socialPosition ? `${withParticle(c.socialPosition, '이다', '다')}.` : '',
      c.mbti ? t('MBTI는 {mbti}.', { mbti: c.mbti }) : '',
    ].filter((x) => x && x !== '.').join(' '),
    ...(c.experienceType === 'reality' ? [[c.speechStyle, c.values].filter(Boolean).join(' ')] : []),
  ].filter((line) => line.trim())

  return (
    <Page immersive className="character-detail-theme" style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom))', background: 'var(--color-bg)' }}>
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 5, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(var(--color-bg-rgb),0.6)' }}>
        <Back href="/home" />
      </div>
      {/* 등록한 캐릭터를 고치는 길은 여기 하나다 — 주인에게만 보인다. */}
      {user && c.ownerId === user.id && (
        <TransitionLink href={`/my/characters/${c.id}/edit`} className="t-caption"
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 5, minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(var(--color-bg-rgb),0.6)', color: 'var(--color-text-primary)', fontWeight: 'var(--weight-medium)' }}>
          {t('편집')}
        </TransitionLink>
      )}

      <div style={{ position: 'relative' }}>
        <DetailHero name={c.name} accent={c.accentA} slug={c.slug ?? c.id} images={heroImages} />
        <div style={{ position: 'absolute', bottom: 16, right: 'var(--gutter)', zIndex: 4 }}><LikeButton slug={slug} initial={likes} overlay /></div>
      </div>

      <div className="character-detail-copy" style={{ padding: '18px var(--gutter) 0', position: 'relative' }}>
        <h1 className="t-hero t-name" style={{ marginBottom: 4 }}>{c.name}</h1>
        {c.tagline && <p className="t-body-lg t-quote" style={{ color: 'var(--color-text-secondary)', marginBottom: 6 }}>{c.tagline}</p>}

        {tags.length > 0 && (
          <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            {tags.map((t) => `#${t}`).join(' ')}
          </p>
        )}

        {/* 통계 칩 — 댓글·좋아요. 대화한 사람 수는 띄우지 않는다(2026-09-30 요청). */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <Stat icon="comment" label={t('댓글 {n}', { n: commentCount })} />
          <LikeButton slug={slug} initial={likes} />
        </div>

        {/* 사진·통화는 미로 캐릭터의 것이다. 일반 캐릭터챗 상세에는 없는 기능을 그리지 않는다. */}
        {c.experienceType === 'reality' && <RealityStrip can={features()} />}
        {(c.experienceType === 'reality' || profile.length > 0) && <Rule label={t('이 사람에 대해')}>
          <div className="detail-prose">
            {c.experienceType === 'reality' && <RichText editorial text={me(c.personality)} names={names} />}
            {profile.map((line) => <RichText editorial key={line} text={line} names={names} />)}
          </div>
        </Rule>}
        {c.experienceType === 'reality' && c.worldSetting && (
          <Rule label={t('세계관')}>
            <div className="detail-prose"><RichText editorial text={me(c.worldSetting)} names={names} /></div>
          </Rule>
        )}
        <CharacterSettings characterId={c.id} name={c.name} experienceType={c.experienceType} />

        <Rule label={t('첫 장면')}>
          <div className="detail-prose"><IntroPreview scenes={introScenesData} names={names} /></div>
          {sampleDialogue(c.sampleDialogue).length > 0 && (
            <div style={{ marginTop: 18 }}>
              <SampleDialogue name={c.name} names={names} portrait={c.images[0] ?? null} turns={sampleWithAtmosphere(c.slug, sampleDialogue(c.sampleDialogue))} />
            </div>
          )}
        </Rule>

        <Rule label={t('댓글 {n}', { n: commentCount })}
          action={<TransitionLink href={`/character/${slug}/comments`} className="t-caption" style={{ color: 'var(--color-accent-text)', fontWeight: 'var(--weight-semibold)' }}>{t('전체보기')}</TransitionLink>}>
          <CommentsPreview slug={slug} items={comments} />
        </Rule>
      </div>

      {similar.length > 0 && (
        <section aria-labelledby="similar" style={{ marginTop: 'var(--space-7)' }}>
          <h2 id="similar" className="t-title-3" style={{ padding: '0 var(--gutter)', marginBottom: 12 }}>
            {t('{subject} 마음에 들었다면', { subject: subject(c.name), name: c.name })}
          </h2>
          <SimilarRow items={similar} />
        </section>
      )}

      {/* n18 — 문. 고정 하단. 내비 위에 올라앉는다 (2.5.8 / 2.4.11). */}
      {/* 위치(left/right/width)는 .detail-cta 가 정한다 — 인라인으로 left:0 을 주면
          넓은 화면에서 앱 폭 밖으로 튀어나간다 (인라인이 CSS 를 이긴다). */}
      <div className="detail-cta" style={{ zIndex: 25, bottom: 0, padding: '10px var(--gutter) calc(10px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--color-border-strong)', background: 'var(--color-bg)' }}>
        {user
          ? <form id="start-roleplay" action={enter}><SubmitButton variant="primary" full>{t(COPY.cta.startRoleplay)}</SubmitButton></form>
          : <StartWithLogin slug={slug} label={t('로그인하고 시작하기')} />}
      </div>
    </Page>
  )
}
