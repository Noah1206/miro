import { describe, expect, it } from 'vitest'
import { isMessengerMessage, sceneMessages } from './messenger'

const m = (kind: string, turnIndex: number, blocks: unknown[] = [], role = 'character') => ({ kind, turnIndex, blocks, role })

describe('scene vs messenger split', () => {
  it('keeps only in-person scene lines on /chat', () => {
    const rows = [
      m('text', 1, [], 'user'), m('text', 1, [{ type: 'dialogue', text: '…네.' }]),     // 장면
      m('messenger', 2, [], 'user'), m('reality_message', 2, [{ type: 'reality' }]),      // 문자
      m('text', 3, [], 'user'), m('text', 3, [{ type: 'dialogue', text: '그렇군요.' }, { type: 'call_line', text: 'call-1' }]),  // 통화
      m('call_record', 3, [{ type: 'call' }], 'system'),
      m('photo', 4, [{ type: 'reality' }]), m('photo', 5, []),                              // 문자 사진 / 장면 사진
      m('live_scene', 6, [], 'narrator'),
    ]
    expect(sceneMessages(rows).map((r) => `${r.kind}@${r.turnIndex}`)).toEqual(['text@1', 'text@1', 'photo@5', 'live_scene@6'])
  })
  it('sends texts, call records and texted photos to /messages', () => {
    expect([m('reality_message', 1), m('messenger', 1), m('call_record', 1), m('photo', 1, [{ type: 'reality' }])].every(isMessengerMessage)).toBe(true)
    expect([m('text', 1), m('photo', 1), m('live_scene', 1)].some(isMessengerMessage)).toBe(false)
  })
})
