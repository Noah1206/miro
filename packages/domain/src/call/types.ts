export type CallChannel = 'voice' | 'video'
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined'

/** RP 엔진의 동작 모드. 통화 중에는 같은 시뮬레이션이 "말"로만 진행된다. */
/** chat = 만나서 나누는 장면, messenger = 문자(카톡형), voice_call/video_call = 통화. 모두 같은 시뮬레이션이다. */
export type SimulationMode = 'chat' | 'messenger' | 'voice_call' | 'video_call'

export const CALL_MODE_RULES: Record<Exclude<SimulationMode, 'chat'>, string> = {
  voice_call:
    '- 지금은 전화 통화 중입니다. 대사(dialogue)만 말합니다. 서술(narrative)이나 행동 묘사는 넣지 않습니다.\n' +
    '- 전화 특유의 짧은 호흡. 침묵, 한숨, 웃음은 대사 안에서 표현합니다.',
  video_call:
    '- 지금은 영상통화 중입니다. 대사(dialogue) 위주이며, 표정이나 시선 같은 짧은 행동(action)만 허용합니다.\n' +
    '- 화면 너머로 보이는 것만 묘사합니다. 장면 서술(narrative)은 넣지 않습니다.',
  // 메신저: 같은 공간에 없다. 문자로 보낼 수 있는 것만 — 서술·행동·속마음은 문자에 실리지 않는다.
  messenger:
    '- 지금은 메신저(문자) 대화입니다. 두 사람은 같은 공간에 있지 않고 각자 있는 곳에서 폰으로 주고받습니다. 대사(dialogue) 블록만 씁니다 — 서술(narrative)·행동(action)·속마음(thought)은 넣지 않습니다.\n' +
    '- 실제로 보낼 문자처럼 씁니다: 짧은 메시지 1~3개(각 1~2문장)를 dialogue 블록 하나씩으로. 말줄임·이모티콘·오타 습관은 이 캐릭터의 말투대로. 표정·행동은 글로 설명하지 않고 필요하면 "ㅋㅋ", "…" 같은 문자 표현으로 대신합니다.\n' +
    '- 지금 캐릭터가 있는 장소와 현실 시각에 맞게 답합니다(일하는 중이면 짧게, 밤이면 밤답게). 만나서 하는 말처럼 쓰지 않습니다.',
}

/** 통화 중 허용되는 블록. 전화에는 서술할 화면이 없다. */
export function allowedBlockTypes(mode: SimulationMode): ReadonlySet<string> {
  if (mode === 'voice_call') return new Set(['dialogue', 'npc'])
  if (mode === 'video_call') return new Set(['dialogue', 'npc', 'action'])
  if (mode === 'messenger') return new Set(['dialogue'])
  return new Set(['dialogue', 'action', 'narrative', 'npc', 'world', 'thought'])
}
