'use client'
import { CharacterSettingsView } from '../character/[slug]/settings-view'
import { parseCharacterForm } from './parse'
import { Accordion, Button } from '@/components/ui'
import { LikeButton, Rule, RealityStrip, SampleDialogue, Stat } from '../character/[slug]/sections'
import { PhotoHero } from '../character/[slug]/hero'
import { subject } from '@/lib/format'

/** 소개 페이지 미리보기에 필요한 값. 탭을 열 때 폼에서 한 번 읽는다. */
export type Snapshot = {
  settings: ReturnType<typeof parseCharacterForm>
  name: string; tagline: string; age: string; nationality: string; occupation: string; mbti: string
  personality: string; worldSetting: string; startingContext: string; startingTime: string
  keywords: string[]
  dialogue: Array<{ role: 'character' | 'user' | 'narrator'; text: string }>
  /** 고른 사진들의 URL. 첫 장이 대표, 나머지는 갤러리. 새로 고른 파일은 이 화면 동안만 유효한 object URL. */
  photo: string | null
  gallery: string[]
}

export function snapshot(form: HTMLFormElement): Snapshot {
  const fd = new FormData(form)
  const s = (k: string) => String(fd.get(k) ?? '').trim()
  const csv = (k: string) => s(k).split(',').map((t) => t.trim()).filter(Boolean)
  let dialogue: Snapshot['dialogue'] = []
  try { const raw = JSON.parse(s('sampleDialogue') || '[]'); if (Array.isArray(raw)) dialogue = raw } catch { /* 비어 있는 것으로 */ }
  // 이미 저장된 사진(keptImages) + 새로 고른 파일(images) 을 imageOrder 순서로 합친다 — ImagePicker 와 같은 규칙.
  const keptImages = fd.getAll('keptImages').map(String)
  const newFiles = fd.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
  const order = fd.getAll('imageOrder').map(String)
  let keptIdx = 0
  let newIdx = 0
  const photos = order.length > 0
    ? order.map((kind) => {
        if (kind === 'existing') return keptImages[keptIdx++]
        const f = newFiles[newIdx++]
        return f ? URL.createObjectURL(f) : undefined
      })
    : [...keptImages, ...newFiles.map((f) => URL.createObjectURL(f))]
  const photoUrls = photos.filter((u): u is string => Boolean(u))
  return {
    settings: parseCharacterForm((() => { const data = new FormData(); fd.forEach((value, key) => data.append(key, value)); data.set('intent', 'draft'); if (!s('name')) data.set('name', '이름'); return data })()),
    name: s('name'), tagline: s('title'), age: s('age'), nationality: s('nationality'), occupation: s('occupation'), mbti: s('mbti'),
    personality: s('personality'), worldSetting: s('worldSetting'), startingContext: s('startingContext'), startingTime: s('startingTime'),
    keywords: [...csv('mood'), ...csv('relationshipKeywords')],
    dialogue, photo: photoUrls[0] ?? null, gallery: photoUrls.slice(1),
  }
}

/**
 * 상세 페이지(character/[slug]/page.tsx)와 같은 순서·같은 부품으로 그린다.
 * 실제 페이지의 구조가 바뀌면 여기도 같이 바꿔야 한다 — 둘이 어긋나면 미리보기가 거짓말을 한다.
 */
