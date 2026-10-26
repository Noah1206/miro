import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'

/** Existing links and mobile identity callbacks open the sheet over the profile. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  if (!await currentUser()) redirect('/login')
  const { r } = await searchParams
  const result = r === 'done' || r === 'cancelled' || r === 'failed' ? `&r=${r}` : ''
  redirect(`/my?verify=1${result}`)
}
