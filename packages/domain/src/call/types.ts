export type CallChannel = 'voice' | 'video'
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined'

/** RP 엔진의 동작 모드. 통화 중에는 같은 시뮬레이션이 "말"로만 진행된다. */
export type SimulationMode = 'chat' | 'voice_call' | 'video_call'

export const CALL_MODE_RULES: Record<Exclude<SimulationMode, 'chat'>, string> = {
  voice_call:
    '- 지금은 전화 통화 중입니다. 대사(dialogue)만 말합니다. 서술(narrative)이나 행동 묘사는 넣지 않습니다.\n' +
    '- 전화 특유의 짧은 호흡. 침묵, 한숨, 웃음은 대사 안에서 표현합니다.',
  video_call:
    '- 지금은 영상통화 중입니다. 대사(dialogue) 위주이며, 표정이나 시선 같은 짧은 행동(action)만 허용합니다.\n' +
    '- 화면 너머로 보이는 것만 묘사합니다. 장면 서술(narrative)은 넣지 않습니다.',
}

/** 통화 중 허용되는 블록. 전화에는 서술할 화면이 없다. */
export function allowedBlockTypes(mode: SimulationMode): ReadonlySet<string> {
  if (mode === 'voice_call') return new Set(['dialogue', 'npc'])
  if (mode === 'video_call') return new Set(['dialogue', 'npc', 'action'])
  return new Set(['dialogue', 'action', 'narrative', 'npc', 'world', 'thought'])
}
