import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, characters, roleplaySessions, users, worlds } from '@miro/db'
import { testDatabaseUrl } from '../../../tooling/test-database'

const databaseUrl = testDatabaseUrl(process.env.DATABASE_URL)
const describeDb = databaseUrl ? describe : describe.skip

function startReader(url: string) {
  const workerPath = fileURLToPath(new URL('./__tests__/home-process-worker.ts', import.meta.url))
  const processHandle: ChildProcessWithoutNullStreams = spawn(
    fileURLToPath(new URL('../../../node_modules/.bin/tsx', import.meta.url)),
    [workerPath],
    { env: { ...process.env, DATABASE_URL: url } },
  )
  const pending = new Map<number, { resolve: (ids: string[]) => void; reject: (error: Error) => void }>()
  let nextId = 0
  let stderr = ''
  processHandle.stderr.on('data', chunk => { stderr += String(chunk) })
  createInterface({ input: processHandle.stdout }).on('line', line => {
    const response = JSON.parse(line) as { id: number; ids?: string[]; error?: string }
    const request = pending.get(response.id)
    if (!request) return
    pending.delete(response.id)
    if (response.error) request.reject(new Error(response.error))
    else request.resolve(response.ids ?? [])
  })
  processHandle.on('exit', code => {
    for (const request of pending.values()) request.reject(new Error(`reader exited ${code}: ${stderr}`))
    pending.clear()
  })
  return {
    send(request: { kind: 'feed' | 'popular' } | { kind: 'character'; characterId: string; change: 'unpublish' | 'publish' | 'draft' | 'delete' } | { kind: 'session'; sessionId: string; deleted: boolean }) {
      const id = ++nextId
      return new Promise<string[]>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        processHandle.stdin.write(JSON.stringify({ id, ...request }) + '\n')
      })
    },
    read(kind: 'feed' | 'popular') { return this.send({ kind }) },
    async close() {
      if (processHandle.exitCode !== null) return
      processHandle.stdin.end()
      await new Promise<void>(resolve => processHandle.once('exit', () => resolve()))
    },
  }
}

describeDb('public lists across separate processes', () => {
  const madeUsers: string[] = []
  const madeSessions: string[] = []
  afterAll(async () => {
    for (const id of madeSessions) await db.delete(roleplaySessions).where(eq(roleplaySessions.id, id))
    for (const id of madeUsers) await db.delete(users).where(eq(users.id, id))
  })

  it('reads create, popularity, unpublish, draft, and delete changes in both processes', async () => {
    const [owner] = await db.insert(users).values({ email: `home-owner-${randomUUID()}@miro.dev` }).returning({ id: users.id })
    const [viewer] = await db.insert(users).values({ email: `home-viewer-${randomUUID()}@miro.dev` }).returning({ id: users.id })
    madeUsers.push(owner!.id, viewer!.id)
    const readers = [startReader(databaseUrl!), startReader(databaseUrl!)]
    const readBoth = (kind: 'feed' | 'popular') => Promise.all(readers.map(reader => reader.read(kind)))
    try {
      await readers[0]!.read('feed')
      await readers[0]!.read('popular')

      const [character] = await db.insert(characters).values({
        ownerId: owner!.id, name: 'cross-process feed', personality: 'test',
        isPublic: true, isDraft: false, isOfficial: false,
      }).returning({ id: characters.id })
      const [world] = await db.insert(worlds).values({ characterId: character!.id, location: '서울' }).returning({ id: worlds.id })
      for (const ids of await readBoth('feed')) expect(ids).toContain(character!.id)

      const [session] = await db.insert(roleplaySessions).values({ userId: viewer!.id, characterId: character!.id, worldId: world!.id })
        .returning({ id: roleplaySessions.id })
      madeSessions.push(session!.id)
      for (const ids of await readBoth('popular')) expect(ids).toContain(character!.id)
      await readers[1]!.send({ kind: 'session', sessionId: session!.id, deleted: true })
      for (const ids of await readBoth('popular')) expect(ids).not.toContain(character!.id)
      await readers[1]!.send({ kind: 'session', sessionId: session!.id, deleted: false })
      for (const ids of await readBoth('popular')) expect(ids).toContain(character!.id)

      await readers[0]!.read('feed')
      await readers[0]!.read('popular')
      await readers[1]!.send({ kind: 'character', characterId: character!.id, change: 'unpublish' })
      for (const kind of ['feed', 'popular'] as const) {
        for (const ids of await readBoth(kind)) expect(ids).not.toContain(character!.id)
      }

      await readers[1]!.send({ kind: 'character', characterId: character!.id, change: 'publish' })
      for (const ids of await readBoth('feed')) expect(ids).toContain(character!.id)
      for (const ids of await readBoth('popular')) expect(ids).toContain(character!.id)

      await readers[1]!.send({ kind: 'character', characterId: character!.id, change: 'draft' })
      for (const kind of ['feed', 'popular'] as const) {
        for (const ids of await readBoth(kind)) expect(ids).not.toContain(character!.id)
      }

      await readers[1]!.send({ kind: 'character', characterId: character!.id, change: 'delete' })
      for (const kind of ['feed', 'popular'] as const) {
        for (const ids of await readBoth(kind)) expect(ids).not.toContain(character!.id)
      }

      const fillers = await db.insert(characters).values(Array.from({ length: 13 }, (_, index) => ({
        ownerId: owner!.id, name: `page refill ${index}`, personality: 'test',
        isPublic: true, isDraft: false, isOfficial: false,
      }))).returning({ id: characters.id })
      const [firstPage] = await readBoth('feed')
      expect(firstPage).toHaveLength(12)
      const selected = firstPage!.find(id => fillers.some(filler => filler.id === id))
      expect(selected).toBeDefined()
      await readers[1]!.send({ kind: 'character', characterId: selected!, change: 'delete' })
      for (const ids of await readBoth('feed')) {
        expect(ids).toHaveLength(12)
        expect(ids).not.toContain(selected)
      }
    } finally {
      await Promise.all(readers.map(reader => reader.close()))
    }
  }, 15000)
})
