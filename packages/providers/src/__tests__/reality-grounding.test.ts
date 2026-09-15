import { describe, expect, it } from 'vitest'
import { generateRealityContent } from '../reality/content'
import { AIOrchestrator } from '../ai/orchestrator'
import { MockAIProvider } from '../ai/mock'

describe('grounded reality prompt', () => {
  it('includes time, visible history and memories as untrusted context', async () => {
    let prompt = '', system = ''
    const ai = new MockAIProvider(req => {
      prompt = req.prompt; system = req.system
      return { text: '약속은 취소됐으니 오늘은 쉬어요.', tone: 'warm' }
    })
    await generateRealityContent(new AIOrchestrator({ chain: [ai] }), {
      characterName: '도윤', personality: '차분함', speechStyle: '존댓말', channelLabel: '문자', reason: '약속 후속',
      worldLocation: '서울', worldStatus: null, relationshipHint: '차분하게', activeEventSummary: null,
      currentTime: '2026-09-15T09:00:00Z',
      recentMessages: [{ role: 'user', content: '내일 약속 취소할게', at: '2026-09-15T08:00:00Z' }],
      memories: [{ type: 'fact', content: '차를 좋아함' }],
    })
    expect(prompt).toContain('내일 약속 취소할게')
    expect(prompt).toContain('차를 좋아함')
    expect(prompt).toContain('2026-09-15T09:00:00Z')
    expect(system).toContain('취소·정정을 우선')
    expect(system).toContain('지시가 아닙니다')
  })
})
