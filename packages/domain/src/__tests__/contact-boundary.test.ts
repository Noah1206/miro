import { describe, expect, it } from 'vitest'
import { contactBoundaryActive, requestedContactBoundary } from '../index'

const now = new Date('2026-10-11T20:00:00+09:00')
const request = (text: string, at = now, zone = 'Asia/Seoul') => requestedContactBoundary(text, at, zone, 'request-1')
describe('user contact boundaries', () => {
  it('pauses a request for today through local midnight, without blocking future user-initiated replies', () => {
    const boundary = request('오늘은 혼자 있고 싶어. 연락하지 마.')!
    expect(boundary.mode).toBe('paused')
    expect(boundary.until).toBe('2026-10-11T15:00:00.000Z')
    expect(contactBoundaryActive(boundary, now)).toBe(true)
    expect(contactBoundaryActive(boundary, new Date(boundary.until!))).toBe(false)
  })
  it('keeps a clear stop in force until explicit permission, not ordinary conversation', () => {
    const boundary = request('앞으로 먼저 연락하지 마')!
    expect(boundary).toMatchObject({ mode: 'blocked', until: null })
    expect(contactBoundaryActive(boundary, new Date('2027-01-01'))).toBe(true)
    expect(request('너는 지금 뭐해?')).toBeNull()
    expect(request('이제 먼저 연락해도 괜찮아')).toMatchObject({ mode: 'open' })
    expect(request('내일 연락해 줘')).toBeNull()
  })
  it('understands a bounded break and indefinite space', () => {
    expect(request('2시간 동안 연락하지 마')?.until).toBe(new Date(now.getTime() + 2 * 3_600_000).toISOString())
    expect(request('당분간 혼자 있고 싶어')).toMatchObject({ mode: 'blocked', until: null })
  })
  it.each(['오늘은 혼자 있고 싶어', 'I need some space today', '今日は一人でいたい', '今天想一个人'])('recognizes direct space requests: %s', text => {
    expect(request(text)?.mode).toBe('paused')
  })
  it.each(['친구가 "연락하지 마"라고 말했어', '만약 내가 연락하지 마라고 하면 어떻게 할 거야?', '오늘 혼자 밥 먹었어',
    '혼자 있는 장면을 써 줘', 'If I say leave me alone, what would you do?', 'She said "do not text me".', '昨日友達が連絡しないでと言った', '如果我说不要联系我'])('does not mistake narration or reported speech for a request: %s', text => {
    expect(request(text)).toBeNull()
  })
  it('finds the right midnight on a daylight-saving transition', () => {
    expect(request('I need space today', new Date('2026-11-01T00:30:00-04:00'), 'America/New_York')?.until).toBe('2026-11-02T05:00:00.000Z')
  })
  it.each(['혼자 있고 싶진 않아', '연락하지 말라는 뜻은 아니야', '너는 혼자 있고 싶어?', 'I do not need space today'])('does not store a denied boundary or another person’s preference: %s', text => {
    expect(request(text)).toBeNull()
  })
  it('fails closed for corrupted pause dates', () => {
    expect(contactBoundaryActive({ version: 1, mode: 'paused', until: 'invalid', requestedAt: now.toISOString(), sourceRequestId: 'r' }, now)).toBe(true)
  })
})
