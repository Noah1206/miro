'use server'
import { currentUser } from '@/lib/auth'
import { reflectOnUser, type MemoryReflection } from '@/lib/memory-reflection'
import { observe } from '@/lib/observe'

/** 기억 페이지를 열었을 때 '나에 대한 생각'이 지금 기억보다 낡았으면 새로 쓴다. 실패하면 null(화면은 생각 칸만 숨긴다). */
export async function thinkAboutMe(sessionId: string): Promise<MemoryReflection | null> {
  const user = await currentUser()
  if (!user) return null
  return reflectOnUser(sessionId, user.id).catch((e) => { observe('memory.reflection_failed', { sessionId, error: e instanceof Error ? e.message.slice(0, 160) : 'unknown' }); return null })
}
