import { describe, expect, it } from 'vitest'
import { generateRealityContent } from '../reality/content'
import { AIOrchestrator } from '../ai/orchestrator'
import { MockAIProvider } from '../ai/mock'

describe('grounded reality prompt', () => {
  it('uses canonical authored settings and labels narrator, NPC, and its own prior contact correctly', async () => {
    let prompt = '', system = ''
    const ai = new MockAIProvider(req => {
      prompt = req.prompt; system = req.system
      return { text: '선배, 도착하면 알려 주세요.', tone: 'neutral' }
    })
    await generateRealityContent(new AIOrchestrator({ chain: [ai] }), {
      characterName: '도윤', personality: '차분함', speechStyle: '존댓말', channelLabel: '문자', reason: '안부',
      worldLocation: '폐역', worldStatus: null, relationshipHint: '차분하게', activeEventSummary: null,
      authoredCharacter: {
        identity: { name: '도윤', nationality: '한국', mbti: 'INTJ' },
        personality: { personality: '차분함', values: '약속', userNickname: '선배', hobbies: ['독서'], jealousy: 30 },
        worldRole: { socialPosition: '폐역 관리자', startingContext: '막차를 놓친 저녁' },
        appearance: { hair: { color: '은색' }, baseFace: { distinctive: '눈썹 흉터' } },
      },
      worldSetting: '기억을 잃은 승객들이 찾는 역', worldGenre: '미스터리',
      recentMessages: [
        { id: 'n1', role: 'narrator', kind: 'text', content: '몰래 편지를 숨겼다.', at: '2026-09-24T01:00:00Z' },
        { id: 'n2', role: 'npc', npcName: '서연', content: '열쇠를 맡겼어요.' },
        { id: 'c1', role: 'character', kind: 'reality_message', content: '도착하면 알려 주세요.' },
      ],
    })
    for (const fact of ['INTJ', '선배', '폐역 관리자', '눈썹 흉터', '기억을 잃은 승객들이 찾는 역', '미스터리']) expect(prompt).toContain(fact)
    expect(prompt).toContain('"speakerLabel":"내레이터 (전지적 서술 · 캐릭터 지식 아님)"')
    expect(prompt).toContain('"knowledgeScope":"omniscient"')
    expect(prompt).toContain('"speakerLabel":"NPC (서연)"')
    expect(prompt).toContain('"kind":"reality_message"')
    expect(prompt).toContain('"id":"c1"')
    expect(system).toContain('국적·MBTI·외형으로 성격, 신념, 능력, 취향을 추정하지 않습니다')
    expect(system).toContain('직접 관찰하거나 전달받은 근거가 없는 비밀')
    expect(system).toContain('상황 예시는 실제 과거 사건이 아닙니다')
  })

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
