'use client'
import { CharacterBriefing } from '@/components/character-briefing'
import type { CharacterEntry } from '@/lib/character-entry'
import { useId, useState, type ReactNode } from 'react'
import { RichText, type RichNames } from '@/components/scene/rich-text'
import { useT } from '@/lib/i18n/client'
import { Rule, SampleDialogue } from './sections'
import { UnveilCover } from '@/components/unveil-badge'
import { SPEECH_LINE } from '@/app/(main)/chat/[sessionId]/reply-segments'

export type IntroScene = {
  /** 폼으로 보내는 값(도입부 이름). */
  briefing?: CharacterEntry | null
  value: string
  label: string
  /** 시각 · 장소 — 작은 보조 텍스트 한 줄. */
  meta: string
  context: string
  lines: Array<{ role: 'character' | 'narrator'; text: string; image?: string }>
  /** 11/21 인트로 상태창 — 인트로 끝에 접는 카드(대화방 첫 화면과 같은 값). */
  status?: string
}

/**
 * 상세의 '첫 장면' — 시작 상황 텍스트 탭, 시각·장소 안내, 도입부 대사와 서술(10/8, 위프 스크린샷처럼).
 * 고른 칩은 아래 '대화 시작하기' 폼으로 간다(form 속성). 도입부가 하나면 칩 없이 그것만 보인다.
 */
export function IntroPreview({ scenes, names, portrait, turns, veil, start }: {
  scenes: IntroScene[]; names: RichNames; portrait: string | null
  /** 11/5: 인트로 섹션 바로 밑의 '대화 바로 시작하기' 버튼. */
  start?: ReactNode
  /** 11/4: 언베일 수위 장면 사진을 흐리고, 누르면 성인 본인인증 → 언베일 켜기. 언베일을 켠 사람에겐 null. */
  veil?: { signedIn: boolean; returnTo: string } | null
  turns: Array<{ role: 'character' | 'user' | 'narrator'; text: string }>
}) {
  const t = useT()
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(true)
  const contentId = useId()
  const scene = scenes[index]
  if (!scene) return null
  // The briefing already displays the two added narration entries. Keep their scene photo.
  const sceneLines = scene.briefing ? scene.lines.slice(2).map((line, i) => i === 0 ? { ...line, image: scene.lines[0]?.image ?? line.image } : line) : scene.lines
  const longIntro = sceneLines.reduce((length, line) => length + line.text.length, 0) > 500
  const firstNarration = sceneLines.find(line => line.role === 'narrator')
  const firstSpeech = sceneLines.find(line => line.role === 'character')
  const lines = longIntro && !expanded ? sceneLines.filter(line => line === firstNarration || line === firstSpeech) : sceneLines
  return (
    <>
    <Rule label={t('시작 설정')}>
    <div className="intro-preview">
      {scenes.length > 1 && (
        // 11/5 사용자: 시작 상황 탭 → 드롭다운.
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <select name="scene" form="start-roleplay" aria-label={t('시작 상황')} value={scenes[index]?.value}
            onChange={(e) => { setIndex(Math.max(0, scenes.findIndex(s => s.value === e.target.value))); setExpanded(true) }}
            style={{ width: '100%', minHeight: 48, padding: '0 40px 0 14px', appearance: 'none', WebkitAppearance: 'none', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-strong)', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 'var(--weight-semibold)', fontFamily: 'inherit', cursor: 'pointer' }}>
            {scenes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-secondary)' }}><path d="m6 9 6 6 6-6" /></svg>
        </div>
      )}
      {scene.briefing && <CharacterBriefing entry={scene.briefing} />}
      {scene.meta && <p className="intro-meta">{scene.meta}</p>}
      <div id={contentId} className="intro-preview">
      {!scene.briefing && scene.context && (!longIntro || expanded) && <NarrationWithSpeech text={scene.context} names={names} />}
      {lines.map((line, i) => (
        <div key={`${scene.value}-${i}`} className="intro-line">
          {line.role === 'character'
            ? <div className="intro-bubble"><RichText editorial text={line.text} names={names} /></div>
            : <NarrationWithSpeech text={line.text} names={names} />}
          {/* 11/8 사용자: 상황 설명 글 다음에 그 장면 사진 */}
          {/* eslint-disable-next-line @next/next/no-img-element -- 시드가 올린 공개 장면 사진 한 장 */}
          {line.image && (veil
            ? <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 'var(--radius-md)' }}>
                <img src={line.image} alt="" loading="lazy" decoding="async" className="intro-photo" />
                <UnveilCover veiled label={t('언베일')} unlock={veil} />
              </div>
            : <img src={line.image} alt="" loading="lazy" decoding="async" className="intro-photo" />)}
        </div>
      ))}
      {scene.status && (!longIntro || expanded) && <details open className="intro-status" style={{ margin: '4px 0 2px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-1)', overflow: 'hidden' }}>
        <summary style={{ cursor: 'pointer', padding: '8px 12px', fontSize: 12, letterSpacing: '.06em', color: 'var(--color-text-secondary)', userSelect: 'none' }}>{t('상태창')}</summary>
        <pre style={{ margin: 0, padding: '0 12px 12px', font: '12.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{scene.status}</pre>
      </details>}
      {/* 11/5: 인트로 끝에 입력 중 말풍선(…) — 11/6 사용자: 내가 적는 쪽이라 오른쪽 정렬 */}
      {(!longIntro || expanded) && <div className="intro-line" style={{ alignItems: 'flex-end' }}><div className="intro-bubble intro-typing" aria-hidden><span /><span /><span /></div></div>}
      </div>
      {longIntro && (
        <button type="button" className="intro-expand" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}>
          {expanded ? t('인트로 접기') : t('인트로 전체 보기')}
        </button>
      )}
    </div>
    </Rule>
    {start && <div style={{ marginTop: 'var(--space-4)' }}>{start}</div>}
    {turns.length > 0 && (
      <Rule label={t('대화 예시')}>
        <div className="detail-chat-preview">
          <SampleDialogue name={names.character} names={names} portrait={portrait}
            turns={turns} />
        </div>
      </Rule>
    )}
    </>
  )
}

/**
 * 11/21 사용자: 서술 안에 섞인 `이름 |"대사"` 줄(사람의 말)은 채팅방처럼 굵은 흰 글씨 '이름 | "대사"' 로, 나머지 줄은 회색 서술로.
 * 이어진 서술 줄은 한 덩어리(RichText)로 둔다.
 */
function NarrationWithSpeech({ text, names }: { text: string; names: RichNames }) {
  const parts: Array<{ prose: string } | { who: string; said: string }> = []
  for (const line of text.split('\n')) {
    const m = SPEECH_LINE.exec(line.trim())
    if (m) { parts.push({ who: m[1]!.trim(), said: m[2]! }); continue }
    const last = parts.at(-1)
    if (last && 'prose' in last) last.prose += '\n' + line
    else parts.push({ prose: line })
  }
  return <>{parts.map((p, i) => 'prose' in p
    ? (p.prose.trim() ? <RichText key={i} editorial className="intro-narration" text={p.prose.trim()} names={names} /> : null)
    : <p key={i} className="intro-speech"><strong>{p.who}</strong> | &quot;{p.said}&quot;</p>)}</>
}
