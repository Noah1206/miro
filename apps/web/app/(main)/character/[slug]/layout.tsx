import type { Metadata } from 'next'
import { getT } from '@/lib/i18n/server'
export async function generateMetadata(): Promise<Metadata> { const t = await getT(); return { title: t('캐릭터') } }
export default function L({ children }: { children: React.ReactNode }) { return children }
