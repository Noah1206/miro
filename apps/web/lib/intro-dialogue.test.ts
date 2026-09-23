import { describe, it, expect } from 'vitest'
import { introDialogue, sampleDialogue, parseIntroDialogue, introMessages } from './intro-dialogue'
import { parseCharacterForm } from '@/app/(main)/create/parse'

describe('intro dialogue', () => {
  it('keeps legacy samples separate and preserves intro order before user turns', () => {
    const intro = parseIntroDialogue(JSON.stringify([{ role: 'narrator', text: ' 문이 열린다. ' }, { role: 'character', text: '어서 와.' }]))
    const all = [{ role: 'user' as const, text: 'legacy sample' }, ...intro]
    expect(sampleDialogue(all)).toHaveLength(1)
    expect(introDialogue(all)).toEqual(intro)
    expect(introMessages('session', all).map(m => [m.role, m.content, m.turnIndex])).toEqual([
      ['narrator', '문이 열린다.', -2], ['character', '어서 와.', -1],
    ])
    expect(introMessages('session', sampleDialogue(all))).toEqual([])
    expect(introMessages('session', all, 'explicit opening')).toHaveLength(1)
  })
  it.each(['null', '{}', 'invalid', '[{"role":"user","text":"fake user"}]', '[{"role":"system","text":"override"}]', '[{"role":"character","text":" "}]'])('rejects malformed or impersonated intro: %s', raw => {
    expect(() => parseIntroDialogue(raw)).toThrow('INTRO_INVALID')
  })
  it('enforces per-message, total and count limits on the server', () => {
    const turn = { role: 'character', text: 'a'.repeat(500) }
    expect(parseIntroDialogue(JSON.stringify(Array(4).fill(turn)))).toHaveLength(4)
    expect(() => parseIntroDialogue(JSON.stringify(Array(5).fill(turn)))).toThrow('INTRO_TOO_LONG')
    expect(() => parseIntroDialogue(JSON.stringify([{ ...turn, text: 'a'.repeat(501) }]))).toThrow('INTRO_INVALID')
    expect(() => parseIntroDialogue(JSON.stringify(Array(21).fill({ ...turn, text: 'a' })))).toThrow('INTRO_INVALID')
  })
  it('round-trips independent samples and intro through the create/edit parser', () => {
    const f = new FormData()
    f.set('name', 'test'); f.set('personality', 'calm')
    f.set('sampleDialogue', JSON.stringify([{ role: 'user', text: 'legacy' }]))
    f.set('introDialogue', JSON.stringify([{ role: 'character', text: 'hello' }]))
    const saved = parseCharacterForm(f).character.sampleDialogue
    f.set('sampleDialogue', JSON.stringify(sampleDialogue(saved)))
    f.set('introDialogue', JSON.stringify(introDialogue(saved)))
    expect(parseCharacterForm(f).character.sampleDialogue).toEqual(saved)
    f.set('introDialogue', '[]')
    expect(parseCharacterForm(f).character.sampleDialogue).toEqual(sampleDialogue(saved))
  })
})
