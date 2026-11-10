import { officialDescription, officialEntry, officialIntro, officialSamples } from '@/lib/editorial/official-copy'
import { features } from '@miro/config'
import { introDialogue, introScenes, sampleDialogue, sceneOpening } from '@/lib/intro-dialogue'
import { RichText } from '@/components/scene/rich-text'
import { characterEditorial } from '@/components/scene/character-editorial'
import { sampleWithAtmosphere } from '@/lib/sample-atmosphere'
import { IntroPreview, type IntroScene } from './intro-preview'
import { CharacterSettings } from './settings'
import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getCharacterByKey } from '@/lib/characters'
import { characterLikeState, countComments, listComments, similarCharacters } from '@/lib/social'
import { Back, Page, TransitionLink } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { COPY } from '@/lib/copy'
import { DetailHero } from './hero'
import { LikeButton, Rule, Stat, SimilarRow, CommentsPreview } from './sections'
import { subject, withParticle } from '@/lib/format'
import { hotFirst } from '@/lib/character-card-copy'
import { startRoleplay } from './actions'
import { getT } from '@/lib/i18n/server'
import { StartWithLogin } from './start-button'
import { UnveilCover } from '@/components/unveil-badge'
import { homeUnveilEnabled } from '@/lib/home-mode'
import { coverTitle } from '@/lib/editorial/cover-title'
import { hasActiveRun, reachedEndings } from '@/lib/ending-collection'

