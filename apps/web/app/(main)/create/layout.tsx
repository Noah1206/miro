import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'

export const metadata: Metadata = { title: '캐릭터 만들기' }

/** 만들기는 저장까지 가야 의미가 있다 — 문 앞에서 막는다. 다 적고 나서 튕기면 입력이 사라진다. */
export default async function L({ children }: { children: React.ReactNode }) {
  if (!(await currentUser())) redirect('/login?next=%2Fcreate')
  return children
}
