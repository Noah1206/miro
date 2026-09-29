import { describe, expect, it } from 'vitest'
import { languageRule } from '@miro/domain'
import { pickLanguage, translate } from './index'

describe('화면 번역', () => {
  it('uses the dictionary, falls back to the Korean source, and fills placeholders', () => {
    const en = { '다음': 'Next', '{name}의 연락': 'A message from {name}' }
    expect(translate(en, '다음')).toBe('Next')
    expect(translate(null, '다음')).toBe('다음')
    expect(translate(en, '사전에 없는 말')).toBe('사전에 없는 말')
    expect(translate(en, '{name}의 연락', { name: 'Thomas' })).toBe('A message from Thomas')
    expect(translate(null, '{name}의 연락', { name: '토마스' })).toBe('토마스의 연락')
    expect(translate(en, '{name}의 연락', {})).toBe('A message from {name}')
  })

  it('picks the cookie first, then the first known browser language, else Korean', () => {
    expect(pickLanguage('ja', 'en-US,en;q=0.9')).toBe('ja')
    expect(pickLanguage('fr', 'fr-FR,zh-CN;q=0.8,en;q=0.5')).toBe('zh')
    expect(pickLanguage(undefined, 'de-DE')).toBe('ko')
    expect(pickLanguage(undefined, null)).toBe('ko')
  })

  it('tells the model to answer in the chosen language, and says nothing for Korean', () => {
    expect(languageRule('ko')).toBeNull()
    expect(languageRule(null)).toBeNull()
    expect(languageRule('en')).toContain('영어(English)')
    expect(languageRule('zh')).toContain('简体中文')
  })
})
