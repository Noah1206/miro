import { describe, expect, it } from 'vitest'
import { AIOrchestrator, MockAIProvider } from '@miro/providers'
import { analyzeMemory, analyzeSemantic } from '../task-router'
import { snapshot } from './fixtures'

describe('participant evidence boundary', () => {
  it.each(['memory_extraction', 'memory_summary', 'semantic_event'] as const)('excludes narrator-only knowledge before %s inference', async task => {
    let prompt = '', system = ''
    const llm = new AIOrchestrator({ chain: [new MockAIProvider(req => {
      prompt = req.prompt; system = req.system
      return task === 'semantic_event' ? { events: [] }
        : task === 'memory_summary' ? { memories: [{ type: 'short_term_summary', content: '공개된 인사를 주고받음', importance: 0.5, persistence: 0.5, confidence: 1, tags: ['인사'] }] }
        : { memories: [] }
    })] })
    const s = snapshot({ recentMessages: [
      { role: 'narrator', content: 'NARRATOR_SECRET', knowledgeScope: 'omniscient' },
      { role: 'character', content: '말해 볼까요. MIXED_SECRET', id: 'mixed-1', blocks: [
        { type: 'dialogue', speaker: '토마스', text: '말해 볼까요.' },
        { type: 'narrative', text: 'MIXED_SECRET' },
        { type: 'thought', speaker: '토마스', text: 'UNSPOKEN_THOUGHT' },
      ] },
      { role: 'npc', npcName: '서연', content: 'PUBLIC_CLAIM', id: 'npc-1' },
    ] })
    if (task === 'semantic_event') await analyzeSemantic(llm, '안녕', s)
    else await analyzeMemory(llm, task, '안녕', s)
    expect(prompt).not.toContain('NARRATOR_SECRET')
    expect(prompt).not.toContain('MIXED_SECRET')
    expect(prompt).not.toContain('UNSPOKEN_THOUGHT')
    expect(prompt).toContain('말해 볼까요.')
    expect(prompt).toContain('PUBLIC_CLAIM')
    expect(prompt).toContain('"role":"npc"')
    expect(prompt).toContain('mixed-1')
    if (task !== 'semantic_event') expect(system).toContain('NPC의 주장으로 남기고')
  })

  it('keeps 24 long scene replies inside the memory model context', async () => {
    // 9/26: 장면 답(500~1300자)이 쌓이면 블록이 content 와 겹쳐 실려 flash-lite(32768) 적합성 검사를 넘겼다.
    let bytes = 0
    const llm = new AIOrchestrator({ chain: [new MockAIProvider(req => { bytes = Buffer.byteLength(req.system + req.prompt, 'utf8'); return { memories: [] } })] })
    const line = '창밖을 오래 바라보다가 천천히 고개를 돌렸다. '.repeat(12)
    const reply = { role: 'character' as const, content: line, blocks: [
      { type: 'narrative', speaker: null, text: line }, { type: 'action', speaker: '토마스', text: line }, { type: 'dialogue', speaker: '토마스', text: line },
      { type: 'thought', speaker: '토마스', text: line }, { type: 'dialogue', speaker: '토마스', text: line } ] }
    const s = snapshot({ recentMessages: Array.from({ length: 12 }).flatMap(() => [{ role: 'user' as const, content: '오늘 어땠어? 나는 토요일에 이사해.' }, reply]) })
    await analyzeMemory(llm, 'memory_extraction', '안녕', s)
    expect(bytes + 2048).toBeLessThanOrEqual(32768)
  })
})

