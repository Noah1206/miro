import { and, eq, isNull } from 'drizzle-orm'
import { db, generatedMedia, roleplaySessions, users, characters } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { MESSENGER_IMAGE_BUCKET, messengerStorage } from '@/lib/storage/messenger-images'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(), { id } = await params
  const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' }
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401, headers })
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return Response.json({ error: 'not_found' }, { status: 404, headers })
  const [row] = await db.select({ asset: generatedMedia }).from(generatedMedia)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, generatedMedia.sessionId))
    .innerJoin(users, eq(users.id, roleplaySessions.userId)).innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(generatedMedia.id, id), eq(roleplaySessions.userId, user.id),
      isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt), isNull(users.deletedAt), isNull(characters.deletedAt)))
  const storage = row?.asset.providerMetadata.storage as { bucket?: string; path?: string } | undefined
  if (!row || row.asset.kind !== 'photo' || storage?.bucket !== MESSENGER_IMAGE_BUCKET
    || !storage.path?.startsWith(`${row.asset.sessionId}/${id}.`)) return Response.json({ error: 'not_found' }, { status: 404, headers })
  try {
    const signed = await messengerStorage().storage.from(storage.bucket).createSignedUrl(storage.path, 60)
    if (signed.error || !signed.data?.signedUrl) throw new Error('unavailable')
    return new Response(null, { status: 302, headers: { ...headers, location: signed.data.signedUrl } })
  } catch { return Response.json({ error: 'unavailable' }, { status: 503, headers }) }
}
