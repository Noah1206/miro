'use server'
import { currentUser } from '@/lib/auth'
import { accountProfile } from '@/lib/account-profile'

/** No caller-supplied account ID: never return another account's identity. */
export async function readAccountProfile() {
  const user = await currentUser()
  return user ? accountProfile(user) : null
}
