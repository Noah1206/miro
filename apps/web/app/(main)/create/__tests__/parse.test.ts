import { describe, expect, it } from 'vitest'
import { parseCharacterForm } from '../parse'
import { genreValues } from '@/lib/genres'

function realityForm() {
  const form = new FormData()
  form.set('experienceType', 'reality')
  form.set('intent', 'draft')
  return form
}

describe('character form parser', () => {
  it('tracks only the three deliberately touched numeric traits without making defaults explicit', () => {
    const form = realityForm()
    form.set('name', '성향'); form.set('personality', '조용하다.'); form.set('jealousy', '50')
    expect(parseCharacterForm(form).agencyExplicitFields).toEqual([])
    form.append('agencyExplicitField', 'personality.jealousy')
    form.append('agencyExplicitField', 'personality.jealousy')
    form.append('agencyExplicitField', 'personality.initiative')
    form.append('agencyExplicitField', 'invented.canon')
    expect(parseCharacterForm(form).agencyExplicitFields).toEqual(['personality.jealousy', 'personality.initiative'])
  })

  it('keeps the intro location on the world and leaves it empty when the field is blank', () => {
    const form = realityForm()
    form.set('name', '장소'); form.set('personality', '조용하다.')
    expect(parseCharacterForm(form).world.location).toBeNull()
    form.set('worldLocation', '  서울, 경호업체 사무실  ')
    expect(parseCharacterForm(form).world.location).toBe('서울, 경호업체 사무실')
    form.set('worldLocation', '가'.repeat(80))
    expect(parseCharacterForm(form).world.location).toHaveLength(60)
  })

  it('requires an explicit type and rejects a change during edit', () => {
    const form = realityForm()
    form.set('name', '변조'); form.set('personality', '조용하다.')
    const p = parseCharacterForm(form)
    expect(p.experienceType).toBe('reality')
    expect(() => parseCharacterForm(form, 'chat')).toThrow('CHARACTER_TYPE_IMMUTABLE')
    form.set('experienceType', 'invented')
    expect(() => parseCharacterForm(form)).toThrow('INVALID_CHARACTER_TYPE')
    form.delete('experienceType')
    expect(() => parseCharacterForm(form)).toThrow('INVALID_CHARACTER_TYPE')
  })

  it('uses defaults for absent numbers and preserves explicit zero and precise values', () => {
    const form = realityForm()
    form.set('name', '기본값'); form.set('personality', '차분하다.')
    expect(parseCharacterForm(form).initialRelationship.trust).toBe(30)
    expect(parseCharacterForm(form).contact.contactFrequency).toBe(50)
    form.set('trust', '0'); form.set('contactFrequency', '63')
    expect(parseCharacterForm(form).initialRelationship.trust).toBe(0)
    expect(parseCharacterForm(form).contact.contactFrequency).toBe(63)
  })

  it('stores multiple genres with a five-genre cap and preserves custom values', () => {
    const form = realityForm()
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

  it('accepts a standard chat without Reality fields and rejects injected settings', () => {
    const form = new FormData()
    form.set('experienceType', 'chat')
    form.set('name', '대화 캐릭터')
    form.set('title', '첫 소개')
    form.set('personality', '차분하고 짧은 말투')
    form.set('startingContext', '서점에서 처음 만난다.')
    const parsed = parseCharacterForm(form)
    expect(parsed.experienceType).toBe('chat')
    expect(parsed.contact.enabled).toBe(false)
    expect(parsed.character.personality).toContain('짧은 말투')
    form.set('contactEnabled', 'on')
    expect(() => parseCharacterForm(form)).toThrow('CHARACTER_TYPE_SETTINGS_INVALID')
    form.delete('contactEnabled')
    form.append('agencyExplicitField', 'personality.initiative')
    expect(() => parseCharacterForm(form)).toThrow('CHARACTER_TYPE_SETTINGS_INVALID')
  })
})
