import { and, eq, isNull, or } from 'drizzle-orm'
import { commandBook, db, type CharacterCommand } from '@miro/db'

/** Never execute a client-supplied prompt or another user's private library item. */
export async function resolveChatCommand(userId: string, attached: CharacterCommand[], selection: { name?: string; sourceId?: string }): Promise<CharacterCommand | null> {
  if (selection.sourceId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selection.sourceId)) return null
    const [row] = await db.select({ name: commandBook.name, hint: commandBook.hint, prompt: commandBook.prompt })
      .from(commandBook).where(and(eq(commandBook.id, selection.sourceId), isNull(commandBook.deletedAt),
        or(eq(commandBook.isPublic, true), eq(commandBook.ownerId, userId)))).limit(1)
    return row ?? null
  }
  return attached.find(command => command.name === selection.name) ?? null
}
