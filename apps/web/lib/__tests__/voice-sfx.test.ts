import { describe, expect, it } from 'vitest'
import { sfxClips } from '../voice-sfx'

const t = (text: string) => sfxClips([{ type: 'narrative', text }, { type: 'dialogue', text: '찌걱 넘쳐' }])

describe('sfxClips', () => {
  it('효과음 단계', () => {
    expect(t('창밖에 비가 왔다. 퍽 좋은 날, 짝꿍과 함께.')).toEqual([])
    expect(t('찌걱, 소리가 났다.')).toEqual(['/sfx/wet-1.mp3'])
    expect(t('흥건하게 젖은 채 쮸걱')).toEqual(['/sfx/wet-2.mp3'])
    expect(t('안에서 넘쳐 흘러내리며 찌걱, 철퍽')).toEqual(['/sfx/wet-2.mp3', '/sfx/slap.mp3'])
  })
})
