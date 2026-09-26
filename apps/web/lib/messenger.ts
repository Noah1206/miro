/** 문자 페이지에 오는 메시지 종류. 만나서 나눈 장면(text·live_scene)은 /chat 에 남는다. */
export const MESSENGER_KINDS = ['reality_message', 'messenger', 'call_record', 'photo'] as const

/** 이 메시지가 문자 쪽인가 — 사진은 문자로 보낸 것(reality 블록)만. /chat 과 /messages 가 같은 판정을 쓴다. */
export function isMessengerMessage(m: { kind: string; blocks: unknown }): boolean {
  if (m.kind === 'photo') return Array.isArray(m.blocks) && m.blocks.some((b) => (b as { type?: string })?.type === 'reality')
  return (MESSENGER_KINDS as readonly string[]).includes(m.kind)
}
