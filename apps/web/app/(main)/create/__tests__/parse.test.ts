import { describe, expect, it } from 'vitest'
import { parseCharacterForm } from '../parse'
import { genreValues } from '@/lib/genres'

describe('character form parser', () => {
  it('tracks only the three deliberately touched numeric traits without making defaults explicit', () => {
    const form = new FormData()
    form.set('name', '성향'); form.set('personality', '조용하다.'); form.set('jealousy', '50')
    expect(parseCharacterForm(form).agencyExplicitFields).toEqual([])
    form.append('agencyExplicitField', 'personality.jealousy')
    form.append('agencyExplicitField', 'personality.jealousy')
    form.append('agencyExplicitField', 'personality.initiative')
    form.append('agencyExplicitField', 'invented.canon')
    expect(parseCharacterForm(form).agencyExplicitFields).toEqual(['personality.jealousy', 'personality.initiative'])
  })

  it('never carries an experience type, even when the form tries to send one', () => {
    // 유형 자체는 폼에서 받지 않는다. 생성/편집 액션이 저장된 유형과 명시적 연락 선택으로 결정한다.
    const form = new FormData()
    form.set('name', '변조'); form.set('personality', '조용하다.')
    form.set('experienceType', 'reality'); form.set('experience_type', 'reality')
    const p = parseCharacterForm(form)
    expect('experienceType' in p.character).toBe(false)
    expect(JSON.stringify(p)).not.toMatch(/reality/)
  })

  it('uses defaults for absent numbers and preserves explicit zero and precise values', () => {
    const form = new FormData()
    form.set('name', '기본값'); form.set('personality', '차분하다.')
    expect(parseCharacterForm(form).initialRelationship.trust).toBe(30)
    expect(parseCharacterForm(form).contact.contactFrequency).toBe(50)
    form.set('trust', '0'); form.set('contactFrequency', '63')
    expect(parseCharacterForm(form).initialRelationship.trust).toBe(0)
    expect(parseCharacterForm(form).contact.contactFrequency).toBe(63)
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
