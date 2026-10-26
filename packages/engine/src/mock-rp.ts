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
  // Deterministic fixtures still obey the production anti-repetition contract.
  const fresh = (lines: string[]) => lines.find(line => !prompt.includes(line)) ?? lines[0]!
  const cold = distance > 60
  const onCall = /전화 통화 중|영상통화 중/.test(prompt)
  const messenger = /메신저 대화처럼/.test(opts.system ?? '')
  const blocks: SimulationProposal['rp']['blocks'] = onCall
    ? [{ type: 'dialogue', speaker: name, text: cold ? '…듣고 있어요. 말해요.' : '목소리 들으니까 좀 낫네요.' }]
    : messenger
      ? [
          { type: 'thought', speaker: name, text: cold ? '괜히 신경 쓰이게 하네.' : '조금은 반가운 것 같기도 하고.' },
          { type: 'dialogue', speaker: name, text: fresh([fallbackLine(mood, speechStyle, seed), '방금 말한 부분부터 이어서 들어 볼게요.', '그건 바로 답할 수 있을 것 같아요.', '그렇게 생각한 이유가 궁금하네요.']) },
        ]
      // 캐릭터챗은 장면 하나 — 서술과 캐릭터의 차례가 두 번 오간다(실제 프롬프트가 요구하는 모양).
      : [
          { type: 'narrative', speaker: null, text: cold ? fresh(["방 안의 공기가 한 톤 식었다. 창밖 소음만 낮게 이어지고, 탁자 위의 찻잔은 손도 대지 않은 채 식어 간다.", "창가의 그림자가 바닥 쪽으로 길어졌다. 복도에서 들리던 발소리가 멎고 서늘한 바람이 커튼 자락을 흔든다.", "닫힌 문 너머로 시계 초침이 짧게 울린다. 방 안의 사람은 가만히 그 소리가 잦아들기를 기다린다.", "책장 사이로 찬 공기가 스며들었다. 물건들이 제자리에 놓인 방에서 한동안 대답이 이어지지 않는다."]) : fresh(["창으로 들어온 오후 빛이 탁자 위에 길게 누웠다. 방 안이 잠깐 조용해지고, 멀리서 문 닫히는 소리가 한 번 울렸다.", "책장 끝의 조명이 종이 위를 비췄다. 창문 사이로 들어온 바람에 커튼의 가장자리가 조금 움직인다.", "복도 쪽 소리가 잦아들었다. 따뜻한 찻잔 옆에서 작은 시계가 같은 박자로 시간을 새긴다.", "책갈피가 꽂힌 책은 그대로 펼쳐져 있다. 방 안으로 들어온 빛이 선반의 먼지를 가늘게 드러낸다."]) },
          { type: 'action', speaker: name, text: cold ? '시선을 창밖으로 돌린다.' : '잠깐 말을 멈추고 턱을 괸다.' },
          { type: 'dialogue', speaker: name, text: fresh([fallbackLine(mood, speechStyle, seed), '방금 말한 부분부터 이어서 들어 볼게요.', '그건 바로 답할 수 있을 것 같아요.', '그렇게 생각한 이유가 궁금하네요.']) },
          { type: 'narrative', speaker: null, text: cold ? fresh(["대답을 기다리는 침묵이 길어진다. 의자 다리가 바닥을 짧게 긁었다.", "문 쪽에서 찬 공기가 한 번 들어왔다. 그는 탁자 끝을 짚은 손에 힘을 풀었다.", "멀리서 자동차가 지나가는 소리만 남는다. 접어 두었던 종이 모서리가 조금 들렸다.", "책등에 비친 불빛이 흔들렸다. 그가 호흡을 길게 내쉰 뒤 말을 덧붙였다."]) : fresh(["말끝에 웃음이 살짝 묻어났다. 찻잔에서 김이 가늘게 올라온다.", "그가 의자를 조금 당겨 앉았다. 서두르지 않은 다음 말이 조용한 방 안에 이어진다.", "창밖에서 낮은 바람 소리가 들려왔다. 손끝으로 책 모서리를 정리한 뒤 그가 고개를 든다.", "잠깐 멎었던 시선이 다시 돌아왔다. 펼친 종이 곁으로 작은 빛이 옮겨 간다."]) },
          { type: 'thought', speaker: name, text: cold ? '괜히 신경 쓰이게 하네.' : '조금은 반가운 것 같기도 하고.' },
          { type: 'dialogue', speaker: name, text: cold ? fresh(["할 말 있으면 해요.", "그 부분부터 먼저 듣죠.", "무슨 일이 있었는지 말해 봐요.", "당신 얘기를 아직 듣고 있어요."]) : fresh(["그래서, 오늘은 무슨 일로 왔어요?", "그 이야기부터 천천히 듣고 싶어요.", "방금 하신 말씀은 어떻게 된 일이에요?", "이어서 이야기해 보세요. 듣고 있어요."]) },
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
