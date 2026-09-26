import { describe, expect, it } from 'vitest'
import { segmentReply } from './reply-segments'

const b = (type: string, text: string, speaker: string | null = null) => ({ type, speaker, text })

describe('segmentReply', () => {
  it('puts scene narration outside and alternates bubbles like a scene', () => {
    const segments = segmentReply([
      b('narrative', '빛이 누웠다.'), b('action', '턱을 괸다.', '토마스'), b('dialogue', '왔어요?', '토마스'),
      b('world', '문이 닫혔다.'), b('thought', '반갑네.', '토마스'), b('dialogue', '앉아요.', '토마스'),
    ], '', '토마스')
    expect(segments.map((s) => s.kind === 'bubble' ? `bubble:${s.speaker}:${s.paragraphs.map((p) => p.kind).join('+')}` : 'narration'))
      .toEqual(['narration', 'bubble:토마스:action+dialogue', 'narration', 'bubble:토마스:thought+dialogue'])
    // 타이핑 순서는 응답 전체의 문단 순서다.
    expect(segments.flatMap((s) => s.paragraphs.map((p) => p.index))).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('gives an npc its own bubble and keeps a speakerless action with the character', () => {
    const segments = segmentReply([b('action', '고개를 든다.'), b('npc', '손님 왔어요.', '이수현'), b('dialogue', '들여보내요.', '토마스')], '', '토마스')
    expect(segments.map((s) => s.kind === 'bubble' ? s.speaker : 'narration')).toEqual(['토마스', '이수현', '토마스'])
  })

  it('keeps an old reply in one bubble after the character is renamed', () => {
    // 옛 답은 옛 이름(한도윤)을 화자로 갖고 있다. 속마음의 화자가 답을 쓸 때의 캐릭터다.
    const segments = segmentReply([b('action', '웃는다.', '한도윤'), b('thought', '반갑다.', '한도윤'), b('dialogue', '왔네.', '한도윤')], '', '한도현')
    expect(segments.map((s) => s.kind === 'bubble' ? s.speaker : 'narration')).toEqual(['한도현'])
  })

  it('falls back to paragraphs of the stored text for old rows without blocks', () => {
    const segments = segmentReply([], '*창밖을 본다.*\n\n토마스: 늦었네요.', '토마스')
    expect(segments).toHaveLength(1)
    expect(segments[0]!.paragraphs.map((p) => [p.kind, p.text])).toEqual([['action', '*창밖을 본다.*'], ['dialogue', '늦었네요.']])
  })
})
