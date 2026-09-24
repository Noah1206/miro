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
      ] },
      { role: 'npc', npcName: '서연', content: 'PUBLIC_CLAIM', id: 'npc-1' },
    ] })
    if (task === 'semantic_event') await analyzeSemantic(llm, '안녕', s)
    else await analyzeMemory(llm, task, '안녕', s)
    expect(prompt).not.toContain('NARRATOR_SECRET')
    expect(prompt).not.toContain('MIXED_SECRET')
    expect(prompt).toContain('말해 볼까요.')
    expect(prompt).toContain('PUBLIC_CLAIM')
    expect(prompt).toContain('"role":"npc"')
    expect(prompt).toContain('mixed-1')
    if (task !== 'semantic_event') expect(system).toContain('NPC의 주장으로 남기고')
  })
})
