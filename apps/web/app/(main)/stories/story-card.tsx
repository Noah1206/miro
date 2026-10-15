import { Black_Han_Sans, Diphylleia, Nanum_Myeongjo, Song_Myung } from 'next/font/google'
import type { ReactNode } from 'react'
import { CharacterVisual } from '@/components/character-visual'
import { Chip, TransitionLink } from '@/components/ui'
import type { StoryCard as Card } from '@/lib/stories/repo'

/** 역하렘·BL 과 주인공 성별은 들어가기 전에 보이게 — 카드·상세 공통 표시. */
export const audienceLabel = (a: Card['audience']) => (a === 'reverse_harem' ? '역하렘 · 여성 주인공' : 'BL · 남성 주인공')

const serif = Nanum_Myeongjo({ weight: '800', subsets: ['latin'], preload: false, display: 'swap' })
const heavy = Black_Han_Sans({ weight: '400', subsets: ['latin'], preload: false, display: 'swap' })
const fine = Diphylleia({ weight: '400', subsets: ['latin'], preload: false, display: 'swap' })
const brush = Song_Myung({ weight: '400', display: 'swap' })

const clip = (bg: string) => ({ backgroundImage: bg, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }) as const


/** 1번: 왕립 군사 아카데미 — 표지 전체를 두르는 금박 이중 테두리와 네 모서리 문장. */
const AcademyFrame = () => {
  const corner = (pos: object) => <span style={{ position: 'absolute', ...pos, width: '1.6em', height: '1.6em', display: 'grid', placeItems: 'center', fontSize: '1em', color: '#f2d27a', background: 'radial-gradient(circle,rgba(0,0,0,0.75) 40%,rgba(0,0,0,0) 70%)', textShadow: '0 0 8px rgba(242,190,90,0.8)' }}>✦</span>
  return (
    <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 60px rgba(0,0,0,0.75)' }}>
      <span style={{ position: 'absolute', inset: '0.6em', border: '1.5px solid rgba(242,210,122,0.9)' }} />
      <span style={{ position: 'absolute', inset: '0.95em', border: '1px solid rgba(242,210,122,0.45)' }} />
      {corner({ left: 0, top: 0 })}{corner({ right: 0, top: 0 })}{corner({ left: 0, bottom: 0 })}{corner({ right: 0, bottom: 0 })}
    </span>
  )
}

