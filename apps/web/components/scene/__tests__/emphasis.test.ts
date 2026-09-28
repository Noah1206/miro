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

  it('leaves emoticons alone — asterisks around only symbols are not emphasis', () => {
    // 사용자 말풍선에서 *^^* 의 별표가 지워지고 ^^ 만 기울어졌다(9/27). 글자·숫자가 없는 짝은 그대로 둔다.
    expect(render('고마워요 *^^*')).toBe('고마워요 *^^*')
    expect(render('좋아 *_* 헐 *.*')).toBe('좋아 *_* 헐 *.*')
    expect(render('**^^**')).toBe('**^^**')
    expect(render('* 공백 *')).toBe('* 공백 *')
    expect(render('*조심스럽게 고개를 숙이며* 안녕하세요')).toBe('<italic>조심스럽게 고개를 숙이며</italic> 안녕하세요')
    expect(render('*1위*')).toBe('<italic>1위</italic>')
    expect(render('고마워 *ㅠㅠ*')).toBe('고마워 *ㅠㅠ*')
    expect(render('*ㅋㅋ*')).toBe('*ㅋㅋ*')
    expect(render('*ㅋㅋ 진짜*')).toBe('<italic>ㅋㅋ 진짜</italic>')
  })

  it('keeps the model’s silence and exclamation marks as emphasis', () => {
    expect(render('*…* 침묵 *...* 그리고 *!*')).toBe('<italic>…</italic> 침묵 <italic>...</italic> 그리고 <italic>!</italic>')
  })

  it('stays fast on a line of nothing but asterisks', () => {
    const stars = '*'.repeat(2000)
    const t = performance.now()
    expect(render(stars)).toBe(stars)
    expect(performance.now() - t).toBeLessThan(50)
  })

  it('keeps plain text untouched', () => {
    const plain = '오늘은 비가 온다'
    expect(render(plain)).toBe(plain)
    expect(parseEmphasis(plain)).toHaveLength(1)
  })

  /**
   * 폴백 경로(블록이 없을 때)는 첫 문단이 기울임 강조로 시작하는지로 서술을 가려낸다 — 렌더와 같은 파서라
   * 별표가 그대로 남는 글(`*^^* 안녕`)은 서술로 잡히지 않는다.
   */
  it('still lets the fallback path detect narration before the marks are consumed', () => {
    const raw = '*문을 닫고 나간다*'
    expect(parseEmphasis(raw)[0]?.style).toBe('italic')
    expect(parseEmphasis('*^^* 안녕')[0]?.style).toBe('plain')
    expect(stripEmphasis(raw)).toBe('문을 닫고 나간다')
  })

  it('strips marks for previews and notifications', () => {
    expect(stripEmphasis('나 **진짜** 괜찮아')).toBe('나 진짜 괜찮아')
    expect(stripEmphasis('*문을 닫는다*')).toBe('문을 닫는다')
    expect(stripEmphasis('별표 * 하나')).toBe('별표 * 하나')
  })
})
