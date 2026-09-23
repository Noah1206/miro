import { createInterface } from 'node:readline'
import { eq } from 'drizzle-orm'
import { characters, db, roleplaySessions } from '@miro/db'
import { homePage, popularHomeCards } from '../home'

type Request =
  | { id: number; kind: 'feed' | 'popular' }
  | { id: number; kind: 'character'; characterId: string; change: 'unpublish' | 'publish' | 'draft' | 'delete' }
  | { id: number; kind: 'session'; sessionId: string; deleted: boolean }

async function run() {
  for await (const line of createInterface({ input: process.stdin })) {
    const request = JSON.parse(line) as Request
    try {
      if (request.kind === 'character') {
        const change = request.change === 'unpublish' ? { isPublic: false }
          : request.change === 'publish' ? { isPublic: true }
            : request.change === 'draft' ? { isDraft: true } : { deletedAt: new Date() }
        await db.update(characters).set(change).where(eq(characters.id, request.characterId))
        process.stdout.write(JSON.stringify({ id: request.id }) + '\n')
      } else if (request.kind === 'session') {
        await db.update(roleplaySessions).set({ deletedAt: request.deleted ? new Date() : null })
          .where(eq(roleplaySessions.id, request.sessionId))
        process.stdout.write(JSON.stringify({ id: request.id }) + '\n')
      } else {
        const cards = request.kind === 'feed' ? (await homePage()).items : await popularHomeCards()
        process.stdout.write(JSON.stringify({ id: request.id, ids: cards.map(card => card.id) }) + '\n')
      }
    } catch (error) {
      process.stdout.write(JSON.stringify({ id: request.id, error: String(error) }) + '\n')
    }
  }
}

void run().then(() => process.exit(0))
