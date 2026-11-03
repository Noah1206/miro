/**
 * 남성향 12명의 화면용 소개(11/3 사용자: "유저가 보는 글은 '그래서 무슨 상황이야?'가 안 느껴지게 — 베이비챗·위프처럼").
 * 상세 화면에 보이는 personality 는 이 짧은 소개로 바꾸고, 원래의 긴 소개는 비공개 설정(secret) 맨 앞 [상세 설정] 으로 옮긴다 — AI 는 그대로 다 읽는다.
 */
/** 상세정보(11/3, 베이비챗식 수치) — 키는 데이터 파일 visual 에서 읽는다. who 는 여러 인물 카드의 대표 히로인. */
export const MALE_BODY: Record<string, { kg: number; b: number; w: number; h: number; cup: string; who?: string }> = {
  'official-m-han-doeun': { kg: 52, b: 92, w: 59, h: 91, cup: 'F' },
  'official-m-yoon-seoa': { kg: 53, b: 96, w: 58, h: 94, cup: 'G' },
  'official-m-baek-jiyoon': { kg: 56, b: 104, w: 62, h: 98, cup: 'I' },
  'official-m-seo-rin': { kg: 50, b: 98, w: 57, h: 93, cup: 'H' },
  'official-m-lea': { kg: 52, b: 88, w: 56, h: 90, cup: 'E' },
  'official-m-ryu-hagyeong': { kg: 57, b: 102, w: 61, h: 97, cup: 'H' },
  'official-m-han-yujin': { kg: 51, b: 95, w: 58, h: 92, cup: 'G' },
  'official-m-jeong-seoyun': { kg: 50, b: 97, w: 58, h: 93, cup: 'G' },
  'official-m-dawn-call': { kg: 53, b: 106, w: 62, h: 99, cup: 'J' },
  'official-m-friend-unsubscribe': { kg: 54, b: 100, w: 60, h: 96, cup: 'H' },
  'official-m-hunter-guild': { kg: 55, b: 94, w: 58, h: 95, cup: 'G', who: '백설하' },
  'official-m-hero-party': { kg: 56, b: 112, w: 63, h: 101, cup: 'K', who: '세레나' },
}

export const MALE_PUBLIC: Record<string, string> = {
  'official-m-han-doeun': `전세 사기로 같은 집을 계약한 여자, 한도은.
소송이 끝날 때까지 90일, 둘 다 이 집을 나갈 수 없다.

"제 명의예요. 소파는 그쪽이 쓰시죠."`,
  'official-m-yoon-seoa': `전 남친 결혼식에 데려갈 남자를 하루 고용한 승무원, 윤서아.
계약은 오늘 자정까지. 그때까지 당신은 그녀의 완벽한 남자친구다.

"웃어요. 나 지금 엄청 행복한 여자니까."`,
  'official-m-baek-jiyoon': `회사에서 제일 무서운 사람, 백지윤 팀장.
폭우로 차가 끊긴 밤, 그녀가 당신 집 현관에 서 있다.

"…한 시간만. 그리고 내일 회사에선 모르는 척해."`,
  'official-m-seo-rin': `결혼정보회사가 소개한 완벽한 그녀, 서린.
첫 만남에 사기꾼인 걸 알아버렸다. 그런데 그녀가 거래를 제안한다.

"들켰네? 그럼 신고 대신, 나랑 한 달만 사귀어요."`,
  'official-m-lea': `당신을 죽이러 온 암살자, 레아.
의뢰인에게 버림받은 그녀가 이제 30일 동안 당신을 지킨다.

"…왜 소리 안 질러."`,
  'official-m-ryu-hagyeong': `조직 보스의 딸, 류하경.
후계 싸움에서 살아남으려면 한 달 동안 남편이 필요하다. 그 남편이 당신이다.

"사랑은 필요 없어. 한 달만 내 편이면 돼."`,
  'official-m-han-yujin': `3년 전 당신을 버린 전 여친, 한유진.
그녀가 오늘 당신의 면접관이다.

"…자기소개는 생략해도 되겠네요. 제가 제일 잘 아니까."`,
  'official-m-jeong-seoyun': `3년째 사귀는 당신의 여자친구, 정서윤.
요즘 그녀 팀 선배가 노골적으로 다가온다. 지킬 것인가, 흔들리는 걸 볼 것인가.

"선배는 그냥 선배야. …진짜야."`,
  'official-m-dawn-call': `남친 있는 그녀, 윤채원.
5년 연애에 지친 그녀가 새벽마다 당신에게만 전화를 건다.

"자? …안 자면, 잠깐만 얘기해 줘."`,
  'official-m-friend-unsubscribe': `10년 지기 여사친, 오하람.
그녀가 다른 남자와 사귄다고 말했다. 붙잡을 시간은 얼마 남지 않았다.

"나 남친 생겼어. …축하해 줄 거지?"`,
  'official-m-hunter-guild': `무너진 서울, 당신은 망해 가는 헌터 길드의 길드장.
S급 검사 백설하를 비롯해 사연 많은 헌터 여섯 명이 당신 길드의 문을 두드린다.

"계약금 1원. 대신 날 버리지 마."`,
  'official-m-hero-party': `이세계에 소환된 용사, 당신.
성녀 세레나를 비롯한 여섯 동료와 마왕을 쓰러뜨리는 여정이 시작된다.

"용사님… 정말 와 주셨군요."`,
}
