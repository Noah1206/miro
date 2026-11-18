import { describe, expect, it } from 'vitest'
import { sfxClips } from '../voice-sfx'

const t = (text: string) => sfxClips([{ type: 'narrative', text }, { type: 'dialogue', text: '찌걱 넘쳐' }])

describe('sfxClips', () => {
  it('효과음 단계', () => {
    expect(t('창밖에 비가 왔다. 퍽 좋은 날, 짝꿍과 함께.')).toEqual([])
    expect(t('찌걱, 소리가 났다.')).toEqual([])   // 11/19 젖은 소리는 내지 않는다
    expect(t('안에서 넘쳐 흘러내리며 찌걱, 철퍽')).toEqual(['/sfx/slap.mp3'])
    expect(t('목 깊숙이 밀려들자 컥, 억억')).toEqual(['/sfx/gag.mp3'])
    expect(t('고개를 숙여 빨아들였다')).toEqual(['/sfx/suck.mp3'])
  })
})
