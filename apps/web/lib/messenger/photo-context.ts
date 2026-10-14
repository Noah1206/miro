/** A generated depiction is a shared message, not proof of a new real-world event. */
export function photoMessageText(message: { content: string; kind?: string; blocks?: unknown[] }) {
  if (message.kind !== 'photo') return message.content
  const block = message.blocks?.find(b => !!b && typeof b === 'object' && 'type' in b && b.type === 'reality') as
    { caption?: unknown; photoDescription?: unknown } | undefined
  return [typeof block?.caption === 'string' ? block.caption : '',
    typeof block?.photoDescription === 'string' ? `[Shared generated photo depicts: ${block.photoDescription}. This depiction does not independently prove a completed event.]` : '[Shared photo]'].filter(Boolean).join('\n')
}
