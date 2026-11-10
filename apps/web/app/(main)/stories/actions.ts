'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { detailFields, parseProtagonist, runFor, startRun, storyBySlug } from '@/lib/stories/repo'
import { markThreadRead } from '@/lib/stories/contacts'
import { setContactPermission } from '@/lib/stories/view'
import { db, userSettings } from '@miro/db'
import { storyUnveilAllowed } from '@/lib/home-mode'
import { msg } from '@/lib/i18n'

export type StartState = { error: string | null }

/** 주인공 설정을 받아 회차를 시작하거나(새 회차) 이어 간다. */
export async function startStory(slug: string, _prev: StartState, form: FormData): Promise<StartState> {
  const user = await currentUser()
  if (!user) return { error: '로그인이 필요해요.' }
  const story = await storyBySlug(slug)
  if (!story) return { error: '작품을 찾을 수 없어요.' }
  const details: Record<string, string> = {}
  for (const f of detailFields(story)) details[f] = String(form.get(`detail:${f}`) ?? '')
  const p = parseProtagonist(story, { name: String(form.get('name') ?? ''), age: String(form.get('age') ?? ''), honorific: String(form.get('honorific') ?? ''), details })
  if ('error' in p) return { error: p.error }
  if (form.get('adult') !== 'on') return { error: '모든 등장인물과 주인공이 성인인 작품이에요. 확인란을 체크해 주세요.' }
  // 성인용 시작(10/19) — 클라이언트 버튼 값을 믿지 않고 홈 언베일·자격을 서버에서 다시 본다.
  const adult = form.get('unveil') === 'on'
  if (adult && !(await storyUnveilAllowed(user.id, story, p, { home: true }))) return { error: msg('성인용 채팅은 홈에서 언베일을 켜고 성인 인증을 마친 뒤 시작할 수 있어요.') }
  const run = await startRun(user.id, story.id, p, { fresh: form.get(adult ? 'adultMode' : 'mode') === 'new', contactOptIn: form.get('contact') === 'on', adult })
  redirect(`/stories/play/${run.id}`)
}

export async function setStoryContact(runId: string, character: string, value: 'allowed' | 'stopped') {
  const user = await currentUser()
  if (!user) return { ok: false as const, error: 'unauthorized' }
  return setContactPermission(user.id, runId, character, value)
}

export async function readStoryThread(runId: string, thread: string, messageIds?: string[]) {
  const user = await currentUser()
  if (!user || !(await runFor(user.id, runId))) return
  await markThreadRead(runId, thread, new Date(), messageIds)
  revalidatePath('/archive')
  revalidatePath('/home')
  return { ok: true as const }
}

/** 연락 받을 시간대(기기 시간대). 모르면 선톡을 보내지 않는다 — 여기서 정해야 보내기 시작한다. */
export async function setStoryTimeZone(timeZone: string) {
  const user = await currentUser()
  if (!user) return { ok: false as const }
  try { new Intl.DateTimeFormat('en', { timeZone }) } catch { return { ok: false as const } }
  await db.insert(userSettings).values({ userId: user.id, timeZone }).onConflictDoUpdate({ target: userSettings.userId, set: { timeZone, updatedAt: new Date() } })
  return { ok: true as const }
}