export function DetailPreview({ d }: { d: Snapshot | null }) {
  if (!d) return null
  const name = d.name || '이름'
  // 상세와 같은 문장 규칙: '32세 · 한국 · 검사.' / 'MBTI는 INTJ.'
  const profile: string[] = [
    [
      [[d.age && `${d.age}세`, d.nationality, d.occupation].filter(Boolean).join(' · '), '.'].join(''),
      d.mbti ? `MBTI는 ${d.mbti}.` : '',
    ].filter((x) => x && x !== '.').join(' '),
  ].filter((line) => line.trim())
  const pill: React.CSSProperties = { position: 'absolute', top: 16, zIndex: 5, minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(var(--color-bg-rgb),0.6)', color: 'var(--color-text-primary)' }

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 10 }}>{d.settings.isPublicOn ? '공개 게시하면 다른 사람에게 이렇게 보여요.' : '나만 볼 수 있는 캐릭터로 게시돼요.'}</p>
      <div className="character-detail-theme" aria-label="소개 페이지 미리보기" style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--color-border)', background: '#141416' }}>
        {/* 상세와 같은 자리: 왼쪽 위 뒤로, 오른쪽 위 편집(주인에게만 보이는 것) */}
        <span aria-hidden style={{ ...pill, left: 16, padding: '0 10px', background: 'transparent', color: 'var(--color-text-secondary)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </span>
        <span aria-hidden className="t-caption" style={{ ...pill, right: 16, fontWeight: 'var(--weight-medium)' }}>편집</span>

        <div style={{ position: 'relative' }}><PhotoHero name={name} accent={null} slug="preview" photos={[d.photo, ...d.gallery].filter((src): src is string => Boolean(src))} shared={false} /><div style={{ position: 'absolute', bottom: 16, right: 'var(--gutter)', zIndex: 4 }}><LikeButton overlay /></div></div>

        <div className="character-detail-copy" style={{ padding: '18px var(--gutter) 0', position: 'relative' }}>
          <p className="t-hero t-name" style={{ marginBottom: 4, fontWeight: 800, letterSpacing: '-0.045em', color: d.name ? undefined : 'var(--color-text-tertiary)' }}>{name}</p>
          <p className="t-body-lg t-quote" style={{ color: d.tagline ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', lineHeight: 1.45, letterSpacing: '-0.025em', marginBottom: 6 }}>
            {d.tagline || '소개 한 줄이 여기에 걸립니다.'}
          </p>
          {d.keywords.length > 0 && (
            <p className="t-caption" style={{ color: 'var(--color-white)', letterSpacing: '-0.025em', marginBottom: 10 }}>{d.keywords.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ')}</p>
          )}
          {/* 통계 칩 — 대화한 사람 수는 0 이라 상세처럼 숨긴다. 보관하기는 모양만. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <Stat icon="comment" label="댓글 0" />
            <LikeButton />

          </div>

          <RealityStrip />
          {d.worldSetting && (
            <Rule label="세계관">
              <p className="t-body-lg" style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{d.worldSetting}</p>
            </Rule>
          )}
          <CharacterSettingsView name={name} visual={d.settings.visual} contact={d.settings.contact} />

          <Rule label="첫 장면">
            <div className="detail-prose">
              <p className="t-body-lg t-quote" style={{ color: d.startingContext ? undefined : 'var(--color-text-tertiary)' }}>
                {d.startingContext || '첫 장면을 아직 적지 않았어요.'}
              </p>
              <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginTop: 8 }}>{d.startingTime || '저녁'}부터 시작합니다.</p>
            </div>
            {d.dialogue.length > 0 && (
              <div style={{ marginTop: 18 }}><SampleDialogue name={name} portrait={d.photo} turns={d.dialogue} /></div>
            )}
          </Rule>

          <div style={{ marginTop: 'var(--space-7)' }}>
            <Accordion title="이 사람에 대해">
              <div className="detail-prose">
                <p className="t-body-lg" style={{ color: d.personality ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}>
                  {d.personality || '성격을 아직 적지 않았어요.'}
                </p>
                {profile.map((line) => <p key={line} className="t-body-lg" style={{ color: 'var(--color-text-secondary)' }}>{line}</p>)}
              </div>
            </Accordion>
          </div>

          <Rule label="댓글 0" action={<span className="t-caption" style={{ color: 'var(--color-accent-text)', fontWeight: 'var(--weight-semibold)' }}>전체보기</span>}>
            <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>아직 댓글이 없어요.</p>
          </Rule>
        </div>

        {/* 비슷한 캐릭터 — 같은 분위기의 다른 캐릭터가 있을 때 여기에 실린다. */}
        <section aria-label="비슷한 캐릭터" style={{ marginTop: 'var(--space-7)', padding: '0 var(--gutter)' }}>
          <h2 className="t-title-3" style={{ marginBottom: 8 }}>{subject(name)} 마음에 들었다면</h2>
          <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>같은 분위기의 다른 캐릭터가 등록되어 있으면 여기에 실립니다.</p>
        </section>

        {/* 상세의 고정 하단 문 — 미리보기 안에서는 맨 아래에 */}
        <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--color-border-strong)', padding: '10px var(--gutter)', marginTop: 'var(--space-6)', background: '#141416' }}>
          <div style={{ flex: 1 }}><Button type="button" variant="primary" size="lg" style={{ minHeight: 42, height: 42, padding: '8px 16px', fontSize: 14 }} full disabled>대화 시작하기</Button></div>
        </div>
      </div>
    </div>
  )
}
