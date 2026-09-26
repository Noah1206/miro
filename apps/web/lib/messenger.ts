/** 문자 페이지에 오는 메시지 종류. 만나서 나눈 장면(text·live_scene)은 /chat 에 남는다. */
export const MESSENGER_KINDS = ['reality_message', 'messenger', 'call_record', 'photo'] as const

type Row = { kind: string; blocks: unknown; turnIndex: number }
const hasCallLine = (m: Row) => Array.isArray(m.blocks) && m.blocks.some((b) => (b as { type?: string })?.type === 'call_line')

/**
 * 캐릭터챗(만나서 나누는 장면)에 보일 메시지. 문자·통화 기록은 /messages 로, 통화에서 오간 말(같은 턴의 내 말 포함)은 통화의 것이라 뺀다 —
 * 기억·관계에는 그대로 남아 있다. 화면에서만 장면과 통화를 섞지 않는다(9/26 데모에서 발견).
 */
export function sceneMessages<T extends Row>(rows: T[]): T[] {
  const callTurns = new Set(rows.filter(hasCallLine).map((m) => m.turnIndex))
  return rows.filter((m) => !isMessengerMessage(m) && !(m.kind === 'text' && callTurns.has(m.turnIndex)))
}

/** 이 메시지가 문자 쪽인가 — 사진은 문자로 보낸 것(reality 블록)만. /chat 과 /messages 가 같은 판정을 쓴다. */
export function isMessengerMessage(m: { kind: string; blocks: unknown }): boolean {
  if (m.kind === 'photo') return Array.isArray(m.blocks) && m.blocks.some((b) => (b as { type?: string })?.type === 'reality')
  return (MESSENGER_KINDS as readonly string[]).includes(m.kind)
}
