'use server'
import { requireUser } from '@/lib/auth'
import { deleteUserChapter, saveUserChapter } from '@/lib/novel'

/** 11/21 유저가 엮는 웹소설 — 화 저장·지우기(방 주인만, lib/novel 이 확인한다). */
export async function saveChapterAction(sessionId: string, input: { n?: number; title: string; turns: number[] }) {
  const user = await requireUser()
  try { return { chapters: await saveUserChapter(sessionId, user.id, input) } } catch { return { error: 'save' as const } }
}

export async function deleteChapterAction(sessionId: string, n: number) {
  const user = await requireUser()
  try { return { chapters: await deleteUserChapter(sessionId, user.id, n) } } catch { return { error: 'delete' as const } }
}
