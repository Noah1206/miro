/**
 * 11/19 사용자: 남성향 공식 작품마다 상태창(크랙 INFO 식) — 위에 장면(날짜·시각·장소·날씨·내 복장), 아래에 인물마다 한 줄.
 * 대괄호 안은 AI 가 매 턴 실제 값으로 바꾼다. 수치는 직전 상태창에서 이어진다(snapshot lastStatus).
 * 노골적인 수치(신체 반응 등)는 넣지 않는다 — 언베일을 끈 방·14세 이상 사용자에게도 같은 상태창이 보인다.
 * 시드(seed-bl-characters.mts)가 데이터 파일의 statusFormat 이 없을 때 이 표를 쓴다.
 */
const lines = (...l: string[]) => l.join('\n')

const DAY = '📅[날짜·요일]'
const TIME = '⌚[시각]'
const PLACE = '🚩[장소]'
const WEATHER = '🌡[기온·날씨]'
const ME = '👕[내 복장]'
const MODERN = [DAY, TIME, PLACE, WEATHER, ME]

/** 인물 한 줄 — 호감(-100~100), 설렘(0~100), 복장, 위치·자세. */
const her = (name: string) => `${name}|❤[호감]|💓[설렘]|👚[복장]|🧭[위치·자세]`
/** 1:1 — 인물 줄 + 속마음 한 줄. */
const solo = (name: string, ...extra: string[]) => [her(name), ...extra, `💭[${name === '[그녀]' ? '그녀' : name}의 속마음 한 줄]`]
/** 다인 — 등장한 인물만(인원이 많은 작품). */
const present = '[이번 장면에 나온 히로인마다 한 줄: 이름]|❤[호감]|👚[복장]|🧭[위치]'

/** 미로 안 시설의 직원들(앱 의인화) — 미로 시각·방 + 그 직원의 장부 하나. */
const miroStaff = (name: string, room: string, gauge: string) => lines('🕯[미로 시각]', `🚩${room}`, gauge, ...solo(name))

