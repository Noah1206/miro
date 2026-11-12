'use server'
import { requireUser } from '@/lib/auth'
import { creatorOf, setFollow, validCreatorKey } from '@/lib/creators'

/** 팔로우/취소 — 바뀐 뒤의 팔로워 수와 상태를 돌려준다. */
export async function toggleFollow(creatorKey: string, follow: boolean) {
  const user = await requireUser()
  if (typeof creatorKey !== 'string' || !validCreatorKey(creatorKey)) return null
  await setFollow(user.id, creatorKey, follow)
  const c = await creatorOf(creatorKey, user.id)
  return c ? { following: c.following, followers: c.followers } : null
}
