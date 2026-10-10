import { Fragment, type CSSProperties } from 'react'
import type { EditorialPalette } from './character-editorial'
import { parseEmphasis } from './emphasis'
import { editorialHeading, editorialLines } from './editorial-text'

export type RichNames = { character: string; user: string[]; palette?: EditorialPalette; motifs?: string[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 이름·당신·이야기 핵심어를 구분한다. 상세에서만 캐릭터별 팔레트를 적용한다. */
function Names({ text, names, editorial }: { text: string; names: RichNames; editorial: boolean }) {
  const all = [...new Set([names.character, ...names.user, ...(editorial ? names.motifs ?? [] : [])].map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!all.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${all.map(escape).join('|')})`, 'g'))
  let motifs = 0
  return <>{parts.map((p, i) => {
    if (i % 2 === 0) return p
    const role = p === names.character.trim() ? 'rt-char' : names.user.some(n => n.trim() === p) ? 'rt-user' : 'rt-motif'
    if (role === 'rt-motif' && ++motifs > 2) return p
    return editorial && role === 'rt-motif'
      ? <strong key={i} className={role}>{p}</strong>
      : <span key={i} className={role}>{p}</span>
  })}</>
}

/**
 * 캐릭터 소개·인트로 글(10/8, 위프 스크린샷처럼). 텍스트 노드로만 만든다 — 작성자 글이 마크업이 될 길이 없다.
 * `[제목]` 한 줄은 굵은 소제목, `**굵게**`·`*기울임*`, 빈 줄은 문단 사이 여백.
 */
export function RichText({ text, names, className, editorial = false }: { text: string; names: RichNames; className?: string; editorial?: boolean }) {
  const lines = editorial ? editorialLines(text) : text.split('\n')
  const palette = editorial ? names.palette : undefined
  const colorStyle = palette ? { '--color-name-character': palette.character, '--color-name-user': palette.user, '--color-editorial-motif': palette.motif } as CSSProperties : undefined
  let relationshipLead = false
  return (
    <div className={`rich-text ${editorial ? 'rich-text--editorial' : ''} ${className ?? ''}`} style={colorStyle}>
      {lines.map((line, i) => {
        const heading = line.trim().match(/^\[(.+)\]$/)
        if (heading) {
          relationshipLead = editorial && /^(당신|관계|you|relationship)$/i.test(heading[1]!.trim())
          const decoration = editorialHeading(heading[1]!)
          return <p key={i} className={`rt-heading ${editorial ? `rt-heading--${decoration.tone}` : ''}`}>
            {editorial && <span className="rt-heading-icon" aria-hidden>{decoration.icon}</span>}{heading[1]}
          </p>
        }
        if (!line.trim()) return <p key={i} className="rt-gap" aria-hidden />
        const lead = relationshipLead
        relationshipLead = false
        const content = parseEmphasis(line).map((s, k) => (
          <Fragment key={k}>
            {s.style === 'bold' ? <strong><Names text={s.text} names={names} editorial={editorial} /></strong>
              : s.style === 'italic' ? <em><Names text={s.text} names={names} editorial={editorial} /></em>
                : <Names text={s.text} names={names} editorial={editorial} />}
          </Fragment>
        ))
        return <p key={i} className={editorial && /^\s*[·•-]\s/.test(line) ? 'rt-list-item' : undefined}>
          {lead ? <strong>{content}</strong> : content}
        </p>
      })}
    </div>
  )
}
