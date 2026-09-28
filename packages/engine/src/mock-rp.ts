import { MOODS, type Mood } from '@miro/domain'
import { fallbackLine } from './fallback'
import type { SimulationProposal } from './proposal.schema'

/**
 * Provider 미구성 시 RP 파이프라인을 돌리기 위한 결정적 Mock.
 *
 * 실제 생성이 아니다. 다만 현재 상태에 따라 다른 결과를 내도록 만들어
 * State-driven 동작(같은 입력이어도 상태가 다르면 결과가 다름)을 검증할 수 있게 한다.
 */
export function buildMockProposal(
  prompt: string,
  opts: { characterName: string; system?: string },
): SimulationProposal {
  const distance = num(prompt, /정서적 거리 (\d+)/) ?? 50
  const trust = num(prompt, /신뢰 (\d+)/) ?? 30
  const name = opts.characterName
  const activeEventIds = [...prompt.matchAll(/\[([a-z_]+)\]\s*\{.*?"__id":"([0-9a-f-]+)"/g)]

  // 기분(코드가 정한 상태)과 말투(system 의 정체성)에 맞는 한 줄 — 상태가 출력을 바꾼다.
  const moodMatch = prompt.match(/## 지금 기분[^\n]*\n(\w+):/)?.[1]
  const mood: Mood = (MOODS as readonly string[]).includes(moodMatch ?? '') ? (moodMatch as Mood) : 'neutral'
  const speechStyle = opts.system?.match(/말투: ([^\n]+)/)?.[1] ?? null
  const seed = num(prompt, /턴 (\d+)/) ?? prompt.length
  const cold = distance > 60
  const onCall = /전화 통화 중|영상통화 중/.test(prompt)
  const messenger = /메신저 대화처럼/.test(opts.system ?? '')
  const blocks: SimulationProposal['rp']['blocks'] = onCall
    ? [{ type: 'dialogue', speaker: name, text: cold ? '…듣고 있어요. 말해요.' : '목소리 들으니까 좀 낫네요.' }]
    : messenger
      ? [
          { type: 'thought', speaker: name, text: cold ? '괜히 신경 쓰이게 하네.' : '조금은 반가운 것 같기도 하고.' },
          { type: 'dialogue', speaker: name, text: fallbackLine(mood, speechStyle, seed) },
        ]
      // 캐릭터챗은 장면 하나 — 서술과 캐릭터의 차례가 두 번 오간다(실제 프롬프트가 요구하는 모양).
      : [
          { type: 'narrative', speaker: null, text: cold ? '방 안의 공기가 한 톤 식었다. 창밖 소음만 낮게 이어지고, 탁자 위의 찻잔은 손도 대지 않은 채 식어 간다.' : '창으로 들어온 오후 빛이 탁자 위에 길게 누웠다. 방 안이 잠깐 조용해지고, 멀리서 문 닫히는 소리가 한 번 울렸다.' },
          { type: 'action', speaker: name, text: cold ? '시선을 창밖으로 돌린다.' : '잠깐 말을 멈추고 턱을 괸다.' },
          { type: 'dialogue', speaker: name, text: fallbackLine(mood, speechStyle, seed) },
          { type: 'narrative', speaker: null, text: cold ? '대답을 기다리는 침묵이 길어진다. 의자 다리가 바닥을 짧게 긁었다.' : '말끝에 웃음이 살짝 묻어났다. 찻잔에서 김이 가늘게 올라온다.' },
          { type: 'thought', speaker: name, text: cold ? '괜히 신경 쓰이게 하네.' : '조금은 반가운 것 같기도 하고.' },
          { type: 'dialogue', speaker: name, text: cold ? '할 말 있으면 해요.' : '그래서, 오늘은 무슨 일로 왔어요?' },
        ]

  return {
    rp: { blocks },
    emotion: mood,
    worldDelta: null,
    // 신뢰가 낮을수록 변화 폭이 작다.
    relationshipDelta: { trust: trust < 40 ? 1 : 2, emotionalDistance: -1, reason: 'mock turn' },
    sceneDelta: null,
    memoryCandidates: [],
    // 이미 사건이 진행 중이면 새 사건을 제안하지 않는다.
    eventCandidates: [],
    eventUpdates: activeEventIds.map(([, , id]) => ({
      eventId: id!,
      status: 'active' as const,
    })),
    npcIntroductions: [],
    npcActions: [],
    realityIntent: null,
  }
}

function num(text: string, re: RegExp): number | null {
  const m = text.match(re)
  return m?.[1] ? Number(m[1]) : null
}
