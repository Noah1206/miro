import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { consentRedirect } from '@/lib/consent-gate'
import { Page } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { TRANSFER_ROWS } from '@/lib/legal/transfer-table'
import { getT } from '@/lib/i18n/server'
import { agreeTransfer } from './actions'
import { BackButton } from './back-button'
import s from './transfer.module.css'

export async function generateMetadata(): Promise<Metadata> { const t = await getT(); return { title: t('개인정보 국외 이전 동의') } }

/** 아이콘 + 굵은 제목 + 회색 설명 (메타·인스타그램 동의 화면의 결). */
const POINTS = [
  { title: '대화에 필요한 정보만 보내요', body: '대화 입력, 페르소나(닉네임·성별·소개), 캐릭터 설정, 최근 대화와 기억 요약, 현지 시각·언어', icon: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /> },
  { title: '암호화해서 보내요', body: '모든 전송은 암호화된 네트워크(HTTPS)를 거쳐요. 언베일 대화는 대화를 저장·학습하지 않는 공급자에게만 보내요.', icon: <><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></> },
  { title: '필요한 동안만 처리해요', body: '대부분 응답을 만드는 동안만 처리해요. 보관 기간은 업체마다 조금씩 달라요.', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { title: '언제든 철회할 수 있어요', body: '동의한 뒤에도 마이페이지 › 설정 › 계정 삭제로 철회할 수 있어요.', icon: <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" /> },
]

/**
 * 국외 이전 별도 동의 — 10/5 이전에 가입해 이 동의가 없는 회원에게 한 번 받는다(새 회원은 온보딩 마지막 단계에서 받는다).
 * 개인정보 보호법 제28조의8: 이전받는 자·국가·목적 요지를 보이고 '동의' 버튼으로 동의를 받는다(10/9 메타식 리디자인, 체크박스 없음).
 */
export default async function TransferConsentPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const pending = await consentRedirect(user.id)
  if (pending !== '/onboarding/transfer') redirect(pending ?? '/home')
  const t = await getT()
  return (
    <Page className={s.page}>
      <BackButton className={s.topBack} label={t('뒤로')}>
        <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
      </BackButton>

      <h1 className={s.title}>{t('MIRO가 해외 업체와 개인정보를 처리하는 방식')}</h1>
      <p className={s.intro}>{t('캐릭터 대화는 해외 AI 업체의 서버에서 만들어져요. 그래서 일부 개인정보가 국외로 전송돼요. 이용약관·개인정보 처리방침과는 별도로 동의가 필요해요.')}</p>

      <ul className={s.points}>
        {POINTS.map((p) => (
          <li key={p.title} className={s.point}>
            <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{p.icon}</svg>
            <div><h2>{t(p.title)}</h2><p>{t(p.body)}</p></div>
          </li>
        ))}
      </ul>

      <h2 className={s.groupTitle}>{t('개인정보를 받는 업체')}</h2>
      <ul className={s.vendors} lang="ko">
        {TRANSFER_ROWS.map((r) => (
          <li key={r[0]}><b>{r[0]!.replace(/\s*\(.*\)$/, '')}</b> · {r[1]!.replace(/\(.*\)$/, '')} · {r[4]}</li>
        ))}
      </ul>

      <form action={agreeTransfer} className={s.dock}>
        <div className={s.dockInner}>
          <input type="hidden" name="transfer" value="on" />
          {/* 배경은 변수로 — Button 의 인라인 채움을 이기면서 :hover/:active 에서 바꿀 수 있게 */}
          <SubmitButton variant="primary" full className={s.agree} style={{ background: 'var(--agree-bg)', border: '1px solid var(--agree-bg)', borderRadius: 999, minHeight: 50, fontSize: 16 }}>{t('동의')}</SubmitButton>
          <BackButton className={s.back}>
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
            {t('돌아가기')}
          </BackButton>
        </div>
      </form>
    </Page>
  )
}
