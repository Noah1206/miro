import { describe, expect, it } from 'vitest'
import { parseCharacterForm } from '../parse'

describe('character form parser', () => {
  it('never carries an experience type, even when the form tries to send one', () => {
    // 폼 필드를 변조해 chat 을 reality 로 올리려는 시도. 파서가 필드를 화이트리스트하므로
    // insert 에 닿지 않고 DB 기본값(chat)이 적용된다. 지정은 운영 콘솔만 한다.
    const form = new FormData()
    form.set('name', '변조'); form.set('personality', '조용하다.')
    form.set('experienceType', 'reality'); form.set('experience_type', 'reality')
    const p = parseCharacterForm(form)
    expect('experienceType' in p.character).toBe(false)
    expect(JSON.stringify(p)).not.toMatch(/reality/)
  })
})
