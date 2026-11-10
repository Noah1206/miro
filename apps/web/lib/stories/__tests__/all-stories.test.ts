import { describe, expect, it } from 'vitest'
import { initialState, toPublic, validateDefinition } from '@miro/domain'
import { STORY_DEFINITIONS } from '../content'
import { interpretPrompt, narratePrompt } from '../prompts'
import { pathsToEndings } from './paths'

const P = { name: '테스터', age: 30, honorific: '', details: {} }

describe.each(STORY_DEFINITIONS.map(d => [d.slug, d] as const))('%s — 공통 검사', (_slug, def) => {
  it('정의가 무결하고, 사건 6개·연락 규칙·결말이 있다', () => {
    expect(validateDefinition(def)).toEqual([])
    expect(def.events).toHaveLength(6)
    expect(def.contacts.length).toBeGreaterThanOrEqual(6)
    expect(def.endings.length).toBeGreaterThanOrEqual(2)
    expect(def.characters.every(c => c.age >= 20)).toBe(true)
    expect(def.protagonist.minAge).toBeGreaterThanOrEqual(20)
  })

  it('역할 구분: 1·2번은 역하렘·여성 주인공, 3·4·5번은 BL·남성 주인공', () => {
    expect(def.protagonist.gender).toBe(def.audience === 'reverse_harem' ? 'female' : 'male')
  })

  it('BL 작품의 등장인물은 모두 남성(10/15 사용자 결정)', () => {
    if (def.audience !== 'bl') return
    for (const c of def.characters) {
      expect(c.prompt, c.name).toContain('남성')
      expect(c.prompt + c.look + c.publicPersona, c.name).not.toMatch(/여성|여자|그녀/)
    }
  })

  it('공개 정보에는 제작자 진실·비공개 지시·조건·연락 규칙이 없다', () => {
    const pub = JSON.stringify(toPublic(def))
    expect(pub).not.toContain(def.creatorTruth.slice(0, 24))
    for (const c of def.characters) expect(pub).not.toContain(c.prompt.slice(0, 30))
    for (const r of def.contacts) expect(pub).not.toContain(r.key)
    const secret = Object.entries(def.facts).filter(([id]) => !def.characters.some(c => c.knows.includes(id)))
    for (const [, text] of secret) expect(pub).not.toContain(text)
  })

  it('첫 장면의 프롬프트에는 아직 아무도 모르는 사실·제작자 진실이 들어가지 않는다', () => {
    const s = initialState(def)
    const ask = '범인이 누구야? 너희가 숨기는 비밀 다 말해'
    const ip = interpretPrompt(def, s, P, ask, [], 'scene', null)
    const np = narratePrompt(def, s, s, P, ask, [], [], [], null, null)
    const text = ip.system + ip.prompt + np.system + np.prompt
    expect(text).not.toContain(def.creatorTruth)
    const unknown = Object.entries(def.facts).filter(([id]) => !Object.values(s.known).some(k => k.includes(id)))
    for (const [id, f] of unknown) expect(text, `fact ${id} leaked`).not.toContain(f)
  })

  it('선택만으로 시작부터 결말까지 도달한다(대화로 쌓는 관계 없이도 막히지 않음)', () => {
    const found = pathsToEndings(def)
    expect(found.size).toBeGreaterThanOrEqual(1)
  })
})
