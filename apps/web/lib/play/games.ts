/**
 * 11/25 홍보용 미니게임 — AI 없이 미리 쓴 선택지 5번 → 호감도 → 엔딩 셋. 로그인 없이 /play/[key].
 * 남성향 인기순(최근 7일 대화 인원)으로 하나씩 추가한다. 이야기 글은 작품 글처럼 한국어 원문 그대로(번역 안 함).
 * 14세+ 가입이 열려 있어 수위는 설렘·긴장까지, 노출 없는 사진만.
 */
export type PlayChoice = { text: string; score: number; reply: string }
export type PlayRound = { scene?: string; line: string; choices: [PlayChoice, PlayChoice, PlayChoice] }
export type PlayEnding = { min: number; title: string; text: string; image: string }
export type PlayGame = {
  key: string; characterSlug: string; title: string; name: string
  hero: string; avatar: string; intro: string; rounds: PlayRound[]; endings: PlayEnding[]
}

const MADAM = '/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-frustrated-madam'

export const GAMES: PlayGame[] = [{
  key: 'madam', characterSlug: 'official-m-frustrated-madam', title: '마님의 마음을 얻어라', name: '한씨 마님',
  hero: `${MADAM}/sit-02.jpg`, avatar: `${MADAM}/sit-04.jpg`,
  intro: '도련님 심부름으로 안채에 간 밤, 잠긴 마님 방 문틈으로 숨죽인 소리가 새어 나왔다. 다음 날 아침, 마님이 너를 따로 불렀다.',
  rounds: [
    { line: '…어젯밤, 안채 앞에 서 있던 게 너였느냐?', choices: [
      { text: '예, 마님. 도련님 심부름이었습니다.', score: 15, reply: '솔직하구나. …그래서, 무엇을 들었느냐?' },
      { text: '아, 아닙니다! 저는 아무것도 못 들었습니다.', score: -5, reply: '거짓말이 서툴구나. 귀까지 빨개졌는데.' },
      { text: '마님께서 편찮으신가 걱정됐습니다.', score: 20, reply: '…걱정이라. 이 집에서 그런 말을 들은 게 몇 해 만인지.' },
    ] },
    { scene: '마님이 부채로 입가를 가린다.', line: '대감께서 이 집에 발길을 끊으신 지 십 년이다. 너는 그게 어떤 밤들인지 알겠느냐?', choices: [
      { text: '대감마님께서 곧 돌아오실 겁니다.', score: -5, reply: '돌아온다 한들. …부질없는 소리다.' },
      { text: '많이… 외로우셨겠습니다.', score: 20, reply: '…머슴 주제에, 말은 곧잘 하는구나.' },
      { text: '제가 감히 어찌 알겠습니까.', score: 5, reply: '그래, 모르는 게 낫겠지.' },
    ] },
    { scene: '마님이 비어 있는 옆자리를 손끝으로 두드린다.', line: '이리 가까이 와 앉거라. 문은 닫고.', choices: [
      { text: '(문을 닫고 조심스레 곁에 앉는다)', score: 20, reply: '떨고 있구나. 내가 무서우냐?' },
      { text: '마님, 남들 눈이 있습니다…', score: 10, reply: '그러니 문을 닫으라 하지 않았느냐.' },
      { text: '(문 앞에 그대로 서 있는다)', score: -5, reply: '고지식하기는. …도련님이 너를 따르는 이유를 알겠다.' },
    ] },
    { line: '어젯밤 일은 너와 나만 아는 일이다. 입이 무거우냐?', choices: [
      { text: '도련님께도 말씀 안 드리겠습니다.', score: 10, reply: '도련님 얘기는 꺼내지 마라. …지금은.' },
      { text: '그럼 저한테는 무엇을 주시렵니까?', score: 15, reply: '호오… 머슴 주제에 흥정을 해? 마음에 드는구나.' },
      { text: '무덤까지 가져가겠습니다.', score: 20, reply: '그 말, 잊지 말거라.' },
    ] },
    { scene: '마님이 일어서며 낮게 속삭인다.', line: '오늘 밤, 사람들이 다 잠들면… 안채로 오너라.', choices: [
      { text: '도련님께 들키면 어쩌시려고요.', score: -5, reply: '…그렇구나. 겁이 많은 아이였어.' },
      { text: '제가… 가도 되는 겁니까?', score: 10, reply: '내가 부르지 않았느냐. 두 번 말하게 하지 마라.' },
      { text: '예, 마님. 반드시 가겠습니다.', score: 20, reply: '기다리마. 늦으면 문을 잠글 것이다.' },
    ] },
  ],
  endings: [
    { min: 85, title: '💗 마님의 밤 손님', text: '그날 밤, 안채 문은 잠기지 않았다.', image: `${MADAM}/d180-20.jpg` },
    { min: 50, title: '🌙 마님의 눈에 든 머슴', text: '마님이 가끔 너를 부른다. 아직은 심부름뿐이지만.', image: `${MADAM}/sit-04.jpg` },
    { min: -100, title: '🚪 문밖의 머슴', text: '마님 방 문은 다시 열리지 않았다.', image: `${MADAM}/sit-02.jpg` },
  ],
}]

export const gameOf = (key: string) => GAMES.find(g => g.key === key) ?? null
export const endingOf = (game: PlayGame, score: number): PlayEnding => game.endings.find(e => score >= e.min) ?? game.endings.at(-1)!
