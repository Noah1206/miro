'use server'
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { db, commandBook, users, type CharacterCommand } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { parseCommands } from './parse'

export type LibraryCommand = CharacterCommand & { id: string; uses: number; mine: boolean; owner: string | null }

/** 명령어 라이브러리(10/19) — 공개된 것 전부와 내 것. 이름·설명으로 거르고 많이 쓰인 순. */
export async function searchCommands(query: string): Promise<LibraryCommand[]> {
  const user = await requireUser()
  const q = query.trim().slice(0, 40).replace(/[%_\\]/g, ch => `\\${ch}`)
  const rows = await db.select({ id: commandBook.id, name: commandBook.name, hint: commandBook.hint, prompt: commandBook.prompt, uses: commandBook.uses, ownerId: commandBook.ownerId, owner: users.displayName })
    .from(commandBook).leftJoin(users, eq(users.id, commandBook.ownerId))
    .where(and(isNull(commandBook.deletedAt), or(eq(commandBook.isPublic, true), eq(commandBook.ownerId, user.id)),
      ...(q ? [or(ilike(commandBook.name, `%${q}%`), ilike(commandBook.hint, `%${q}%`))] : [])))
    .orderBy(desc(commandBook.uses), desc(commandBook.createdAt)).limit(60)
  return rows.map(r => ({ id: r.id, sourceId: r.id, name: r.name, hint: r.hint, prompt: r.prompt, uses: r.uses, mine: r.ownerId === user.id, owner: r.owner }))
}

/** 새 명령어를 라이브러리에 넣는다. 공개면 누구나 자기 캐릭터에 붙일 수 있다. 돌려준 복사본을 캐릭터에 붙인다. */
export async function saveCommand(input: { name: string; hint: string; prompt: string; isPublic: boolean }): Promise<CharacterCommand> {
  const user = await requireUser()
  const [cmd] = parseCommands(JSON.stringify([input]))
  if (!cmd) throw new Error('COMMAND_INVALID')
  const [row] = await db.insert(commandBook).values({ ownerId: user.id, name: cmd.name, hint: cmd.hint, prompt: cmd.prompt, isPublic: input.isPublic === true }).returning({ id: commandBook.id })
  return { ...cmd, sourceId: row!.id }
}

/** 라이브러리에서 가져다 붙였다 — 정렬용 횟수만 올린다. */
export async function markCommandUsed(id: string): Promise<void> {
  await requireUser()
  if (!/^[0-9a-f-]{36}$/i.test(id)) return
  await db.update(commandBook).set({ uses: sql`${commandBook.uses} + 1` }).where(eq(commandBook.id, id))
}

/** 내가 올린 명령어를 라이브러리에서 내린다. 이미 붙인 캐릭터의 복사본은 그대로다. */
export async function removeCommand(id: string): Promise<void> {
  const user = await requireUser()
  if (!/^[0-9a-f-]{36}$/i.test(id)) return
  await db.update(commandBook).set({ deletedAt: new Date() }).where(and(eq(commandBook.id, id), eq(commandBook.ownerId, user.id)))
}