/** 1번: 가는 장식 세리프(Diphylleia)를 줄마다 크기를 달리해 엇갈려 쌓고, 은은한 흰 빛. */
const Academy = () => {
  const glow = '0 0 12px rgba(255,255,255,0.45), 0 2px 10px rgba(0,0,0,0.9)'
  return <span style={{ display: 'flex', flexDirection: 'column', fontFamily: fine.style.fontFamily, lineHeight: 1.08, textShadow: glow }}>
    <span style={{ fontSize: '1.2em', alignSelf: 'flex-start', paddingLeft: '0.6em' }}>사관학교</span>
    <span style={{ fontSize: '1.45em', letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>유일한 <span style={{ color: '#f2d27a' }}>여생도</span>는</span>
    <span style={{ fontSize: '1.2em', alignSelf: 'flex-end', paddingRight: '0.6em' }}>숨지 않는다</span>
  </span>
}

/** 3번: 날 선 붓 세리프(Song Myung) 은빛 네 글자, 가라앉는 '몰'만 핏빛. */
const Salvage = () => {
  const silver = 'linear-gradient(180deg,#ffffff 0%,#e4e4e8 45%,#9a9aa3 100%)'
  return <span style={{ fontFamily: brush.style.fontFamily, fontSize: '3em', lineHeight: 1, letterSpacing: '0.02em', whiteSpace: 'nowrap', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.95))' }}>
    <span style={clip(silver)}>침</span><span style={{ color: '#c4141d' }}>몰</span><span style={clip(silver)}>도시</span>
  </span>
}

const DESIGNS: Record<string, () => ReactNode> = { 'original-academy': Academy, 'original-salvage': Salvage }
const FRAMES: Record<string, () => ReactNode> = { 'original-academy': AcademyFrame }

/** 작품별 제목 레터링. 줄마다 크기(em)·글꼴이 다르고, [글자, true] 는 강조색. 없는 작품은 한 줄 기본형. */
type Part = string | [string, true]
type Line = { parts: Part[]; em: number; font?: 'serif' | 'heavy'; spaced?: boolean }
const LETTERING: Record<string, { font: 'serif' | 'heavy'; accent: string; lines: Line[] }> = {
  'original-beauty': { font: 'serif', accent: 'linear-gradient(180deg,#ffe1ea,#e69ab0)', lines: [
    { parts: ['예뻐졌더니'], em: 0.62, spaced: true },
    { parts: ['남주들의 ', ['숨겨진', true]], em: 1.2 },
    { parts: [['재능', true], '이 보인다'], em: 1.2 },
  ] },
  'original-actor': { font: 'heavy', accent: 'linear-gradient(180deg,#ffd0d0,#d63a3a)', lines: [
    { parts: ['국민 배우의'], em: 0.62, font: 'serif', spaced: true },
    { parts: [['친절', true], '을'], em: 1.6 },
    { parts: ['믿지 마세요'], em: 1.1 },
  ] },
  'original-contract': { font: 'heavy', accent: 'linear-gradient(180deg,#ffd0d0,#d63a3a)', lines: [
    { parts: ['맞선 궁합은 ', ['0%', true]], em: 1.3 },
    { parts: ['계약 결혼은 진행합니다'], em: 0.7, font: 'serif', spaced: true },
  ] },
}

/** 표지 하단 가운데의 제목 — 이미지에 글자를 그리지 않고 앱이 얹는다(AI 가 한글을 깨뜨리고, 제목을 고쳐도 다시 그릴 필요가 없다). */
export function CoverTitle({ title, slug, size = 'card' }: { title: string; slug: string; size?: 'card' | 'hero' }) {
  const l = LETTERING[slug] ?? { font: 'heavy' as const, accent: '', lines: [{ parts: [title], em: 1 }] }
  const fam = (f: 'serif' | 'heavy') => (f === 'serif' ? serif : heavy).style.fontFamily
  const Design = DESIGNS[slug]
  const Frame = FRAMES[slug]
  const fontSize = size === 'hero' ? 'clamp(26px, 8vw, 34px)' : 'clamp(12px, 3.6vw, 15px)'
  return (<>
    {Frame && <span style={{ fontSize }}><Frame /></span>}
    <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: size === 'hero' ? '96px 20px 30px' : '56px 8px 14px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', color: '#fff', lineHeight: 1.05,
      fontSize,
      background: 'linear-gradient(to top, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0))' }}>
      {Design ? <Design /> : l.lines.map((ln, i) => (
        <span key={i} style={{ fontFamily: fam(ln.font ?? l.font), fontSize: `${ln.em}em`, letterSpacing: ln.spaced ? '0.28em' : '-0.03em', marginTop: i ? '0.12em' : 0,
          display: 'flex', alignItems: 'center', gap: '0.5em', whiteSpace: 'nowrap', opacity: ln.spaced ? 0.92 : 1,
          textShadow: '0 2px 0 rgba(0,0,0,0.55), 0 0 18px rgba(0,0,0,0.8)' }}>
          {ln.spaced && <span style={{ width: '1.6em', height: 1, background: 'currentColor', opacity: 0.6 }} />}
          <span>{ln.parts.map((p, j) => typeof p === 'string' ? p
            : <span key={j} style={{ backgroundImage: l.accent, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: 'none', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.7))' }}>{p[0]}</span>)}</span>
          {ln.spaced && <span style={{ width: '1.6em', height: 1, background: 'currentColor', opacity: 0.6 }} />}
        </span>
      ))}
    </span>
  </>)
}

/** 표지 이미지는 아직 없다 — 기존 글자 자리표시(CharacterVisual)로 임시 상태임을 그대로 보인다. */
export function StoryCard({ s, compact }: { s: Card; compact?: boolean }) {
  return (
    <TransitionLink href={`/stories/${s.slug}`} aria-label={`${s.title}, ${audienceLabel(s.audience)}`} style={{ display: 'block', color: 'inherit' }}>
      <div style={{ position: 'relative' }}>
        <CharacterVisual name={s.title} accent={null} slug={s.slug} photo={s.cover} ratio="2 / 3" shared={false} scrim={false} />
        <span className="t-micro" style={{ position: 'absolute', left: 8, top: 8, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(var(--color-bg-rgb),0.72)', color: 'var(--color-text-primary)' }}>
          {compact ? (s.audience === 'reverse_harem' ? '역하렘' : 'BL') : audienceLabel(s.audience)}
        </span>
        {s.cover && <CoverTitle title={s.title} slug={s.slug} />}
        {!s.published && <span className="t-micro" style={{ position: 'absolute', right: 8, top: 8, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(var(--color-bg-rgb),0.72)', color: 'var(--color-text-secondary)' }}>미공개</span>}
      </div>
      {!s.cover && <p className="t-body" style={{ marginTop: 8, fontWeight: 'var(--weight-semibold)', lineHeight: 1.35 }}>{s.title}</p>}
      {!compact && <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: s.cover ? 8 : 2 }}>{s.tagline}</p>}
      {!compact && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>{s.genres.slice(0, 3).map(g => <Chip key={g}>#{g.replace(/\s+/g, '')}</Chip>)}</div>}
    </TransitionLink>
  )
}
