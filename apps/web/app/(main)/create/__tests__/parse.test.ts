import { describe, expect, it } from 'vitest'
import { parseCharacterForm } from '../parse'
import { genreValues } from '@/lib/genres'

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

  it('stores multiple genres with a five-genre cap and preserves custom values', () => {
    const form = new FormData()
    form.set('name', '장르 캐릭터')
    form.set('personality', '조용하다.')
    form.set('mood', '드라마,느와르,드라마,직접장르,로맨스,학원,판타지')
    expect(parseCharacterForm(form).world.genre).toBe('드라마 · 느와르 · 직접장르 · 로맨스 · 학원')
    form.set('mood', '')
    expect(parseCharacterForm(form).world.genre).toBeNull()
    form.set('mood', '직접장르,느와르')
    expect(parseCharacterForm(form).world.genre).toBe('직접장르 · 느와르')
    const saved = parseCharacterForm(form).world.genre
    form.set('mood', genreValues(saved).join(','))
    expect(parseCharacterForm(form).world.genre).toBe(saved)
    form.set('mood', `  ${'가'.repeat(21)} · 드라마 , 드 라 마`)
    expect(parseCharacterForm(form).world.genre).toBe(`${'가'.repeat(20)} · 드라마`)
  })
})
