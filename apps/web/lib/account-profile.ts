import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { getPersona } from '@/lib/persona'

export type AccountProfile = { name: string; avatarUrl: string | null }

/** The account page and both room menus use the same saved identity. */
export async function accountProfile(user: { id: string; displayName: string | null; email: string | null }): Promise<AccountProfile> {
  const [persona, [profile]] = await Promise.all([
    getPersona(user.id),
    db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, user.id)).limit(1),
  ])
  return { name: persona?.name ?? user.displayName ?? user.email?.split('@')[0] ?? 'me', avatarUrl: profile?.avatarUrl ?? null }
}
