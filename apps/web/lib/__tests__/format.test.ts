import { describe, expect, it } from 'vitest'
import { subject, withParticle } from '../format'

describe('particles', () => {
  it('follows the final consonant', () => {
    expect(subject('토마스')).toBe('토마스가')
    expect(subject('강태준')).toBe('강태준이')
    expect(withParticle('강태준', '은', '는')).toBe('강태준은')
    expect(withParticle('히사시', '과', '와')).toBe('히사시와')
  })

  it('drops the particle after a non-Hangul name unless a fallback is given', () => {
    // "Thomas 입력 중" 은 읽히지만 "Thomas의 시간" 은 뜻이 바뀐다 — 와/과 는 대신 붙일 값을 준다.
    expect(subject('Thomas')).toBe('Thomas')
    expect(withParticle('Alice', '과', '와')).toBe('Alice')
    expect(withParticle('Alice', '과', '와', '와')).toBe('Alice와')
    expect(withParticle('강태준', '과', '와', '와')).toBe('강태준과')
  })
})
