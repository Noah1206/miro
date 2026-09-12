import { redirect } from 'next/navigation'
import { currentAdmin } from '@/lib/auth'
export default async function Root() { redirect((await currentAdmin()) ? '/reports' : '/login') }
