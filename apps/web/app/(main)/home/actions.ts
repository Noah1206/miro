'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { setHomeUnveilFor } from '@/lib/home-mode'

export async function setHomeUnveil(enabled: boolean, agreed = false) {
  const user = await requireUser()
  const result = await setHomeUnveilFor(user.id, enabled === true, agreed === true)
  if (!result.ok && result.reason === 'verification') {
    const jar = await cookies()
    jar.set('miro_home_verify', user.id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 })
  }
  if (result.ok) { (await cookies()).delete('miro_home_verify'); revalidatePath('/home'); revalidatePath('/archive') }
  return result
}
