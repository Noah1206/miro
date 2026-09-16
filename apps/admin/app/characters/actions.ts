'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { setExperienceType } from '@/lib/characters'

export type TypeState = { message: string | null; ok: boolean }

/** 미로 지정·해제. 권한은 characters.manage (superadmin). 조건부 UPDATE 라 두 번 눌러도 한 번만 바뀐다. */
export async function setType(_p: TypeState, form: FormData): Promise<TypeState> {
  let admin
  try { admin = await requireAdmin('characters.manage') } catch { return { ok: false, message: '캐릭터 지정 권한이 없습니다.' } }
  const characterId = String(form.get('characterId') ?? '')
  const type = form.get('type') === 'reality' ? 'reality' as const : 'chat' as const
  const r = await setExperienceType(admin.id, characterId, type, String(form.get('note') ?? ''))
  revalidatePath('/characters')
  if (r.result === 'unchanged') return { ok: false, message: '이미 그 유형입니다.' }
  const tail = type === 'chat' && (r.clearedIntents || r.cancelledPushes)
    ? ` 남은 선연락 의도 ${r.clearedIntents}건을 지우고 대기 Push ${r.cancelledPushes}건을 취소했습니다.` : ''
  return { ok: true, message: (type === 'reality' ? '미로에 넣었습니다.' : '홈으로 되돌렸습니다.') + tail }
}
