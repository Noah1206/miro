import { OAUTH_LABEL, resolveOAuth, type OAuthProviderId } from '@miro/providers'
import { LoginStage } from './stage'

const ERRORS: Record<string, string> = {
  deleted: '삭제된 계정이에요. 같은 계정으로는 다시 들어올 수 없어요.',
  denied: '로그인을 취소했어요. 준비되면 다시 시도해 주세요.',
  failed: '잠시 연결이 끊겼어요. 다시 이어볼까요?',
}

/** n1→n5 — 앱의 첫 화면이자 로그인. 온보딩 소개 페이지는 두지 않는다 (E-44). 가입과 로그인도 나누지 않는다. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const ids: OAuthProviderId[] = ['google', 'kakao', 'naver']
  const mock = ids.map(resolveOAuth).find((p) => p.info.mode === 'mock')
  return <LoginStage providers={ids.map((id) => ({ id, label: OAUTH_LABEL[id] }))} notice={mock?.info.notice ?? null} error={(error && ERRORS[error]) || null} />
}
