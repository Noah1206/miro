/** 사용자에게 보이는 공통 문장. docs/COPY.md 의 규칙을 코드로 고정한다. */
export const COPY = {
  error: {
    connection: '잠시 연결이 끊겼어요. 다시 이어볼까요?',
    generation: '지금은 답을 만들지 못했어요. 한 번 더 말해 주세요.',
    saveConflict: '지금은 저장하지 못했어요. 한 번 더 눌러 주세요.',
    concurrent: '다른 요청이 먼저 처리됐어요. 다시 시도해 주세요.',
    notFound: '찾을 수 없어요.',
    sessionNotFound: '이 인연을 찾을 수 없어요.',
    tooLong: (n: number) => `${n}자 이내로 적어 주세요.`,
    tooShort: '조금 더 자세히 적어 주세요.',
    restricted: '운영 정책에 따라 이 역할극은 제한되었습니다. 문의는 설정에서 할 수 있어요.',
    photo: '사진을 만들지 못했어요. 대화는 이어갈 수 있어요.',
    callStart: '통화를 시작하지 못했어요.',
    callNotActive: '진행 중인 통화가 아니에요.',
    callUnstable: '연결이 불안정해요. 텍스트로 이어갈까요?',
  },
  status: {
    thinking: (name: string) => `${name}이(가) 답을 고르고 있다…`,
    scene: '장면을 이어가는 중…',
    loading: '불러오는 중',
    mockLLM: 'LLM Provider 미구성 — Mock 응답입니다.',
  },
  cta: {
    enterWorld: '세계로 들어가기', continueWorld: '이어서 보기', startRoleplay: '대화 시작하기',
    send: '전송', act: '행동', speak: '말하기', hangUp: '종료', close: '닫기', back: '뒤로', skip: '본문으로 건너뛰기',
  },
  a11y: {
    composer: '역할극 입력', liveInput: '행동 입력', callInput: '통화 중 말하기', styleGroup: '출력 스타일',
    messageLog: '대화', usageMeter: '남은 사용량', hero: (name: string) => `${name}의 세계로 들어가기`,
  },
} as const
