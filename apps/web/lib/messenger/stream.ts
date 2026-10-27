/** Transport-only draft. A queued/failed draft is never a persisted message. */
export type MessengerDraftStream = { onText(text: string): void; onReset(): void }
export type MessengerDraftEvents = { onDraft(id: string, text: string): void; onReset(id: string): void }

/** Decode only the root text after an explicit leading send:true. Never expose reasoning/JSON. */
export function draftMessageText(raw: string): string | null {
  const prefix = /^\s*\{\s*"send"\s*:\s*true\s*,\s*"text"\s*:\s*"/.exec(raw)
  if (!prefix) return null
  let end = prefix[0].length, escaped = false, safe = end
  for (; end < raw.length; end++) {
    const ch = raw[end]!
    if (!escaped && ch === '"') break
    if (!escaped && ch === '\\') { escaped = true; continue }
    if (escaped && ch === 'u') {
      if (!/^[0-9a-fA-F]{4}$/.test(raw.slice(end + 1, end + 5))) break
      end += 4
    }
    escaped = false; safe = end + 1
  }
  try { return JSON.parse('"' + raw.slice(prefix[0].length, safe) + '"') as string } catch { return null }
}

import type { MessengerItem } from './inbox'
export type MessengerStreamEvent = { type: 'items'; items: MessengerItem[] } | { type: 'draft'; id: string; text: string } | { type: 'reset'; id: string } | { type: 'done' }
/** Both the first snapshot and the final persisted snapshot arrive on the same authenticated request. */
export async function readMessengerStream(response: Response, onEvent: (event: MessengerStreamEvent) => void) {
  if (!response.ok || !response.body) throw new Error('messenger_stream_failed')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) throw new Error('messenger_stream_incomplete')
      buffer += value
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1)
        if (!line.trim()) continue
        const event = JSON.parse(line) as MessengerStreamEvent
        onEvent(event)
        if (event.type === 'done') return
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
