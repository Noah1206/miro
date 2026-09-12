import { describe, expect, it } from 'vitest'
import { isAnalyticsEvent, sanitizeProps } from '../analytics/events'
describe('analytics privacy', () => {
  it('strips relationship dimensions and conversation content', () => {
    expect(sanitizeProps({ sessionId: 's', trust: 80, attachment: 20, stage: 'lover', content: '비밀', input: 'x', kind: 'photo' }))
      .toEqual({ sessionId: 's', kind: 'photo' })
  })
  it('drops long strings that look like prose and non-primitive values', () => {
    expect(sanitizeProps({ note: 'a'.repeat(200), nested: { trust: 1 }, arr: [1], n: 3 })).toEqual({ n: 3 })
  })
  it('only known event names are accepted', () => {
    expect(isAnalyticsEvent('rp_message_sent')).toBe(true); expect(isAnalyticsEvent('relationship_score')).toBe(false)
  })
})
