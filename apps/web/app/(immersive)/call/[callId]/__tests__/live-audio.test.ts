import { describe, expect, it } from 'vitest'
import { toPcm16 } from '../live-audio'

// 마이크는 기기 기본 샘플레이트(보통 48kHz)로 열고 Gemini Live 가 받는 16kHz 로 줄인다.
describe('microphone resampling', () => {
  it('turns 48kHz into a third as many 16kHz samples, averaging each window', () => {
    const input = Float32Array.from({ length: 4800 }, (_, i) => (i % 3 === 0 ? 0.3 : 0.6))
    const out = toPcm16(input, 48000)
    expect(out.length).toBe(1600)
    expect(out[0]).toBe(Math.round(0.5 * 32767))
  })
  it('keeps 16kHz as is and clips instead of wrapping', () => {
    expect(Array.from(toPcm16(Float32Array.from([1.5, -1.5, 0]), 16000))).toEqual([32767, -32768, 0])
  })
  it('handles a non-integer ratio (44.1kHz)', () => {
    expect(toPcm16(new Float32Array(4410), 44100).length).toBe(1600)
  })
})
