import { Fragment } from 'react'
import { parseEmphasis } from './emphasis'
import { editorialHeading, editorialLines } from './editorial-text'

export type RichNames = { character: string; user: string[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 캐릭터 이름은 라벤더, 나(당신·페르소나 이름)는 관계색. */
function Names({ text, names }: { text: string; names: RichNames }) {
  const all = [names.character, ...names.user].map((n) => n.trim()).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!all.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${all.map(escape).join('|')})`, 'g'))
  return <>{parts.map((p, i) => i % 2 === 0 ? p
    : <span key={i} className={p === names.character.trim() ? 'rt-char' : 'rt-user'}>{p}</span>)}</>
}

/**
 * 캐릭터 소개·인트로 글(10/8, 위프 스크린샷처럼). 텍스트 노드로만 만든다 — 작성자 글이 마크업이 될 길이 없다.
 * `[제목]` 한 줄은 굵은 소제목, `**굵게**`·`*기울임*`, 빈 줄은 문단 사이 여백.
 */
export function RichText({ text, names, className, editorial = false }: { text: string; names: RichNames; className?: string; editorial?: boolean }) {
  const lines = editorial ? editorialLines(text) : text.split('\n')
  return (
    <div className={`rich-text ${editorial ? 'rich-text--editorial' : ''} ${className ?? ''}`}>
      {lines.map((line, i) => {
        const heading = line.trim().match(/^\[(.+)\]$/)
        if (heading) {
          const decoration = editorialHeading(heading[1]!)
          return <p key={i} className={`rt-heading ${editorial ? `rt-heading--${decoration.tone}` : ''}`}>
            {editorial && <span className="rt-heading-icon" aria-hidden>{decoration.icon}</span>}{heading[1]}
          </p>
        }
        if (!line.trim()) return <p key={i} className="rt-gap" aria-hidden />
        return <p key={i} className={editorial && /^\s*[·•-]\s/.test(line) ? 'rt-list-item' : undefined}>{parseEmphasis(line).map((s, k) => (
          <Fragment key={k}>
            {s.style === 'bold' ? <strong><Names text={s.text} names={names} /></strong>
              : s.style === 'italic' ? <em><Names text={s.text} names={names} /></em>
                : <Names text={s.text} names={names} />}
          </Fragment>
        ))}</p>
      })}
    </div>
  )
}
