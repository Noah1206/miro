import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Back, Notice, Page, PageHeader } from '@/components/ui'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal'
import { msg } from '@/lib/i18n'
import { getT } from '@/lib/i18n/server'

const DOCS = {
  service: { title: msg('서비스 이용약관'), version: TERMS_VERSION },
  privacy: { title: msg('개인정보 처리방침'), version: PRIVACY_VERSION },
  ai: { title: msg('AI 생성 콘텐츠 안내'), version: TERMS_VERSION },
} as const

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params
  const t = await getT()
  return { title: t(DOCS[doc as keyof typeof DOCS]?.title ?? msg('약관')) }
}

/**
 * 약관 전문.
 *
 * 본문은 법무 검토를 거친 문서여야 한다 — 지어내면 그 자체가 법적 위험이다.
 * 그때까지 이 화면은 아직 없다는 사실을 숨기지 않는다 (DEV_DEFAULT 원칙).
 */
export default async function TermsDoc({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params
  const d = DOCS[doc as keyof typeof DOCS]
  if (!d) notFound()
  const t = await getT()
  return (
    <Page style={{ maxWidth: 560 }}>
      <Back href="/onboarding" label={t('동의 화면으로')} />
      <PageHeader title={t(d.title)} lead={t('버전 {version}', { version: d.version })} />
      <Notice>{t('전문은 아직 준비 중입니다 (법무 검토 예정). 문의: 고객센터')}</Notice>
    </Page>
  )
}
