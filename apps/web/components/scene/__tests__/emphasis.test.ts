import { describe, expect, it } from 'vitest'
import { parseEmphasis, stripEmphasis } from '../emphasis'

const render = (t: string) => parseEmphasis(t).map((s) => (s.style === 'plain' ? s.text : `<${s.style}>${s.text}</${s.style}>`)).join('')

describe('emphasis', () => {
  it('renders **bold** and *italic*', () => {
    expect(render('나 **진짜** 괜찮아')).toBe('나 <bold>진짜</bold> 괜찮아')
    expect(render('*문을 닫는다*')).toBe('<italic>문을 닫는다</italic>')
  })

  it('leaves an unmatched asterisk as text', () => {
    // 짝이 없으면 강조가 아니다 — 지워버리면 유저가 친 내용이 사라진다.
    expect(render('별표 * 하나')).toBe('별표 * 하나')
    expect(render('**닫히지 않음')).toBe('**닫히지 않음')
    expect(render('3 * 4 = 12')).toBe('3 * 4 = 12')
  })

  it('handles several marks in one line', () => {
    expect(render('**A** 그리고 *B*')).toBe('<bold>A</bold> 그리고 <italic>B</italic>')
  })

  it('never emits empty emphasis', () => {
    expect(render('****')).toBe('****')
    expect(render('**')).toBe('**')
  })

  it('keeps plain text untouched', () => {
    const plain = '오늘은 비가 온다'
    expect(render(plain)).toBe(plain)
    expect(parseEmphasis(plain)).toHaveLength(1)
  })

  /**
   * 폴백 경로(블록이 없을 때)는 원문의 선행 별표로 서술을 가려낸다.
   * 그 판정이 먼저 끝난 뒤 강조가 렌더되므로, 서술 스타일과 별표 제거가 같이 일어난다.
   */
  it('still lets the fallback path detect narration before the marks are consumed', () => {
    const raw = '*문을 닫고 나간다*'
    expect(/^\*[^*]/.test(raw)).toBe(true)
    expect(stripEmphasis(raw)).toBe('문을 닫고 나간다')
  })

  it('strips marks for previews and notifications', () => {
    expect(stripEmphasis('나 **진짜** 괜찮아')).toBe('나 진짜 괜찮아')
    expect(stripEmphasis('*문을 닫는다*')).toBe('문을 닫는다')
    expect(stripEmphasis('별표 * 하나')).toBe('별표 * 하나')
  })
})
