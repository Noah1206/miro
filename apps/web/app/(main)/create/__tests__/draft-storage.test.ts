import { describe, expect, it } from 'vitest'
import { activeDraftKey, draftStorageKey, restoreDraft } from '../draft-storage'

describe('character creation drafts', () => {
  it('uses different keys per account, type and draft', () => {
    expect(new Set([
      draftStorageKey('owner-a', 'chat', 'one'),
      draftStorageKey('owner-a', 'reality', 'one'),
      draftStorageKey('owner-a', 'chat', 'two'),
      draftStorageKey('owner-b', 'chat', 'one'),
    ]).size).toBe(4)
    expect(activeDraftKey('owner-a', 'chat')).not.toBe(activeDraftKey('owner-a', 'reality'))
  })

  it('restores authored chat fields without borrowing Reality settings', () => {
    const restored = restoreDraft([
      ['name', '서린'], ['title', '서점에서 만난 사람'],
      ['personality', '조용하고 짧은 존댓말'], ['startingContext', '비 오는 날의 서점'],
      ['worldSetting', '오래된 서점'], ['isPublic', 'on'],
      ['introDialogue', '[{"role":"character","text":"어서 오세요."}]'],
    ], 'chat')
    expect(restored).toMatchObject({ name: '서린', title: '서점에서 만난 사람',
      personality: '조용하고 짧은 존댓말', startingContext: '비 오는 날의 서점', worldSetting: '오래된 서점',
      contactEnabled: false, isPublic: true })
    expect(restored.sampleDialogue).toEqual([{ role: 'character', text: '어서 오세요.', purpose: 'intro' }])
  })

  it('keeps an empty personality empty in a partially written Miro draft', () => {
    expect(restoreDraft([['name', '미로 임시 주인공']], 'reality').personality).toBe('')
  })

  it.each(['chat', 'reality'] as const)('restores the selected official voice in a %s draft', (type) => {
    expect(restoreDraft([['name', '목소리 초안'], ['voiceId', 'official-warm']], type).voiceId).toBe('official-warm')
  })
})
