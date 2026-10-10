'use client'
import { useId, useState } from 'react'
import { RichText, type RichNames } from '@/components/scene/rich-text'
import { useT } from '@/lib/i18n/client'

export type IntroScene = {
  /** 폼으로 보내는 값(도입부 이름). */
  value: string
  label: string
  /** 시각 · 장소 — 테두리 상자 한 줄. */
  meta: string
  context: string
  lines: Array<{ role: 'character' | 'narrator'; text: string; image?: string }>
}

/**
 * 상세의 '첫 장면' — 시작 상황 칩, 시각·장소 상자, 도입부 대사와 서술(10/8, 위프 스크린샷처럼).
 * 고른 칩은 아래 '대화 시작하기' 폼으로 간다(form 속성). 도입부가 하나면 칩 없이 그것만 보인다.
 */
export function IntroPreview({ scenes, names }: { scenes: IntroScene[]; names: RichNames }) {
  const t = useT()
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const scene = scenes[index]
  if (!scene) return null
  const longIntro = scene.lines.reduce((length, line) => length + line.text.length, 0) > 500
  const firstNarration = scene.lines.find((line) => line.role === 'narrator')
  const firstSpeech = scene.lines.find((line) => line.role === 'character')
  const previewLines = scene.lines.filter((line) => line === firstNarration || line === firstSpeech)
  const lines = longIntro && !expanded ? previewLines : scene.lines
  return (
    <div className="intro-preview">
      {scenes.length > 1 && (
        <fieldset className="intro-scenes">
          <legend className="sr-only">{t('시작 상황')}</legend>
          {scenes.map((s, i) => (
            <label key={s.value} className="intro-chip">
              <input type="radio" name="scene" value={s.value} form="start-roleplay" checked={i === index} onChange={() => { setIndex(i); setExpanded(false) }} />
              <span>{s.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      {scene.meta && <p className="intro-meta">{scene.meta}</p>}
      <div id={contentId} className="intro-preview">
      {scene.context && (!longIntro || expanded) && <RichText editorial text={scene.context} names={names} />}
      {lines.map((line, i) => (
        <div key={`${scene.value}-${i}`} className="intro-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- 시드가 올린 공개 장면 사진 한 장 */}
          {line.image && <img src={line.image} alt="" loading="lazy" decoding="async" className="intro-photo" />}
          {line.role === 'character'
            ? <div className="intro-bubble"><RichText editorial text={line.text} names={names} /></div>
            : <RichText editorial text={line.text} names={names} />}
        </div>
      ))}
      </div>
      {longIntro && (
        <button type="button" className="intro-expand" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}>
          {expanded ? t('인트로 접기') : t('인트로 전체 보기')}
        </button>
      )}
    </div>
  )
}
