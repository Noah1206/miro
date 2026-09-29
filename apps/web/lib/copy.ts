import { msg } from '@/lib/i18n'
import { subject } from './format'

/** 사용자에게 보이는 공통 문장. docs/COPY.md 의 규칙을 코드로 고정한다. */
export const COPY = {
  error: {
    connection: msg('잠시 연결이 끊겼어요. 다시 이어볼까요?'),
    generation: msg('지금은 답을 만들지 못했어요. 한 번 더 말해 주세요.'),
    saveConflict: msg('지금은 저장하지 못했어요. 한 번 더 눌러 주세요.'),
    concurrent: msg('다른 요청이 먼저 처리됐어요. 다시 시도해 주세요.'),
    notFound: msg('찾을 수 없어요.'),
    sessionNotFound: msg('이 인연을 찾을 수 없어요.'),
    tooLong: (n: number) => `${n}자 이내로 적어 주세요.`,
    tooShort: msg('조금 더 자세히 적어 주세요.'),
    restricted: msg('운영 정책에 따라 이 역할극은 제한되었습니다. 문의는 설정에서 할 수 있어요.'),
    photo: msg('사진을 만들지 못했어요. 대화는 이어갈 수 있어요.'),
    callStart: msg('통화를 시작하지 못했어요.'),
    callNotActive: msg('진행 중인 통화가 아니에요.'),
    callUnstable: msg('연결이 불안정해요. 텍스트로 이어갈까요?'),
    featureOff: msg('지금 단계에서는 열리지 않은 기능이에요.'),
    budget: msg('오늘 준비된 대화가 모두 끝났어요. 내일 다시 이어갈 수 있어요.'),
    /** 월간 상한은 내일이 아니라 다음 달에 풀린다 — 없는 날짜를 약속하지 않는다. */
    budgetMonthly: msg('이번 달 이어갈 수 있는 대화를 모두 썼어요. 다음 달에 다시 이어갈 수 있고, 기존 대화와 기억은 그대로 남아요.'),
  },
  /** 이용권 — 끝나기 전에 알린다. 다시 받으라는 권유는 없다(Pro 는 당분간 팔지 않는다, 2026-09-28). */
  pass: {
    soonPush: {
      title: 'MIRO 이용권이 곧 끝나요',
      body: '3일 뒤 Pro 이용권이 끝나요.',
    },
    endedPush: {
      title: 'MIRO 이용권이 끝났어요',
      body: '대화와 기억은 그대로 남아 있어요.',
    },
  },
  /** 환불 조건은 구매 전에 보여 준다 — 숨기지 않는다는 것이 확정된 방침이다. */
  refund: {
    recharge: msg('충전은 7일 안에 쓰지 않은 만큼 환불해 드려요.'),
    failure: msg('장애나 잘못 지급된 경우는 언제든 전액 환불해 드려요.'),
    how: msg('환불은 설정에서 문의하면 입금 계좌로 보내 드려요.'),
  },
  status: {
    thinking: (name: string) => `${subject(name)} 답을 고르고 있다…`,
    scene: msg('장면을 이어가는 중…'),
    loading: msg('불러오는 중'),
    mockLLM: msg('LLM Provider 미구성 — Mock 응답입니다.'),
  },
  cta: {
    enterWorld: msg('세계로 들어가기'), continueWorld: msg('이어서 보기'), startRoleplay: msg('대화 시작하기'),
    send: msg('전송'), act: msg('행동'), speak: msg('말하기'), hangUp: msg('종료'), close: msg('닫기'), back: msg('뒤로'), skip: msg('본문으로 건너뛰기'),
  },
  a11y: {
    composer: msg('역할극 입력'), liveInput: msg('행동 입력'), callInput: msg('통화 중 말하기'), styleGroup: msg('출력 스타일'),
    messageLog: msg('대화'), usageMeter: msg('이번 달 Reality 사용량'), hero: (name: string) => `${name}의 세계로 들어가기`,
  },
} as const
