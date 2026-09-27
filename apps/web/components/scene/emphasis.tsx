import { Fragment } from 'react'

/**
 * 대사 안의 강조 표기. 모델은 시키지 않아도 `**강조**` 와 `*서술*` 을 섞어 쓴다 —
 * 처리하지 않으면 별표가 그대로 글자로 보인다.
 *
 * 텍스트 노드로만 만든다. HTML 을 만들지 않으므로 모델 출력이 마크업이 될 길이 없다.
 * 사용자 말풍선도 이 규칙으로 그린다(9/27). 별표 사이에 글자·숫자가 하나도 없거나(*^^*, *_*, *.*, *ㅠㅠ* 같은 이모티콘 — 낱자 자모만 있는
 * 짝도 이모티콘으로 본다) 여는 별표 뒤·닫는 별표 앞이 공백이면(`*_* 헐 *.*` 의 가운데) 강조가 아니다. 모델이 쓰는 침묵·감탄 표기
 * `*…*` `*...*` `*!*` 는 강조로 남긴다.
 * ponytail: `**`/`*` 만 본다. 링크·목록·코드까지 필요해지면 그때 파서를 올린다.
 */
// 앞의 조건은 다음 별표 전에 글자·숫자(또는 …·..·!·?)가 있는지만 본다 — 별표를 넘지 못하므로 한 번 훑고 끝난다.
const INNER = '(?=[^*\\n]*(?![ㄱ-ㆎ])(?:[\\p{L}\\p{N}…!?]|\\.\\.))([^*\\n\\s](?:[^*\\n]*?[^*\\n\\s])?)'
// 여는 `**+` 는 앞보기로 잡아 고정한다 — 별표만 이어진 줄에서 런을 되돌리며 제곱으로 느려지지 않는다. 그룹 번호는 그대로다.
const PATTERN = new RegExp(`(?=(\\*\\*+))\\1${INNER}\\1|(\\*)${INNER}\\*`, 'gu')

export type Span = { text: string; style: 'plain' | 'bold' | 'italic' }

/** 짝이 맞는 별표만 강조로 본다. 홀로 남은 별표는 글자 그대로 둔다. */
export function parseEmphasis(text: string): Span[] {
  const spans: Span[] = []
  let last = 0
  for (const m of text.matchAll(PATTERN)) {
    const at = m.index!
    if (at > last) spans.push({ text: text.slice(last, at), style: 'plain' })
    spans.push(m[1] ? { text: m[2]!, style: 'bold' } : { text: m[4]!, style: 'italic' })
    last = at + m[0].length
  }
  if (last < text.length) spans.push({ text: text.slice(last), style: 'plain' })
  return spans
}

export function Emphasis({ text }: { text: string }) {
  const spans = parseEmphasis(text)
  if (spans.length === 1 && spans[0]!.style === 'plain') return <>{text}</>
  return <>{spans.map((s, i) => (
    <Fragment key={i}>
      {s.style === 'bold' ? <strong>{s.text}</strong> : s.style === 'italic' ? <em>{s.text}</em> : s.text}
    </Fragment>
  ))}</>
}

/** 표시용 텍스트에서 강조 표기를 걷어낸다 — 미리보기·알림처럼 스타일을 못 쓰는 자리. */
export function stripEmphasis(text: string): string {
  return parseEmphasis(text).map((s) => s.text).join('')
}
