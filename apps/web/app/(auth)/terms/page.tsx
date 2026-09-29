import { redirect } from 'next/navigation'

/** 약관 동의는 온보딩의 마지막 단계가 됐다(2026-09-30). 옛 링크를 위해 남겨 둔다. */
export default function TermsPage() {
  redirect('/onboarding')
}
