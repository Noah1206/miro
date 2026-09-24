import { describe, expect, it } from 'vitest'
import { allowedBlockTypes } from '../call/types'
import { pickCallChannel } from '../call/pick'
import { deriveIntent } from '../reality/intent'
import type { ContactProfile } from '../character/types'

const profile = (over: Partial<ContactProfile> = {}): ContactProfile => ({
  id: 'p', characterId: 'c', contactFrequency: 50, replyDelayMinutes: 5, preferredChannel: 'message',
  callProbability: 0.7, videoCallProbability: 0.6, photoProbability: 0.2, voiceMessageProbability: 0.2,
  activeHours: { start: '00:00', end: '23:59' }, initiativeLevel: 50, ...over,
})

describe('call channel selection is deterministic, not random', () => {
  it('same state → same channel', () => {
    expect(pickCallChannel(profile(), 0.95, 'message')).toBe(pickCallChannel(profile(), 0.95, 'message'))
  })
  it('a call-shy character texts even when urgent', () => {
    expect(pickCallChannel(profile({ callProbability: 0.1, videoCallProbability: 0.1 }), 0.95, 'message')).toBe('message')
  })
  it('high urgency + call-prone → voice; very high + video-prone → video', () => {
    expect(pickCallChannel(profile({ videoCallProbability: 0.2 }), 0.85, 'message')).toBe('voice_call')
    expect(pickCallChannel(profile(), 0.95, 'message')).toBe('video_call')
  })
  it('low urgency stays on the preferred channel', () => {
    expect(pickCallChannel(profile(), 0.5, 'message')).toBe('message')
  })
  it('an escalated event with a call-prone character becomes a call intent', () => {
    const i = deriveIntent({
      relationship: { id: 'r', sessionId: 's', version: 1, trust: 50, attraction: 10, jealousy: 0,
        protectiveness: 10, emotionalDistance: 40, attachment: 50, stage: 'friend', unresolvedEventIds: [], updatedAt: new Date() },
      activeEvents: [{ id: 'e', sessionId: 's', type: 'crisis', status: 'escalated', context: {}, participantNpcIds: [],
        continuationState: {}, consequences: [], cooldownUntilTurn: 0, createdAtTurn: 1, resolvedAtTurn: null }],
      contactProfile: profile(), idleMinutes: 0, pending: null,
    })
    expect(i?.channel).toBe('video_call')
  })
})

describe('call mode blocks', () => {
  it('voice allows dialogue only; video also allows short actions; chat allows all', () => {
    expect([...allowedBlockTypes('voice_call')].sort()).toEqual(['dialogue', 'npc'])
    expect(allowedBlockTypes('video_call').has('action')).toBe(true)
    expect(allowedBlockTypes('video_call').has('narrative')).toBe(false)
    expect(allowedBlockTypes('chat').has('thought')).toBe(true)
    expect(allowedBlockTypes('video_call').has('thought')).toBe(false)
    expect(allowedBlockTypes('chat').has('narrative')).toBe(true)
  })
})
