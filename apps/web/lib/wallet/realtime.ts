import { sql } from 'drizzle-orm'
import { db } from '@miro/db'

/** A publishable/legacy anon key is safe to return; a service/secret key never is. */
function publicKey(value: string) {
  if (value.startsWith('sb_publishable_')) return true
  try { return JSON.parse(Buffer.from(value.split('.')[1] ?? '', 'base64url').toString()).role === 'anon' }
  catch { return false }
}

export async function walletRealtimeChannel(userId: string) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key || !publicKey(key)) return null
  const [channel] = await db.execute<{ topic: string }>(sql`
    insert into miro_private.wallet_topics (user_id) values (${userId}::uuid)
    on conflict (user_id) do update set user_id = excluded.user_id
    returning topic
  `)
  return channel ? { url, key, topic: channel.topic, userId } : null
}
