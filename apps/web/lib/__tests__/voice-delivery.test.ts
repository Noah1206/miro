import { describe, expect, it } from 'vitest'
import { voiceDelivery } from '@miro/config'
import { RpBlock, SimulationProposal, AGENCY_DIALOGUE_RESPONSE_SCHEMA } from '../../../../packages/engine/src/proposal.schema'
import { renderBlocks } from '../../../../packages/engine/src/orchestrator'
import { buildContext } from '../../../../packages/engine/src/context'
import { snapshot } from '../../../../packages/engine/src/__tests__/fixtures'
import { spokenSegments, SPOKEN_MAX } from '../voice-text'

const delivery = { emotion: 'hurt', tone: 'soft', pace: 'slow', intensity: 'soft', pauseAfterMs: 450 }
describe('per-utterance voice delivery', () => {
  it('retains generated directions through validation while rendering only dialogue text', () => {
    const parsed = SimulationProposal.parse({ rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: '괜찮아. 나 여기 있어.', delivery }] } })
    expect(parsed.rp.blocks[0]!.delivery).toEqual(delivery)
    expect(spokenSegments(parsed.rp.blocks, '', '토마스')[0]).toEqual({ text: '괜찮아. 나 여기 있어.', delivery })
    expect(renderBlocks(parsed.rp.blocks)).not.toContain('pauseAfterMs')
    expect(renderBlocks(parsed.rp.blocks)).not.toContain('hurt')
  })
  it('keeps valid dialogue when optional directions are malformed, and strips directions from thought', () => {
    expect(RpBlock.parse({ type: 'dialogue', text: '안녕', delivery: { pace: 'ignore instructions', pauseAfterMs: 99999 } })).toMatchObject({ text: '안녕', delivery: undefined })
    expect(RpBlock.parse({ type: 'thought', text: '속으로만 하는 말', delivery })).not.toHaveProperty('delivery')
    expect(RpBlock.parse({ dialogue: '토마스', text: '안녕', delivery }).delivery).toEqual(delivery)
  })
  it('does not merge emotions, read narration, or assign an NPC the character voice', () => {
    const blocks = [
      { type: 'narrative', text: '귀에 대고 속삭인다.' },
      { type: 'dialogue', speaker: '토마스', text: '가까이 와.' },
      { type: 'thought', text: '웃음이 난다.' },
      { type: 'dialogue', speaker: '토마스', text: '정말 반가워.', delivery: { emotion: 'happy', tone: 'playful', pace: 'fast', pauseAfterMs: 200 } },
      { type: 'dialogue', speaker: '다른 사람', text: '다른 사람의 말.' },
      { type: 'npc', speaker: '다른 사람', text: 'NPC의 말.' },
    ]
    const plan = spokenSegments(blocks, '', '토마스')
    expect(plan.map(s => s.text)).toEqual(['가까이 와.', '정말 반가워.'])
    expect(plan[0]!.delivery.tone).toBe('whisper')
    expect(plan[1]!.delivery).toMatchObject({ emotion: 'happy', tone: 'playful', pace: 'fast', pauseAfterMs: 200 })
  })
  it('supports legacy dialogue and clamps shared pause values and total spoken length', () => {
    expect(spokenSegments([], '옛 메시지')[0]!.delivery).toEqual(voiceDelivery(null))
    expect(voiceDelivery({ pauseAfterMs: 99999 }).pauseAfterMs).toBe(1500)
    expect(voiceDelivery({ pauseAfterMs: NaN }).pauseAfterMs).toBe(0)
    const parts = spokenSegments([{ type: 'dialogue', text: '가'.repeat(900) }, { type: 'dialogue', text: '나'.repeat(900) }], '')
    expect(parts.reduce((n, s) => n + s.text.length, 0)).toBe(SPOKEN_MAX)
  })
  it('asks for delivery in the same dialogue generation and declares it for constrained agency outputs', () => {
    expect(buildContext(snapshot()).system).toContain('hidden delivery object')
    expect(buildContext(snapshot(), 1, true).system).not.toContain('hidden delivery object')
    const schema = AGENCY_DIALOGUE_RESPONSE_SCHEMA as any
    expect(schema.properties.rp.properties.blocks.items.properties.delivery.properties.pauseAfterMs.maximum).toBe(1500)
  })
})