export const STATUS_FORMATS: Record<string, string> = {
  'official-m-academy-extra': lines(DAY, TIME, '🚩[아카데미 안 장소]', '🏅[내 순위]/300|📖[원작 기준 사망 플래그까지 남은 날]', ...['루시엔', '세라핀', '카렌', '이졸데'].map(her)),
  'official-m-apocalypse-bully': lines('📅[멸망 D+일수]', TIME, PLACE, WEATHER, '🎒[식량·물·무기]', ...solo('오수아', '🍞[오수아 허기 0~100]')),
  'official-m-arden': lines('📅[대륙력 날짜]', TIME, '🚩[대륙·지역·장소]', WEATHER, '⭐[내 클래스]|Lv[레벨]|❤️‍🩹[HP]|💰[골드]', '🎒[소지품]', present),
  'official-m-artisan': miroStaff('하진', '[공방 안 위치]', '🧸[지금 빚는 인형]'),
  // 11/22 G 묶음: 동양 판타지 — 청련력·시진, 즉위식까지 남은 날, 백연의 호감 + 신심(마음이 기울수록 흔들림).
  'official-m-fallen-shrine': lines('📅[청련력 날짜]', '⌚[시진]', '🚩[신전 안 장소]', WEATHER, '👕[내 복장]', '👑[흑요 즉위식 D-일수]', ...solo('백연', '🙏신심 [0~100]')),
  // 11/22 G 묶음: 니 엄마 잘먹겠습니다(친구 엄마) — 남편 귀국(추석)까지 남은 날, 미경 한 줄, 남편 의심도·준서 눈치.
  'official-m-boarding-wife': lines(...MODERN, '🏠[남편 귀국(추석) D-일수]', ...solo('윤미경', '📱남편 의심도 [0~100] · 👀준서 눈치 [0~100]')),
  'official-m-baby-contract': lines(DAY, TIME, '🚩[집 안 장소]', WEATHER, ME, '🚪[아들 귀가까지 남은 시간]', ...solo('[며느리 이름]')),
  'official-m-baek-jiyoon': lines(...MODERN, '🏢[회사에서의 관계]', ...solo('백지윤')),
  'official-m-bell': miroStaff('린', '[종탑 안 위치]', '🔔[오늘 울린 종 횟수]'),
  'official-m-brat-senior': lines(...MODERN, '📸[사진의 행방]', ...solo('[그녀 이름]', '⚖️[주도권: 나 / 그녀]')),
  'official-m-bully-bj': lines(...MODERN, '🦋[나비 정체를 아는지: 모름/의심/확신]', ...solo('백예린')),
  'official-m-cartographer': miroStaff('하랑', '[지도실 안 위치]', '🗺[지금 그리는 길]'),
  'official-m-cheonma-reborn': lines('📅[무림력 날짜]', '⌚[시진]', '🚩[지역·장소]', WEATHER, '☯[회복한 내공 단계]|⚔[지금 쓰는 무공]', present),
  'official-m-clock': miroStaff('로아', '[시계탑 안 위치]', '🔁[지금 회차]'),
  'official-m-club-senior': lines(...MODERN, '🛍[쇼핑백의 행방]', ...solo('한서윤')),
  'official-m-council': lines(...MODERN, '📋[지금 맡은 학생회 일]', ...solo('윤세라')),
  'official-m-crush-roommate': lines(...MODERN, '🏠[동거 D+일수]', ...solo('[소꿉친구 이름]')),
  'official-m-dawn-call': lines('📅[불시착 D+일수]', TIME, '🚩[섬 안 장소]', WEATHER, '🎒[식량·물·도구]', '📜[진행 중인 퀘스트와 단계]', ...['강세나', '유하리', '오지수', '한예린', '서송은'].map(her)),
  'official-m-elevator-senior': lines(DAY, TIME, '🚩[엘리베이터 / 장소]', '🔧[구조까지 상황]', ME, ...solo('강지수')),
  'official-m-exchange': miroStaff('다온', '[환전소 안 위치]', '🧾[내 외상 장부]'),
  'official-m-fairies': lines(TIME, '🚩[장소]', '📱[안 읽은 알림 수]', present),
  'official-m-friend-unsubscribe': lines(...MODERN, '📒[이번 주 과외 일정]', present),
  'official-m-frustrated-madam': lines('📅[날짜·절기]', '⌚[시진]', '🚩[저택 안 장소]', WEATHER, '👘[내 차림]', '🕯[들킬 위험: 낮음/보통/높음]', ...solo('마님')),
  'official-m-gumiho-partner': lines(...MODERN, '🦊[꼬리 수·변신 상태]', ...solo('백서하')),
  'official-m-han-doeun': lines(...MODERN, '📄[전세 계약 분쟁 상황]', ...solo('한도은')),
  'official-m-han-yujin': lines(...MODERN, '🛏[우진이 상태]', ...solo('한유진')),
  'official-m-hero-party': lines(...MODERN, '📱[휴대폰 상태]', ...['한서진', '오유리', '차민아', '윤하은', '정다은'].map(her)),
  'official-m-hunter-guild': lines(DAY, TIME, PLACE, '🎖[내 등급·클래스]|Lv[레벨]|❤️‍🩹[HP]|💰[골드]', '📜[진행 중인 퀘스트]', present),
  'official-m-idol-girlfriend': lines(...MODERN, '🎤[다음 스케줄]|👀[들킬 위험]', ...solo('서하린')),
  'official-m-inner-senior': lines(...MODERN, ...solo('한서리', '🗣[겉으로 한 말 한 줄]')),
  'official-m-jeong-seoyun': lines(DAY, TIME, '🚩[캠퍼스 안 장소]', ME, '📚[지금 수업·과제]', present),
  'official-m-lea': lines(...MODERN, '🏋[오늘 PT 일정]', ...['레아', '한소윤', '강서진', '윤재희', '최혜원'].map(her)),
  'official-m-librarian': miroStaff('서하', '[도서관 안 위치]', '📖[지금 펼친 책]'),
  'official-m-living-doll': lines(...MODERN, ...solo('시아')),
  'official-m-massage-club': lines(...MODERN, '🧴[오늘 실습 단계]', ...['서하린', '오지수', '백서윤', '민채아', '강다인', '박혜원'].map(her)),
  'official-m-miro': miroStaff('미로', '[회랑 안 위치]', '🏮[랜턴 불빛]'),
  'official-m-moon-app': lines(...MODERN, '🌙[앱에서 확보한 단서]', present),
  'official-m-mother-daughter': lines('📅[무림력 날짜]', '⌚[시진]', '🚩[세가 안 장소]', WEATHER, '🏯[백리세가 형편]', ...['백리연화', '백리설'].map(her)),
  'official-m-novelist': miroStaff('지유', '[집필실 안 위치]', '📖[연재 중인 화수·제목]'),
  'official-m-only-me': lines(...MODERN, ...solo('이소연')),
  'official-m-others-gf': lines(...MODERN, '📦[오나홀의 행방]', ...solo('[과 퀸카 이름]')),
  'official-m-painter': miroStaff('채이', '[화실 안 위치]', '🎨[지금 그리는 그림]'),
  'official-m-pet-seniors': lines(...MODERN, '⚖️[예전 관계 → 지금 관계]', present),
  'official-m-reverse-world': lines(...MODERN, present),
  'official-m-rogue-noble': lines('📅[왕국력 날짜]', TIME, '🚩[성 안 장소]', WEATHER, '⛓[내 신분]', ...solo('세실리아')),
  'official-m-ryu-hagyeong': lines(...MODERN, '💍[계약 결혼 D-일수]', ...solo('류하경')),
  'official-m-seo-rin': lines(...MODERN, '🚪[남편 귀가까지 남은 시간]', ...solo('서린')),
  'official-m-ski-resort': lines('📅[여행 일차]/3', TIME, '🚩[리조트 안 장소]', WEATHER, ME, ...['민소은', '윤지혜'].map(her)),
  'official-m-stepmom-friends': lines(...MODERN, ...['한유라', '서혜원', '강수진', '오정란'].map(her)),
  'official-m-store-girl': lines(...MODERN, '🛒[오늘 산 것]', ...solo('정유리')),
  'official-m-stray-cat': lines(...MODERN, '🐾[고양이 / 사람 모습]', ...solo('나비')),
  'official-m-tailor': miroStaff('수아', '[의상실 안 위치]', '🧵[지금 짓는 옷]'),
  'official-m-veil': miroStaff('가린', '[심사실 안 위치]', '📝[심사 결과·도장 수]'),
  'official-m-wall-friend': lines(...MODERN, '🕳[벽 구멍 상태]', ...solo('예슬')),
  'official-m-yoon-seoa': lines(...MODERN, '⏳[계약 종료(자정)까지 남은 시간]', ...solo('윤서아')),
}
