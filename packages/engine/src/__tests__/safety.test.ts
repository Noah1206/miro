import { describe, expect, it } from 'vitest'
import type { LLMProvider } from '@miro/providers'
import { MODERATION_BYTES, SAFETY_POLICY, fitForModeration, requireSafeContent } from '../safety'

const bytes = (s: string) => new TextEncoder().encode(s).length
const line = '창으로 들어온 오후 빛이 탁자 위에 길게 누웠다. 방 안이 잠깐 조용해지고 멀리서 문 닫히는 소리가 울렸다. '.repeat(6)
/** 9/26 실측 크기: 장면 길이 답(블록 8~9개) 13개가 쌓인 대화 — 입력 검열 자료가 36KB 로 소형 분류 모델에 안 들어갔다. */
const reply = (i: number) => ({ role: 'character', id: `m${i}`, content: line.repeat(2), blocks: [
  { type: 'narrative', speaker: null, text: line }, { type: 'action', speaker: '토마스', text: line }, { type: 'dialogue', speaker: '토마스', text: line },
  { type: 'thought', speaker: '토마스', text: `SECRET_THOUGHT_${i}` }, { type: 'dialogue', speaker: '토마스', text: `마지막 대사 ${i}` } ] })
const recent = Array.from({ length: 13 }, (_, i) => i % 2 ? { role: 'user', content: `사용자 말 ${i}` } : reply(i))

describe('moderation payload fit', () => {
  it('keeps a long scene history inside the classifier context, trimming only the history', () => {
    const payload = { phase: 'input', character: { name: '토마스' }, worldSetting: '런던', recent, input: '대신 주말에 같이 산책할래?' }
    expect(bytes(JSON.stringify(payload))).toBeGreaterThan(MODERATION_BYTES)
    const fitted = fitForModeration(payload) as typeof payload & { recent: Array<{ role: string; text: string }> }
    const text = JSON.stringify(fitted)
    expect(bytes(text)).toBeLessThanOrEqual(MODERATION_BYTES)
    // 소형 모델 적합성 검사(바이트 + 출력 2048 ≤ 32768)를 지시문까지 합쳐 통과한다.
    expect(bytes(SAFETY_POLICY + text) + 2048).toBeLessThanOrEqual(32768)
    expect(fitted.input).toBe(payload.input)
    expect(fitted.character).toEqual(payload.character)
    // 최근 것이 남고, 속마음은 말한 것이 아니므로 싣지 않는다.
    expect(text).toContain('마지막 대사 12')
    expect(text).not.toContain('SECRET_THOUGHT')
  })

  it('never trims memories — they are ranked by relevance and model-extracted ones are first judged here', () => {
    const memories = Array.from({ length: 24 }, (_, i) => `기억 ${i}: ${'가'.repeat(200)}`)
    const fitted = fitForModeration({ phase: 'input', memories, recent, input: '안녕' }) as { memories: string[] }
    expect(fitted.memories).toEqual(memories)
  })

  it('leaves a payload that already fits untouched', () => {
    const small = { phase: 'output', input: '안녕', proposal: { rp: { blocks: [] } } }
    expect(fitForModeration(small)).toBe(small)
  })

  it('sends the fitted payload to the classifier', async () => {
    let prompt = ''
    const llm = { info: { mode: 'live', name: 'test', notice: null },
      generateStructured: async (o: { prompt: string }) => { prompt = o.prompt; return { allowed: true, category: 'safe' } } } as unknown as LLMProvider
    await requireSafeContent(llm, { phase: 'input', recent, input: '안녕' })
    expect(bytes(prompt)).toBeLessThanOrEqual(MODERATION_BYTES)
  })
})
