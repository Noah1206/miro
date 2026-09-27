import { describe, expect, it } from 'vitest'
import { AIOrchestrator, MockAIProvider } from '@miro/providers'
import { SemanticResult, analyzeMemory, analyzeSemantic } from '../task-router'
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

  it('accepts the bare event array the small model returns when it finds something', () => {
    // 9/26·27 실측 원문: {"events":[]}, 배열만, 배열 안에 {"events":[]} 가 든 모양.
    expect(SemanticResult.parse(JSON.parse('{\n  "events": []\n}'))).toEqual({ events: [] })
    expect(SemanticResult.parse(JSON.parse('[\n  {\n    "type": "shared_secret",\n    "confidence": 0.9\n  }\n]')))
      .toEqual({ events: [{ type: 'shared_secret', confidence: 0.9 }] })
    expect(SemanticResult.parse(JSON.parse('[\n  {\n    "events": []\n  }\n]'))).toEqual({ events: [] })
    // confidence 가 문자열로 오는 모양(실측 원문). 숫자 문자열만 숫자로 읽고, 그 밖의 문자열·불리언은 그 항목만 버린다.
    expect(SemanticResult.parse(JSON.parse('{"events":[{"type":"shared_secret","confidence":"0.95"},{"type":"compliment","confidence":"0.7"}]}')).events.map(e => e.confidence)).toEqual([0.95, 0.7])
    expect(SemanticResult.parse({ events: [{ type: 'compliment', confidence: 'high' }, { type: 'compliment', confidence: true }, { type: 'apologized', confidence: 0.9 }] }).events)
      .toEqual([{ type: 'apologized', confidence: 0.9 }])
    // 모르는 사건 종류나 0..1 밖의 값은 그 항목만 버리고 나머지는 남긴다 — 한 항목 때문에 턴의 사건이 통째로 사라지지 않는다.
    expect(SemanticResult.parse({ events: [{ type: 'gratitude', confidence: 0.9 }, { type: 'compliment', confidence: 90 }, { type: 'shared_secret', confidence: 0.8 }] }).events)
      .toEqual([{ type: 'shared_secret', confidence: 0.8 }])
  })

  it('asks the model for the typed object shape with a low temperature', async () => {
    let req: Record<string, unknown> = {}
    const llm = new AIOrchestrator({ chain: [new MockAIProvider(r => { req = r as unknown as Record<string, unknown>; return { events: [] } })] })
    await analyzeSemantic(llm, '안녕', snapshot())
    expect(req.temperature).toBe(0.2)
    expect(req.responseSchema).toMatchObject({ type: 'object', required: ['events'], properties: { events: { type: 'array', items: { type: 'object', properties: {
      type: { type: 'string', enum: expect.arrayContaining(['confession', 'shared_secret']) }, confidence: { type: 'number', minimum: 0, maximum: 1 } } } } } })
    // 뜻이 프롬프트에 실린다 — 고백과 비밀 털어놓기를 가르는 문장이 들어 있어야 한다.
    expect(String(req.prompt)).toContain('비밀이나 속사정을 털어놓는 것도 아니다')
    expect(String(req.promptVersion)).toBe('semantic-event:v1+typed')
    // OpenAI 호환 json_object 모드는 메시지 어딘가에 'JSON' 낱말이 없으면 400 을 낸다 — 시스템 문구가 그 낱말을 지닌다.
    expect(/json/i.test(String(req.system))).toBe(true)
  })
})