export default async function CharacterDetail({ params }: { params: Promise<{ slug: string }> }) {
  // 로그인 전에도 캐릭터를 살펴볼 수 있다 — 문 앞에서 묻는다 (E-48).
  const t = await getT()
  const user = await currentUser()
  // 11/8 성인 서비스 — 로그인·본인인증 전에는 작품 목록·상세를 보이지 않는다(홈은 흐린 화면).
  if (!user) redirect('/home')
  const { slug } = await params
  const stored = await getCharacterByKey(slug, user?.id ?? null)
  const c = stored ? { ...stored, sampleDialogue: [...officialIntro(stored, stored.sampleDialogue).filter(d => d.purpose === 'intro'), ...officialSamples(stored, stored.sampleDialogue)] } : null
  if (!c) notFound()
  const unveil = await homeUnveilEnabled(user.id)
  // 11/10 성인 전용 작품은 언베일을 켠 사람(또는 만든 사람)에게만 — 주소로 바로 들어와도 홈으로.
  if (c.adultOnly && !unveil && c.ownerId !== user.id) redirect('/home')
  const can = features()
  const editedDescription = officialDescription(c)

  const [comments, commentCount, similar, likes, reached, running] = await Promise.all([
    listComments(c.id, user?.id ?? null, 8, 'popular'),
    countComments(c.id),
    similarCharacters(c.id, c.worldGenre, c.experienceType, unveil),
    characterLikeState(c.id, user?.id ?? null),
    c.endings.length ? reachedEndings(c.id, user.id) : Promise.resolve(new Set<string>()),
    c.endings.length ? hasActiveRun(c.id, user.id) : Promise.resolve(false),
  ])
  // 장면 안의 독자에게 직접 말하는 2인칭을 유지한다.
  const me = (text: string | null) => text ?? ''
  // 시작 상황(도입부)이 둘 이상이면 고른다 — 고른 값은 아래 '대화 시작하기' 폼으로 간다(form 속성).
  const scenes = introScenes(c.sampleDialogue)
  // 각 캐릭터의 분위기에 맞는 이름·당신·핵심어 색.
  const names = { character: c.name, user: ['당신'],
    ...characterEditorial({ slug: c.slug, name: c.name, genre: c.worldGenre, occupation: c.occupation }) }
  const introScenesData: IntroScene[] = (scenes.length ? scenes : ['']).map((scene) => {
    const opening = sceneOpening(c.sampleDialogue, scene)
    return {
      value: scene,
      briefing: officialEntry(stored!, stored!.sampleDialogue, scene),
      label: scene || t('처음부터'),
      meta: [opening?.time ?? c.startingTime, opening?.location ?? c.worldLocation].filter(Boolean).join(' | '),
      context: editedDescription ? '' : me(opening?.context ?? c.startingContext),
      lines: introDialogue(c.sampleDialogue, scene).map((d) => ({
        role: d.role === 'character' ? 'character' as const : 'narrator' as const,
        text: d.role === 'narrator' ? me(d.text) : d.text,
        ...(d.image ? { image: d.image } : {}),
      })),
    }
  })

  const enter = startRoleplay.bind(null, slug)
  // 11/4: 언베일 수위 사진(대표·갤러리·인트로 장면)은 언베일을 안 켠 사람에게 흐리게 — 누르면 성인 본인인증 후 언베일이 켜진다.
  const unlockAt = { signedIn: !!user, returnTo: `/character/${slug}?unveil=enable` }
  const veilIntro = c.coverUnveil && !unveil ? unlockAt : null
  // 공식 캐릭터의 추가 사진과 사용자가 올린 사진은 히어로 위 썸네일에서 바로 고른다.
  const heroImages = c.images
  // 장르와 관계 키워드가 겹치면 한 번만(11/4 #동창회 #첫사랑 두 번).
  const tags = hotFirst([...new Set([...(c.worldGenre ?? '').split('·').map((g) => g.trim().replace(/\s+/g, '')), ...c.relationshipKeywords].filter(Boolean))])
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

  // 소개 글 뒤의 '상세정보' 단락(키·몸무게·쓰리사이즈)은 세부정보로 접는다.
  const cut = c.personality?.indexOf('\n\n상세정보') ?? -1
  const lead = cut >= 0 ? c.personality!.slice(0, cut) : c.personality
  const details = cut >= 0 ? c.personality!.slice(cut + 2) : ''

  return (
    <Page immersive className="character-detail-theme" style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom))', background: 'var(--color-bg)' }}>
      {/* 11/5 사용자: '< 프로필 상세'와 편집은 사진 안이 아니라 사진 위쪽 줄에. */}
      <div className="detail-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 52, padding: '4px var(--gutter)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Back href="/home" bold />
          <span style={{ fontSize: 18, fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>{t('프로필 상세')}</span>
        </div>
        {/* 등록한 캐릭터를 고치는 길은 여기 하나다 — 주인에게만 보인다. */}
        {user && c.ownerId === user.id && (
          <TransitionLink href={`/my/characters/${c.id}/edit`} aria-label={t('편집')}
            style={{ minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-primary)' }}>
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </TransitionLink>
        )}
        {/* 11/10 작품 신고 — 남의 작품에만. 기존 신고 화면(/report)을 쓴다. */}
        {c.ownerId !== user.id && (
          <TransitionLink href={`/report?type=character&id=${c.id}`} className="t-caption"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>{t('신고')}</TransitionLink>
        )}
      </div>

      {/* 11/3: 컴퓨터에서는 위쪽을 사진 | 이름·소개·시작 버튼 두 칸으로(globals.css .detail-top). 휴대폰은 위아래 그대로. */}
      <div className="detail-top">
      <div className="detail-top-media" style={{ position: 'relative' }}>
        <DetailHero name={c.name} accent={c.accentA} slug={c.slug ?? c.id} images={heroImages} veil={unveil ? null : unlockAt} />
        {/* 11/6: 언베일을 켠 사람에겐 사진 모서리 '언베일' 표시를 띄우지 않는다. */}
        {c.coverUnveil && <UnveilCover veiled={!unveil} label={t('언베일')} unlock={unlockAt} hideLabel={unveil} />}
        <div style={{ position: 'absolute', bottom: 16, right: 'var(--gutter)', zIndex: 4 }}><LikeButton slug={slug} initial={likes} overlay /></div>
      </div>

      <div className="character-detail-copy detail-top-info" style={{ padding: '18px var(--gutter) 0', position: 'relative' }}>
        {/* 11/5 사용자 스크린샷 순서: 제목 → 통계 → 배지 → 소개 → 해시태그 칩. */}
        <h1 className="t-hero t-name" style={{ marginBottom: 8 }}>{coverTitle(c)}</h1>

        {/* 통계 — 댓글·좋아요. 대화한 사람 수는 띄우지 않는다(2026-09-30 요청). */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <Stat icon="comment" label={t('댓글 {n}', { n: commentCount })} />
          <LikeButton slug={slug} initial={likes} />
          {/* 11/6 사용자: 남성향/여성향 표시는 좋아요와 같은 줄에. */}
          <span className="t-caption" style={{ padding: '6px 10px', borderRadius: 10, background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)' }}>{c.audience === 'male' ? t('남성향') : t('여성향')}</span>
        </div>

        {/* 11/4: 인용구(한 줄 소개)는 상세에서 뺐다(사용자 요청). */}
        {c.experienceType === 'reality' && (editedDescription ?? lead) && <div className="detail-prose" style={{ marginBottom: 16 }}>
          <RichText editorial text={me(editedDescription ?? lead)} names={names} />
        </div>}

        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {tags.map((tag) => <span key={tag} style={{ padding: '3px 8px', borderRadius: 8, fontSize: 12, lineHeight: 1.5, background: 'var(--color-surface-2)', color: 'var(--color-accent-text)' }}>#{tag}</span>)}
          </div>
        )}

        {/* n18 — 문. 휴대폰은 고정 하단(내비 위, 2.5.8 / 2.4.11), 컴퓨터는 이 자리에 그대로 선다. */}
        {/* 위치(left/right/width)는 .detail-cta 가 정한다 — 인라인으로 left:0 을 주면
            넓은 화면에서 앱 폭 밖으로 튀어나간다 (인라인이 CSS 를 이긴다). */}
        <div className="detail-cta" style={{ zIndex: 25, bottom: 0, padding: '32px var(--gutter) calc(10px + env(safe-area-inset-bottom))', background: 'linear-gradient(to bottom, rgba(var(--color-bg-rgb), 0), rgba(var(--color-bg-rgb), 0.8) 40%, var(--color-bg) 75%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* 11/5: 시작 버튼 왼쪽 댓글 아이콘 — 댓글 전체 화면으로 */}
            <TransitionLink href={`/character/${slug}/comments`} aria-label={t('댓글 {n}', { n: commentCount })}
              style={{ flex: 'none', width: 48, height: 48, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-strong)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
              <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="var(--color-white)" stroke="var(--color-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>
            </TransitionLink>
            <div style={{ flex: 1, minWidth: 0 }}>
              {user
                ? <form id="start-roleplay" action={enter}><SubmitButton variant="primary" full className="btn-start" pressScale={0.94} style={{ background: 'var(--color-lavender-600)', border: '1px solid var(--color-lavender-600)', color: 'var(--color-white)', fontWeight: 'var(--weight-regular)', borderRadius: 'var(--radius-lg)' }}>{t(COPY.cta.startRoleplay)}</SubmitButton></form>
                : <StartWithLogin slug={slug} label={t('로그인하고 시작하기')} />}
              {/* 11/10 다회차 — 엔딩이 있는 작품에서 이미 하던 방이 있으면, 그 방은 남기고 처음부터 새로 시작한다. */}
              {user && running && <button type="submit" form="start-roleplay" name="fresh" value="1"
                style={{ display: 'block', margin: '8px auto 0', border: 0, background: 'transparent', color: 'var(--color-text-secondary)', font: 'inherit', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}>{t('처음부터 다시 하기 (지금 방은 대화 목록에 남아요)')}</button>}
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="character-detail-copy detail-rest" style={{ padding: '0 var(--gutter)', position: 'relative' }}>

        {/* 11/4 사용자: 수치·나이·말투 줄과 세계관·연락은 '세부정보 보기'를 눌러야 펼쳐진다. */}
        <details className="detail-more" style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--color-border)' }}>
          <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-strong)', color: 'var(--color-text-secondary)', fontSize: 15 }}>
            {t('상세 정보 더 보기')} <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </summary>
          {(details || (!editedDescription && profile.length > 0)) && <div className="t-caption" style={{ display: 'grid', gap: 8, marginTop: 8, whiteSpace: 'pre-line', lineHeight: 1.6, color: 'var(--color-text-tertiary)' }}>
            {details && <p>{details}</p>}
            {!editedDescription && profile.map((line) => <p key={line}>{line}</p>)}
          </div>}
          {c.experienceType === 'reality' && c.worldSetting && (
            <Rule label={t('세계관')}>
              <div className="detail-prose"><RichText editorial text={me(c.worldSetting)} names={names} /></div>
            </Rule>
          )}
          <CharacterSettings characterId={c.id} name={c.name} experienceType={c.experienceType} />
        </details>

        <IntroPreview scenes={introScenesData} names={names} portrait={c.images[0] ?? null} veil={veilIntro}
          start={user
            ? <button type="submit" form="start-roleplay" className="btn-start" style={{ width: '100%', minHeight: 52, borderRadius: 'var(--radius-lg)', background: 'var(--color-lavender-600)', border: '1px solid var(--color-lavender-600)', color: 'var(--color-white)', fontSize: 16, fontWeight: 'var(--weight-regular)', fontFamily: 'inherit', cursor: 'pointer' }}>{t('대화 바로 시작하기')}</button>
            : <StartWithLogin slug={slug} label={t('대화 바로 시작하기')} />}
          turns={sampleWithAtmosphere(c.slug, sampleDialogue(c.sampleDialogue))} />
      </div>

      {/* 엔딩 도감(11/10, 크랙) — 닿은 엔딩은 이름·그림, 아직인 엔딩은 등급과 힌트만. */}
      {c.endings.length > 0 && (
        <section aria-labelledby="endings" style={{ marginTop: 'var(--space-7)', padding: '0 var(--gutter)' }}>
          <h2 id="endings" className="t-title-3" style={{ marginBottom: 12, fontWeight: 'var(--weight-semibold)' }}>
            {t('엔딩 도감')} <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 400 }}>{c.endings.filter(e => reached.has(e.name)).length}/{c.endings.length}</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {c.endings.map(e => { const got = reached.has(e.name)
              return <div key={e.name} style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-1)', overflow: 'hidden' }}>
                <div style={{ aspectRatio: '3 / 4', background: 'var(--color-surface-2)', display: 'grid', placeItems: 'center', color: 'var(--color-text-tertiary)', fontSize: 28 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {got && e.image ? <img src={e.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (got ? '✓' : '?')}
                </div>
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-text-secondary)' }}>{e.grade}</span>
                  <strong style={{ fontSize: 14, fontWeight: 600 }}>{got ? e.name : t('아직 닿지 않은 엔딩')}</strong>
                  {!got && e.hint && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{e.hint}</span>}
                </div>
              </div> })}
          </div>
        </section>
      )}

      {similar.length > 0 && (
        <section aria-labelledby="similar" style={{ marginTop: 'var(--space-7)' }}>
          <h2 id="similar" className="t-title-3" style={{ padding: '0 var(--gutter)', marginBottom: 12, fontWeight: 'var(--weight-semibold)' }}>
            {t('{subject} 마음에 들었다면', { subject: subject(c.name), name: c.name })}
          </h2>
          {/* 11/6: 언베일을 안 켠 사람에겐 언베일 표지 카드를 흐린다(홈과 같은 규칙). */}
          <SimilarRow items={similar.map(s => ({ ...s, veiled: !unveil }))} />
        </section>
      )}

      {/* 11/5 사용자: 댓글은 '마음에 들었다면' 추천 아래, 맨 밑 */}
      <div className="character-detail-copy" style={{ padding: '0 var(--gutter)' }}>
        <Rule label={t('댓글 {n}', { n: commentCount })}
          action={<TransitionLink href={`/character/${slug}/comments`} className="t-caption" style={{ color: 'var(--color-accent-text)', fontWeight: 'var(--weight-semibold)' }}>{t('전체보기')}</TransitionLink>}>
          <CommentsPreview slug={slug} items={comments} />
        </Rule>
      </div>
    </Page>
  )
}
