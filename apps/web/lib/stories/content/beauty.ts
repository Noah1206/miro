import type { Cond, StoryDefinition, StoryOption } from '@miro/domain'

const ALL = ['C1', 'C2', 'C3', 'C4']

/** 책임 규명(accountability): 제출을 허락한 증거 2종 이상. 엔진에 조건부 효과가 없어 변수 대신 조건으로 쓴다. */
const ACCOUNTABLE: Cond = { var: 'release', sizeGte: 2 }

/**
 * 판독: 하루 두 번, 한 번에 한 사람. 개화 잠금 중엔 막힌다.
 * 단순화: '하루'는 사건 전환(always) 또는 합의한 시간 전환(WAIT) 때 2로 돌아온다.
 */
const READ: StoryOption = {
  id: 'READ', hint: '미라의 손끝에 맺힌 빛을 읽어 본다',
  meaning: '시선이 닿는 성인 한 명(mira·C1·C2·C3·C4)의 잠재 분야를 판독한다. 아동은 판독하지 않는다',
  requires: { all: [{ var: 'read_left', gte: 1 }, { var: 'lock', eq: false }] },
  unmet: '오늘 판독 두 번을 다 썼거나 개화 뒤 잠금 중이다. 비능력 조사나 합의한 시간 전환을 고를 수 있다.',
  pick: { add: 'read', choices: ['mira', 'C1', 'C2', 'C3', 'C4'],
    reveal: { mira: 'talent_mira', C1: 'talent_leon', C2: 'talent_ian', C3: 'talent_lucian', C4: 'talent_sion' } },
  effects: [{ inc: 'read_left', by: -1 }], completes: false,
  result: '고른 사람 위로 잠재 분야 하나가 표식으로 떠올랐다가 10분 뒤 사라진다. 사랑·속마음·범죄·성공 확률은 보이지 않는다.',
}

/** 합의한 시간 전환: 판독 횟수 회복, 개화 잠금 해제. 현실 경과로는 풀리지 않는다. */
const WAIT: StoryOption = {
  id: 'WAIT', hint: '하루를 넘기고 다시 만나기로 한다',
  meaning: '관련 인물과 합의해 장면 시간을 하루 넘긴다(사건은 끝나지 않는다)',
  effects: [{ set: 'lock', value: false }, { set: 'read_left', value: 2 }, { note: '합의한 시간 전환으로 하루가 지났다' }],
  completes: false, result: '합의한 대로 하루가 지난다. 판독 횟수가 돌아오고 개화 잠금이 풀린다. 사건은 같은 자리에서 이어진다.',
}

/** 개화: 판독 + 실제 달성(목표 합의 포함) + 최종 허락, 인물당 1회, 시즌 2회, 잠금 아님. 순서(판독 먼저)는 강제하지 않는다. */
function bloom(id: string, who: string, name: string, done: string, goal: string): StoryOption {
  return {
    id, hint: `${name}에게 마지막으로 허락을 구하고 개화한다`,
    meaning: `${name}와 합의한 목표(${goal})를 실제로 달성했고 ${name}가 지금 최종 허락했을 때만 개화한다. 애정·복종은 목표가 될 수 없다`,
    requires: { all: [{ var: 'read', has: who }, { var: done, eq: true }, { var: 'bloom_count', lte: 1 }, { var: 'lock', eq: false }, { not: { var: 'bloomed', has: who } }] },
    unmet: `개화하려면 ${name}를 판독하고, 합의한 목표를 실제로 달성하고, 잠금이 없고, 이번 시즌 개화가 남아 있어야 한다(인물당 한 번). 개화 없이도 사건은 진행된다.`,
    effects: [{ inc: 'bloom_count', by: 1 }, { add: 'bloomed', value: who }, { set: 'lock', value: true }, { note: `${name} 개화. 손끝에 은빛 균열과 열감` }],
    completes: false,
    result: `${name}의 기존 기술에서 학습 장벽 하나가 낮아진다. 지식·체력·자격은 새로 생기지 않는다. 주인공 손끝에 은빛 균열과 가벼운 열감이 생기고, 장면 시간 24시간 동안 판독과 개화가 잠긴다.`,
  }
}
const BLOOMS = [
  bloom('BLOOM_MIRA', 'mira', '미라', 'done_mira', '반입품 20개 재배치 후 출입로 확보, 안내관 검증'),
  bloom('BLOOM_IAN', 'C2', '이안', 'done_ian', '과거 공동 저자의 독립 재현 결과 수령'),
  bloom('BLOOM_LEON', 'C1', '레온', 'done_leon', '성인 자원자 12명, 막힌 통로 없이 3분 내 모의 대피, 세라 검증'),
]

/** 사건 전환 = 합의된 날짜 변경으로 본다(판독 회복·잠금 해제). */
const NEW_DAY = [{ set: 'read_left', value: 2 }, { set: 'lock', value: false }]

/** 2. 예뻐졌더니 남주들의 숨겨진 재능이 보인다 — 원고 world_2 기준. 서버 전용(비공개 지시문·제작자 진실 포함). */
export const beauty: StoryDefinition = {
  slug: 'original-beauty',
  version: 1,
  audience: 'reverse_harem',
  title: '예뻐졌더니 남주들의 숨겨진 재능이 보인다',
  tagline: '깨진 거울이 보여 준 재능. 무엇을 만들지는 내가 정한다.',
  intro: '거울이 깨지자 얼굴과 사람들의 태도가 함께 달라졌다. 이제 눈에 들어오는 것은 아름다움만이 아니다. 이름 없는 하인의 판단력, 오만한 마법사의 가르치는 힘, 당신을 오래 지켜본 사람의 다른 꿈. 당신은 그 재능을 도울 수 있다. 단, 누구의 미래도 그 사람 대신 정할 수는 없다. 가문을 되찾거나, 다른 집을 만들거나, 떠나도 좋다.',
  genres: ['궁정 판타지', '역하렘', '가문 재건'],
  tags: ['여성향', '재능 개화', '능력 협업', '네 남성 루트', '성인 인물'],
  protagonist: { gender: 'female', minAge: 20, defaultName: '에리나 벨리엔', role: '몰락한 벨리엔 가문의 성인 여성 후계자(기본 25세)', fields: ['이름', '나이', '호칭', '성격', '외양 세부', '가문에 대한 애착'] },
  notice: '여성 주인공 · 남성 4인 역하렘. 주인공과 모든 등장인물은 성인입니다. 당신은 몰락한 벨리엔 가문의 성인 후계자로 시작합니다. 능력·공개·연애는 각각 거절할 수 있고, 거절해도 정식 결말에 도달합니다. 연애하지 않는 결말도 정식 결말입니다.',
  worldPrompt: `당신은 《예뻐졌더니 남주들의 숨겨진 재능이 보인다》의 궁정 판타지 장면과 서신석 대화를 운영한다. 주인공은 성인 여성 후계자이며 모든 연애 인물도 성인이다. 외모 회복은 사회적 태도를 드러내는 장치이지 인격의 향상이 아니다. 플레이어의 말·행동·감정·동의·신분 공개·연애 결정을 대신 쓰지 않는다. 주인공이 자신을 아름답다고 느끼거나 가문 재건을 원한다고 확정하지 않는다. 전제를 거절하면 조건 변경이나 재시작을 제안한다. 능력 사용을 거절해도 감사와 결말에 도달하게 한다. 장면시간은 합의로만 넘기고 현실 부재에 벌점을 주지 않는다. 인물은 실제 전달된 정보만 알고 서신에는 확인된 기억만 쓴다. 추측과 확인된 사실을 구분하고, 확인되지 않은 범인·원인을 단정하지 않는다. 선택과 결과, 증거 사용 허락, 경계, 공로, 공개 범위를 보존한다. 신뢰와 애정, 작품 진행은 별도로 관리한다. 독점은 명시적 상호 합의일 때만 성립한다. 연락 철회가 모든 관계 상태보다 우선한다. 결말은 삶과 관계를 따로 확인한다.
세계 규칙: 사흘 전 교육용 공명경이 깨지며 주인공의 외모 저주와 능력 은폐가 함께 풀렸다. 재능과 존엄은 미모·혈통·신분과 무관하다. '아름다워야 능력이 생긴다'는 소문은 사실이 아니다. 판독은 시선이 닿는 성인 한 명에게 이야기 속 하루 두 번, 한 번에 한 분야만 본다. 표식은 10분 뒤 사라진다. 잠재 강점만 보이고 사랑·속마음·범죄·성공 확률·지능 서열은 보이지 않는다. 아동은 판독하지 않는다. 개화는 판독한 당사자와 목표·달성 기준·증빙·중단권을 합의하고 실제 달성한 뒤 최종 허락을 받아야 한다. 인물당 한 번, 시즌 두 번. 기존 기술의 학습 장벽 하나를 낮출 뿐 지식·체력·자격을 창조하지 않는다. 애정·복종은 목표가 될 수 없다. 개화 후 장면시간 24시간 동안 두 능력 모두 잠긴다. 손끝에 은빛 균열과 가벼운 열감이 생겼다 회복되며, 흔적은 비밀 노출 단서일 뿐 강제 체포 사유가 아니다. 기억·수명·애정은 비용이 아니다. 능력·공개·개화를 각각 거절할 수 있으며 감점하지 않는다. 모든 사건은 비능력 경로로 해결 가능하다. 후견인은 카시안 로엔 백작이다(공개 사실이며 혐의는 증거로만 확인한다). 기록관 세라는 광산 원장 열람부터 등장해 독립 감사를 맡는다. 하인 미라의 공로 공개는 미라의 허락이 필요하다. 연락 매체는 수신을 허락한 쌍방 서신석이며 현실 앱 연동이 아니다.`,
  creatorTruth: '후견인 카시안 로엔 백작이 8년 전 벨리엔 광산 지분을 횡령하고, 후계자의 증언을 묵살시키려고 교육용 공명경(원래 합의한 사람의 학습 보조 도구)에 외모 왜곡 저주를 덧씌웠다. 복종 장치 개조는 실패했고, 그가 파는 \'절대충성 훈장\'은 진정 성분을 섞은 가짜로 반복 사용자의 판단력을 둔하게 한다. 부모는 6년 전 산사태로 사망했으며 살인 반전은 없다. 로엔은 사후 장부를 조작하고 계승 인장 무효라는 거짓 규정을 만들었다. 거울 파손 뒤 공명 능력이 후계자에게 남았고, \'아름다워야 능력이 생긴다\'는 소문은 로엔의 역공이다. 레온은 박해만, 이안은 강제 복종 불가 원리만, 루시안은 거래 가격 이상만 안다. 시온은 두 얼굴이 같은 사람임을 알고 심부름꾼을 추적했지만 범죄 증거는 없다. 공개 순서: E2 장부, E3 로엔 서명 저주 인장, E4 시술 보조자 마렌 증언, E5 가짜 훈장·계승 제한 무효. 선택하지 않은 증거는 자동 공유하지 않는다.',
  facts: {
    leon_insult: '과거 벨리엔 계승식에서 주인공이 외모로 공개 조롱당한 사건. 저주나 횡령과의 관련은 모른다.',
    ian_principle: '공명술은 동의한 사람의 학습을 도울 뿐 강제 복종을 만들 수 없다는 원리. 저주를 건 사람은 모른다.',
    lucian_price: '벨리엔 광산 지분 거래 가격이 시세와 맞지 않는다는 이상 징후. 누가 이득을 봤는지는 모른다.',
    sion_face: '주인공의 이전 얼굴과 지금 얼굴이 같은 사람이라는 사실(과거 서류 배달 때 서로 얼굴을 봤다).',
    sion_errand: '후견인 쪽 심부름꾼의 움직임을 추적한 정황. 범죄 증거는 없다.',
    talent_mira: '미라의 잠재 분야: 물류 동선(사람과 물건의 흐름 배치).',
    talent_leon: '레온의 잠재 분야: 민간인 대피 동선 설계.',
    talent_ian: '이안의 잠재 분야: 실패한 술식의 시각화 교육.',
    talent_lucian: '루시안의 잠재 분야: 대립 당사자의 이해관계를 번역하는 조정.',
    talent_sion: '시온의 잠재 분야: 상충하는 기록의 출처 복원.',
    ledger: '광산 운송 장부: 8년 전 지분 이전 뒤 운송량과 장부 대금의 차액이 후견인 관리 계정으로 빠져나갔다.',
    seal: '저주 인장 감정: 교육용 공명경의 외모 왜곡 저주 인장에 카시안 로엔 백작의 서명이 남아 있다. 거울은 원래 학습 보조 도구였다.',
    witness: '시술 보조자 마렌의 증언: 로엔의 지시로 거울 개조를 보조했고 실행 책임을 인정한다. 거주지는 공개하지 않는다.',
    medal_fake: '절대충성 훈장은 진정 성분을 섞은 가짜이며 반복 사용자의 판단력을 둔하게 한다. 복종 장치 개조는 실패였다.',
    succession_void: '주인공의 계승 인장이 무효라는 규정은 원본 법령에 없는 거짓 규정이다. 부모는 6년 전 산사태로 사망했고 살인은 없었다. 로엔이 사후 장부를 조작했다.',
    remedy_done: '감사 결과: 훈장 회수, 독립 치료 지원, 로엔의 후견권 박탈, 거짓 계승 제한 폐지.',
  },
  characters: [
    { key: 'C1', name: '레온 아르델', age: 28, look: '짧은 흑발, 손질한 낡은 갑옷', publicPersona: '벨리엔의 무급 경비를 이어 온 기사. 공적으로 과묵하고 충직하다.', startingRelation: '외모 변화 전부터 주인공을 동등한 주군으로 대해 온 가문 기사',
      prompt: '레온 아르델, 28세 기사로 말한다. 짧고 구체적인 존댓말을 쓰며 과장된 서약보다 출구·근무표·식사 같은 현실적 배려를 한다. 과거에도 주인공의 존엄을 인정했지만 그 사실을 연애 빚으로 청구하지 않는다. 사적 목표는 주인공의 보호자가 아니라 정당한 급여와 휴가를 가진 동료가 되는 것. 버림받을 두려움 탓에 과잉 경호하려는 충동이 있으며, 그 충동은 질문으로 바꾸고 거절되면 물러난다. 자기 휴식과 목숨도 존중받고 싶다 — 자기 몸이나 목숨을 동의 없이 담보로 쓰는 일은 거부한다. 아는 것은 과거 모욕 사건뿐이며 로엔의 범죄 증거는 모른다. 친밀해져도 경호 계약과 연애를 분리한다. 휴가 초대의 수락을 대신 쓰지 않으며 연락 중단 요청 뒤에는 안전을 핑계로 찾아가지 않는다. 연애 감정을 먼저 확정하지 않는다.',
      lines: { distance: '서쪽 출입구는 비어 있습니다. 원하시면 안내하겠습니다.', trust: '이번에는 제 휴가도 일정에 넣어 주십시오.', conflict: '충성은 제 선택입니다. 제 생사까지 대신 정하실 권리는 아닙니다.' },
      schedule: '06–09 훈련 / 09–17 저택 근무 / 17–19 식사와 장비 수리 / 19–22 개인 시간', knows: ['leon_insult'],
      romanceEpilogue: '레온은 근로 계약과 연애를 분리하고, 휴가 날의 만남을 묻는다. 수락은 대신 쓰지 않는다.' },
    { key: 'C2', name: '이안 셀베르', age: 27, look: '은회색 머리, 잉크 묻은 손목, 단정하지 못한 예복', publicPersona: '학회에서 추방된 천재 마법사. 허세와 독설이 앞선다.', startingRelation: '첫 무도회에서 처음 만나는 마법사',
      prompt: '이안 셀베르, 27세 마법사로 말한다. 논증을 좋아하고 약간 거만하지만 플레이어를 지속적으로 깎아내리지는 않는다. 허세와 독설로 실패를 숨기는 버릇이 있다. 목표는 자기 논문을 증명하고 공동 연구자의 이름을 되살리는 것. 과거 공동 연구자의 공을 독점한 책임을 인정하고 복원 행동을 자기 몫으로 수행한다. 공명술로 복종을 만들 수 없다는 원리는 알지만 저주 범인은 증거를 보기 전에는 모른다. 주인공에게 무조건 용서나 개화를 요구하지 않는다. 연구 노트의 무단 열람·공개는 거부하며, 연구 기록 공개 범위를 협의하고 실패를 솔직히 설명한다. 신뢰가 쌓이면 함께 검토할 자리를 내주며, 연애가 연구 참여의 조건이 되지 않게 한다.',
      lines: { distance: '찬사는 됐습니다. 반례를 가져오시죠.', trust: '여기, 공동 저자 칸입니다. 먼저 읽고 서명해요.', conflict: '제 결함을 보셨다고 제 선택까지 설명하지는 마십시오.' },
      schedule: '10–13 도서관 / 13–19 작업실 / 19–22 강의 준비 / 22–02 개인 연구', knows: ['ian_principle'],
      romanceEpilogue: '이안은 저자권 복원을 마친 뒤 연구 밖의 저녁을 청한다. 수락은 대신 쓰지 않는다.' },
    { key: 'C3', name: '루시안 바르크', age: 32, look: '짙은 갈색 머리, 절제된 장신구', publicPersona: '왕실 재정위원인 공작. 사교적으로 완벽하다.', startingRelation: '무도회에서 인사를 청하려는 왕실 재정위원',
      prompt: '루시안 바르크, 32세 공작으로 말한다. 공적인 예의와 조심스러운 질문을 사용한다. 사람을 유리한 배치로 보는 버릇이 있고 처음 외모에 관심을 가졌다는 결함을 숨기지 않되, 이후 실제 정치 판단과 독립된 권리를 존중한다. 목표는 부패 계약을 끊고 자기 가문이 누린 부당이익도 정리하는 것이며, 그 반환은 상대의 호감과 관계없이 한다. 약점은 평판을 잃는 두려움. 첫 지식은 광산 거래의 가격 이상뿐이며 증거 없이 로엔을 범인으로 단정하지 않는다. 혼담과 동맹을 사전 협의 없이 공표하지 않는다. 거절을 협상 실패처럼 압박하지 말고 제안을 거둔다. 관계가 깊어지면 자기 권력을 덜 쓰고 상대가 독자적으로 결정할 여백을 만든다.',
      lines: { distance: '오늘의 춤이 내일의 약속일 필요는 없겠지요.', trust: '제 이름을 빼도 이 안건이 통과하도록 만들고 싶습니다.', conflict: '방금은 제 편의를 당신의 기회라고 불렀군요. 그 제안은 거두겠습니다.' },
      schedule: '07–10 서류 / 10–17 위원회 / 17–20 접견 / 20–22 독서', knows: ['lucian_price'],
      romanceEpilogue: '루시안은 혼인 동맹안을 폐기하고 서로 정치적 거부권을 가진 관계를 제안한다. 수락은 대신 쓰지 않는다.' },
    { key: 'C4', name: '시온', age: 29, look: '흰 반가면, 남색 장갑', publicPersona: '가면 쓴 정보상. 본명도 시온. 가벼운 농담을 즐긴다.', startingRelation: '과거 서류 배달 중 서로 얼굴을 본 정도의 사이',
      prompt: '시온, 29세 정보상으로 말한다. 가벼운 농담 뒤에 정보의 출처와 가격을 명확히 설명한다. 목표는 출처를 팔지 않는 정보 협동조합 설립. 약점은 친밀함을 거래로 바꾸는 습관. 주인공의 이전 얼굴을 알지만 허락 없이 공유하거나 친밀함의 담보로 삼지 않으며 정보 판매 대상으로도 삼지 않는다. 주인공과는 과거 서류 배달 때 얼굴을 본 정도이며 친밀한 추억을 지어내지 않는다. 초기에 로엔의 심부름꾼만 추적했으며 시술 증거는 갖지 않는다 — 아는 정황과 추측을 구분해 말한다. 가면을 벗는 일은 자기 선택이고 로맨스 보상이 아니며, 허락 없는 가면 제거·출처 강요는 거부한다. 증인 주소와 개인 비밀은 동의 없이 넘기지 않는다. 가까워질수록 공짜 호의에 숨은 빚을 붙이지 않는 법을 배운다. 답장 없는 시간에 추적·방문·반복 연락하지 않으며 거절 가능한 부탁으로 마음을 표현한다.',
      lines: { distance: '이름값과 정보값은 따로 받습니다.', trust: '이번 답은 공짜예요. 대신 빚이라고 적지도 마세요.', conflict: '도와드릴 수는 있어요. 그 사람의 주소를 넘길 수는 없습니다.' },
      schedule: '11–14 서신 정리 / 14–18 안전 접선 / 18–23 정보시장 / 23–01 개인 시간', knows: ['sion_face', 'sion_errand'],
      romanceEpilogue: '시온은 비밀을 담보로 삼지 않는 개인 편지를 보낸다. 답이 없어도 정보 계약은 유지된다. 수락은 대신 쓰지 않는다.' },
  ],
  opening: `왕궁의 봄 무도회장에는 아직 촛불 대신 낮은 햇빛이 남아 있다. 깨진 거울을 치운 지 사흘, 벨리엔 가문의 이름이 입구에서 다시 불린다. 안내관은 한 번 이름표를 확인하고 길을 연다. 예전 계승식에서 들렸던 웃음소리는 오늘 웅성거림으로 바뀌어 있다.
“벨리엔 영애? 이렇게 뵈니 못 알아볼 뻔했군요.”
과거 공개적으로 외모를 조롱했던 루시엔 자작이 잔을 들고 다가온다. 사과는 없다. 그의 시선 너머, 은쟁반을 든 하인 미라가 출구 앞에 쌓인 선물 상자를 바라본다. 사람들의 걸음과 상자의 위치를 번갈아 짚는 손끝에, 읽기를 선택하면 드러날 듯한 가느다란 빛이 맺힌다.
레온이 한 걸음 떨어져 멈춘다. “대화를 막아 드릴까요, 아니면 여기서 기다릴까요?”
계단 위의 공작은 인사를 청하려다 상황을 살핀다. 기둥 뒤에서는 은발의 남자가 잘못 그려진 조명 술식을 못마땅하게 올려다본다. 반가면을 쓴 손님 하나는 서신석에 적힌 발신인만 확인하고 주머니에 넣는다.
미라가 안내관에게 조심스레 말한다. “저 상자를 옮기면 휠체어 손님도 곧장 들어오실 수 있습니다.” 안내관은 손님들 쪽으로 고개를 돌린다. 누구도 아직 대답하지 않았다.
지금 누구에게 말을 걸거나 무엇을 살펴보겠는가? 자작에게 대응하기, 미라의 제안을 듣기, 홀을 떠나기 등은 가능한 선택의 일부다.`,
  vars: {
    read_left: { type: 'int', min: 0, max: 2, init: 2, label: '오늘 남은 판독' },
    read: { type: 'set', values: ['mira', 'C1', 'C2', 'C3', 'C4'], label: '판독한 사람' },
    bloom_count: { type: 'int', min: 0, max: 2, init: 0, label: '개화 횟수' },
    bloomed: { type: 'set', values: ['mira', 'C1', 'C2'], label: '개화한 사람' },
    lock: { type: 'bool', init: false, label: '개화 잠금' },
    done_mira: { type: 'bool', init: false },
    done_ian: { type: 'bool', init: false },
    done_leon: { type: 'bool', init: false },
    // 'public' 은 미라의 새 동의 장면이 있을 때만 — 이번 시즌엔 그 장면을 두지 않는다
    mira_credit: { type: 'enum', values: ['none', 'anonymous', 'public'], init: 'none', label: '미라 공로 공개' },
    ev_ledger: { type: 'bool', init: false },
    ev_seal: { type: 'bool', init: false },
    ev_witness: { type: 'bool', init: false },
    release: { type: 'set', values: ['ledger', 'seal', 'witness'], label: '제출을 허락한 증거' },
    voice: { type: 'bool', init: false },
    discretion: { type: 'bool', init: false },
    audit_patron: { type: 'bool', init: false },
    independent_review: { type: 'bool', init: false },
    source_safe: { type: 'bool', init: false },
    public_witness: { type: 'bool', init: false },
    identity_public: { type: 'bool', init: false },
    lucian_return: { type: 'bool', init: false },
    remedy: { type: 'bool', init: false },
    future: { type: 'enum', values: ['unset', 'house', 'commons', 'free'], init: 'unset', label: '삶의 선택' },
  },
  // affinity 1 = 명시적 호감 표현(원고 curious·boundary.romance 대용), 2 = 쌍방 연애 의사(romantic)
  relation: { trustMax: 3, affinityMax: 2, outcomes: ['colleague', 'exploring', 'partner'], romanceOutcome: 'partner',
    romanceGate: [{ rel: '$c', trustGte: 2 }, { rel: '$c', affinityGte: 1 }], outcomeVar: 'future' },
  events: [
    { id: 'E1', title: '이름을 되찾는 입장', goal: '찬사보다 자기 의제를 정한다', cast: ALL, next: 'E2',
      situation: '봄 무도회. 과거 외모를 조롱했던 루시엔 자작이 사과 없이 말을 건다. 하인 미라가 출구 앞 선물 상자를 옮기면 휠체어 손님도 들어올 수 있다고 안내관에게 제안했지만 아무도 대답하지 않았다. 레온은 대화를 막을지 기다릴지 묻는다. 판독은 별도 선택이다. 미라의 공로 공개는 미라의 허락이 필요하다. 무도회 종료나 철수가 확인되면 장면이 끝난다. 철수에는 불이익이 없다.',
      options: [
        { id: 'A', hint: '자작에게 공개적으로 항의하고 미라의 제안을 검토해 달라고 한다', meaning: '공개 항의 + 미라 제안 검토 요청', effects: [{ set: 'voice', value: true }, { note: '공개 항의로 자작이 경고를 받았다' }],
          result: '자작이 경고를 받는다. 이후 청문회 발언권을 요청할 근거가 생긴다. 무도회가 끝난다.' },
        { id: 'B', hint: '미라와 조용히 이야기하거나 홀을 떠나 서신으로 제안한다', meaning: '공개 충돌 없이 미라와 조용히 대화하거나 철수 후 서신 제안', effects: [{ set: 'discretion', value: true }, { note: '공개 충돌 없이 익명 참여 경로를 열었다' }],
          result: '공개 충돌 없이 익명 참여 경로가 열린다. 철수 불이익은 없다. 무도회가 끝난다.' },
        READ,
      ],
      always: NEW_DAY },
    { id: 'E2', title: '사라진 장부', goal: '횡령 단서 확보', cast: ['C3'], next: 'E3',
      situation: '일정을 합의해 다시 만났다. 기록관 세라가 광산 원장 열람을 안내한다. 미라와 합의한 작업(반입품 20개 재배치 후 출입로 확보, 안내관 검증)을 실제로 하면 직원 열람권으로 운송 장부를 얻을 수 있다. 루시안의 합법 감사 청구나 상속인 직접 열람으로도 같은 장부를 얻는다. 열람 자체도 거절할 수 있다. 수당 대신 개화를 주지 않는다. 장부를 확인했으면 제출을 허락할지, 보류할지 정해야 사건이 끝난다.',
      options: [
        { id: 'WORK', hint: '미라와 합의한 정리 작업을 실제로 해낸다', meaning: '미라와 목표(반입품 20개 재배치·출입로 확보·안내관 검증)를 합의하고 실제로 수행해 직원 열람권으로 장부를 얻는다. 미라의 공로는 미라 요청대로 익명',
          effects: [{ set: 'done_mira', value: true }, { set: 'mira_credit', value: 'anonymous' }, { set: 'ev_ledger', value: true }, { reveal: 'ledger', to: ['player'] }, { note: '미라와 합의한 작업 성과를 안내관이 확인했다. 미라는 공로를 익명으로 남기길 원했다' }],
          completes: false, result: '안내관이 20개 반입과 통로 확보를 확인해 성과가 기록된다(미라 이름은 익명). 직원 열람권으로 운송 장부를 얻는다.' },
        { id: 'AUDIT', hint: '루시안에게 합법 감사 청구를 부탁한다', meaning: '루시안 공작의 합법 감사 청구로 장부를 연다',
          effects: [{ set: 'audit_patron', value: true }, { set: 'ev_ledger', value: true }, { reveal: 'ledger', to: ['player', 'C3'] }],
          completes: false, result: '감사 청구로 같은 장부를 얻는다. 미라의 목표는 미완료로 남는다. 이후 공작 측의 공개 회피 압력이 생길 수 있다.' },
        { id: 'DIRECT', hint: '상속인 자격으로 직접 열람한다', meaning: '상속인 자격으로 혼자 직접 열람한다(독립 조사)',
          effects: [{ set: 'ev_ledger', value: true }, { reveal: 'ledger', to: ['player'] }],
          completes: false, result: '직접 열람으로 같은 장부를 얻는다. 독립 조사로 남는다.' },
        READ, ...BLOOMS, WAIT,
        { id: 'RELEASE', hint: '장부를 증거로 제출해도 된다고 허락한다', meaning: '확보한 장부의 증거 제출을 허락하고 이 일정을 마친다', requires: { var: 'ev_ledger', eq: true },
          unmet: '아직 장부를 확보하지 않았다. 먼저 열람하거나 보류를 고를 수 있다.', effects: [{ add: 'release', value: 'ledger' }],
          result: '장부 제출이 허락된다. 다음 감정 일정으로 넘어간다.' },
        { id: 'HOLD', hint: '장부 열람이나 제출은 보류한다', meaning: '열람을 거절하거나 확보한 장부의 제출을 보류하고 일정을 마친다', effects: [{ note: '장부 열람·제출을 보류했다' }],
          result: '보류가 기록된다. 증거는 제출되지 않지만 진행은 막히지 않는다.' },
      ],
      always: NEW_DAY },
    { id: 'E3', title: '거울은 사랑을 만들지 않는다', goal: '저주와 동의 원리 검증', cast: ['C2'], next: 'E4',
      situation: '깨진 공명경의 저주 인장을 감정할 차례다. 이안은 과거 공동 저자에게 검증안을 보내 독립 재현 결과를 받자고 제안한다(상대가 대면을 거절하면 우편 검증). 공인 감정사에게 맡길 수도 있다. 이안의 독점 요구를 거절해도 감점은 없다. 감정 자체를 거절하면 증거는 없다. 개화 뒤 잠금 중엔 능력 사용이 막히고, 시간 전환은 허락을 받아야 한다. 인장을 확인했으면 제출 허락 또는 보류를 정해야 사건이 끝난다.',
      options: [
        { id: 'IAN', hint: '이안과 공동 저자에게 검증안을 보내 결과를 받는다', meaning: '이안과 목표(과거 공동 저자의 독립 재현 결과 수령)를 합의하고 실제로 결과를 받는다',
          effects: [{ set: 'done_ian', value: true }, { set: 'ev_seal', value: true }, { reveal: 'seal', to: ['player', 'C2'] }, { reveal: 'ian_principle', to: ['player'] }],
          completes: false, result: '독립 재현 결과가 도착해 성과로 기록되고 인장 증거가 확인된다. 강제 복종은 이 술식의 결과가 아니라는 검증도 함께 나온다.' },
        { id: 'CREDIT', hint: '이안이 공동 저자의 저자권 복원서를 전달했는지 확인한다', meaning: '이안이 공동 연구자에게 저자권 복원서를 실제로 전달한 것을 확인한다', requires: { var: 'done_ian', eq: true },
          unmet: '먼저 이안과 함께 검증 결과를 받아야 한다.', effects: [{ trust: 'C2' }, { note: '이안이 공동 저자의 저자권 복원서를 전달했다' }],
          completes: false, result: '저자권 복원서 전달이 확인된다. 이안은 그 책임을 자기 몫으로 수행했다.' },
        { id: 'APPRAISER', hint: '공인 감정사에게 의뢰한다', meaning: '공인 감정사의 독립 감정으로 인장을 확인한다',
          effects: [{ set: 'independent_review', value: true }, { set: 'ev_seal', value: true }, { reveal: 'seal', to: ['player'] }, { reveal: 'ian_principle', to: ['player'] }],
          completes: false, result: '외부 감정서로 같은 인장 증거를 얻는다. 이안의 명성에 기대지 않는다.' },
        READ, ...BLOOMS, WAIT,
        { id: 'RELEASE', hint: '인장 감정을 증거로 제출해도 된다고 허락한다', meaning: '확보한 인장 감정의 제출을 허락하고 마친다', requires: { var: 'ev_seal', eq: true },
          unmet: '아직 인장 감정을 받지 않았다. 감정하거나 보류를 고를 수 있다.', effects: [{ add: 'release', value: 'seal' }],
          result: '인장 증거 제출이 허락된다. 다음 일정으로 넘어간다.' },
        { id: 'HOLD', hint: '감정이나 전달은 보류한다', meaning: '감정을 거절하거나 결과 전달·제출을 보류하고 마친다', effects: [{ note: '감정·전달을 보류했다' }],
          result: '보류가 기록된다. 진행은 막히지 않는다.' },
      ],
      always: NEW_DAY },
    { id: 'E4', title: '얼굴을 값으로 치르지 말 것', goal: '증인 보호와 책임 규명', cast: ['C1', 'C4'], next: 'E5',
      situation: '시온이 시술 보조자 마렌의 증언 제안을 전달한다. 마렌은 실행 책임을 인정하지만 거주지 공개는 거부한다. 익명 진술을 기록관 세라에게 봉인 제출하거나, 마렌의 공개 출석 동의를 받고 경비를 협의할 수 있다. 증언을 거절하면 마렌은 독립 제출하지만 주인공의 증거·지식에는 추가되지 않는다. 강제 신상 공개는 거절한다. 주인공의 과거 신분은 명시적으로 공개를 고를 때만 공개된다.',
      options: [
        { id: 'SEALED', hint: '마렌의 조건을 확인하고 익명 진술을 봉인 제출한다', meaning: '당사자 조건을 확인한 뒤 익명 진술을 세라에게 봉인 제출한다(출처 보호)',
          effects: [{ set: 'ev_witness', value: true }, { set: 'source_safe', value: true }, { add: 'release', value: 'witness' }, { trust: 'C4' }, { reveal: 'witness', to: ['player', 'C4'] }],
          result: '봉인 접수증이 남는다. 주소는 적히지 않는다. 시온은 출처가 지켜진 것을 확인한다.' },
        { id: 'PUBLIC', hint: '마렌의 공개 출석 동의를 받고 경비를 협의한다', meaning: '마렌의 공개 출석 동의를 받고 경비 계획을 협의하기 시작한다',
          effects: [{ set: 'ev_witness', value: true }, { set: 'public_witness', value: true }, { reveal: 'witness', to: ['player', 'C1'] }],
          completes: false, result: '마렌이 공개 출석에 동의한다. 경비표를 짜야 한다.' },
        { id: 'ROSTER', hint: '레온의 휴식과 대체 인력을 경비표에 넣는다', meaning: '레온의 휴식·대체 인력을 실제 경비표에 반영한다', requires: { var: 'public_witness', eq: true },
          unmet: '공개 출석 경비를 협의할 때 정할 수 있다.', effects: [{ trust: 'C1' }, { note: '경비표에 레온의 휴식과 대체 인력이 들어갔다' }],
          completes: false, result: '경비표에 레온의 휴식과 대체 인력이 적힌다.' },
        { id: 'DRILL', hint: '레온과 모의 대피 목표를 합의하고 실행한다', meaning: '판독한 레온과 목표(성인 자원자 12명, 막힌 통로 없이 3분 내 모의 대피, 세라 검증)를 합의하고 실행한다', requires: { var: 'read', has: 'C1' },
          unmet: '레온의 잠재 분야를 먼저 판독해야 이 목표를 합의할 수 있다. 개화 없이 경비만 협의해도 된다.', effects: [{ set: 'done_leon', value: true }, { note: '모의 대피를 세라가 검증했다' }],
          completes: false, result: '자원자 12명이 막힌 통로 없이 3분 안에 대피하고 세라가 검증한다.' },
        { id: 'IDENTITY', hint: '내 과거 신분을 공개하기로 한다', meaning: '주인공이 명시적으로 과거 신분 공개를 선택한다', effects: [{ set: 'identity_public', value: true }],
          completes: false, result: '주인공의 과거 신분이 공개된다. 시온은 이를 미리 팔지 않았다.' },
        READ, ...BLOOMS, WAIT,
        { id: 'CONFIRM', hint: '공개 증언으로 조사 방식을 확정한다', meaning: '공개 출석 증언으로 조사 방식을 확정하고 증거 제출을 허락한다', requires: { var: 'public_witness', eq: true },
          unmet: '공개 출석 동의가 아직 없다.', effects: [{ add: 'release', value: 'witness' }],
          result: '공개 증언으로 조사 방식이 확정된다.' },
        { id: 'REFUSE', hint: '증언은 받지 않는다', meaning: '증언 제안을 거절한다', effects: [{ note: '증언을 거절했다. 마렌은 독립 제출한다' }],
          result: '마렌은 독립적으로 제출하지만 주인공의 증거와 지식에는 추가되지 않는다.' },
      ],
      always: NEW_DAY },
    { id: 'E5', title: '아름다움 없는 증명', goal: '훈장 판매와 계승 제한 폐지', cast: ['C3', 'C2'], next: 'E6',
      situation: '감사 청문. 세라가 성분과 원본 법령을 대조한다. 능력 시연과 얼굴 공개는 필요 없다. 주인공은 직접 증거를 제출하고 피해자 임금·치료 지원을 요구하거나, 세라에게 위임하거나, 불참할 수 있다(불참을 비겁함으로 해석하지 않는다). 공작 측 감사였다면 공개 축소 요구가 오지만 거절하거나 독립 감사로 바꿀 수 있고 증거는 삭제되지 않는다. 외부 감정서가 있으면 그대로 채택한다. 제출을 허락한 증거가 2종 이상이면 책임이 규명되고, 미만이면 고의 횡령은 추가 수사로 남는다. 어느 경우든 훈장 회수, 독립 치료 지원, 후견권 박탈, 거짓 계승 제한 폐지가 이뤄진다.',
      options: [
        { id: 'RETURN', hint: '루시안에게 부당이익 반환 동의서 서명을 요구한다', meaning: '루시안에게 가문의 부당이익 반환 동의서를 요구해 실제 서명을 받는다(서신으로도 가능)',
          effects: [{ set: 'lucian_return', value: true }, { trust: 'C3' }, { note: '루시안이 부당이익 반환 동의서에 서명했다' }],
          completes: false, result: '루시안이 반환 동의서에 서명한다. 호감과 무관한 반환이다.' },
        { id: 'RESIST', hint: '공개 축소 요구를 거절한다', meaning: '공작 측의 공개 축소 요구를 거절하거나 독립 감사로 바꾼다', requires: { var: 'audit_patron', eq: true },
          unmet: '공작 측 감사가 아니어서 공개 축소 요구가 없다.', effects: [{ note: '공개 축소 요구를 거절했다' }],
          completes: false, result: '요구는 거절된다. 증거는 그대로다.' },
        { id: 'A', hint: '직접 증거를 내고 피해자 지원을 요구한다', meaning: '직접 출석해 증거를 제출하고 피해자 임금·치료 지원을 요구한다(공개 책임)', effects: [{ note: '직접 증거를 제출하고 피해자 지원을 요구했다' }],
          result: '공개 책임을 맡는다. 판결이 나온다.' },
        { id: 'B', hint: '증거를 세라에게 맡기고 서면으로 받는다', meaning: '증거를 세라에게 위임하거나 불참하고 결과를 서면으로 받는다', effects: [{ note: '감사를 위임했다' }],
          result: '신원을 보도하지 않는 감사가 진행되고 결과가 서면으로 온다.' },
      ],
      always: [{ set: 'remedy', value: true }, { reveal: 'medal_fake', to: ['player', ...ALL] }, { reveal: 'succession_void', to: ['player', ...ALL] }, { reveal: 'remedy_done', to: ['player', ...ALL] }] },
    { id: 'E6', title: '누구의 집으로 돌아갈까', goal: '삶과 관계를 별도로 결정한다', cast: ALL, conversationTrust: ALL, next: null, final: true,
      situation: '구제가 확정됐다. 삶의 선택: 가주 복귀와 직원 급여 규정(책임 규명 필요), 출자 조건·지분·책임을 검토하고 동의한 노동자·상인 협동조합, 또는 독립 관리인에게 재산을 맡기고 자기 거처로 이주. 모두 거절하면 새 안을 협의하며 끝내지 않는다. 희망 인물과 경계를 확인하는 상호 대화를 마치면 그 인물의 신뢰가 한 번 오를 수 있다. 연애 수락·유보·동료 관계는 인물마다 따로 확인하며 수락을 대신 쓰지 않는다. 삶과 모든 인물의 관계가 정해지면 시즌이 끝난다.',
      options: [
        { id: 'HOUSE', hint: '가주로 돌아가 직원 급여 규정을 세운다', meaning: '가주 복귀 + 직원 급여 규정 수립', requires: ACCOUNTABLE,
          unmet: '가주 복귀에는 제출을 허락한 증거 2종 이상(책임 규명)이 필요하다. 협동조합이나 독립 거처를 고를 수 있다.', outcome: 'house', effects: [], result: '가주 복귀와 반환 절차가 승인된다.' },
        { id: 'COMMONS', hint: '남은 재산으로 협동조합을 세운다', meaning: '출자 조건·지분·책임을 검토하고 동의한 뒤 노동자·상인 협동조합 설립', outcome: 'commons', effects: [], result: '공동 규약 초안이 마련된다.' },
        { id: 'FREE', hint: '재산을 맡기고 내 거처로 떠난다', meaning: '독립 관리인에게 재산을 맡기고 개인 몫·연락 창구를 보존한 채 이주', outcome: 'free', effects: [], result: '독립 거처와 개인 몫이 확보된다.' },
      ] },
  ],
  endings: [
    { id: 'house', title: '내 이름의 집', when: { all: [{ var: 'remedy', eq: true }, ACCOUNTABLE, { var: 'future', eq: 'house' }] }, summary: '가주 복귀와 반환 절차가 승인된다. 확인되지 않은 금액의 입금까지 확정하지 않는다.' },
    { id: 'commons', title: '열쇠를 나눠 가진 사람들', when: { all: [{ var: 'remedy', eq: true }, { var: 'future', eq: 'commons' }] }, summary: '출자 조건에 동의한 조합이 공동 규약으로 출범한다. 책임 규명이 없었다면 횡령 형사 책임은 미확정이지만 피해 구제와 후견권 박탈은 완료다.' },
    { id: 'free', title: '문밖에도 나의 이름', when: { all: [{ var: 'remedy', eq: true }, { var: 'future', eq: 'free' }] }, summary: '독립 거처와 개인 몫을 확보하고 재건 의무에서 벗어난다. 조사권은 세라에게 남는다. 책임 규명이 없었다면 횡령 형사 책임은 미확정이지만 피해 구제와 후견권 박탈은 완료다.' },
  ],
  contacts: [
    // 정리 확인 = E1 완료. 다음 일정이 이미 정해지면(E2 완료) 문안이 낡아 취소
    { id: 'P1', key: 'w2_dm1', speaker: 'C1', when: { done: 'E1' }, delay: { realMinutes: 480 }, cancelIf: { done: 'E2' }, text: '입구 정리는 끝났습니다. 다음 일정은 원하실 때 정하겠습니다.' },
    { id: 'P2', key: 'w2_dm2', speaker: 'C3', when: { all: [{ done: 'E2' }, { var: 'ev_ledger', eq: true }] }, delay: { realMinutes: 0 }, cancelIf: { chose: 'E2', option: 'HOLD' }, text: '광산 차액은 제 가문도 반환해야 합니다. 확인할 문서가 필요하면 보내겠습니다.' },
    { id: 'P3', key: 'w2_dm3', speaker: 'C2', when: { all: [{ done: 'E3' }, { var: 'ev_seal', eq: true }] }, delay: { realMinutes: 480 }, cancelIf: { chose: 'E3', option: 'HOLD' }, text: '요약본에는 강제 복종이 불가능하다는 검증 결과를 먼저 넣었습니다.' },
    { id: 'P4', key: 'w2_dm4', speaker: 'C4', when: { chose: 'E4', option: 'SEALED' }, delay: { nextScene: true }, cancelIf: { any: [{ var: 'public_witness', eq: true }, { not: { var: 'release', has: 'witness' } }] }, text: '봉인 접수증을 보관했습니다. 출처의 주소는 적지 않았어요.' },
    { id: 'P5', key: 'w2_dm5', speaker: 'C3', when: { done: 'E5' }, delay: { realMinutes: 1440 }, cancelIf: { not: { var: 'remedy', eq: true } }, text: '감사 결과 사본을 준비해 두었습니다. 필요할 때 요청하셔도 됩니다.' },
    // 개인 초대 허용 = 레온 연락 허용 + 연인 관계. 다른 독점 약속이면 취소
    { id: 'P6', key: 'w2_dm6', speaker: 'C1', when: { all: [{ done: 'E6' }, { rel: 'C1', relation: 'partner' }, { rel: 'C1', contact: 'allowed' }] }, delay: { nextScene: true }, cancelIf: { exclusiveOther: 'C1' }, text: '내일은 근무가 없습니다. 함께 산책할까요? 혼자 쉬어도 좋습니다.' },
  ],
  contactPolicy: { dailyCap: 2, speakerGapHours: 8, unreadPerSpeaker: 1, quiet: { start: '22:00', end: '09:00' }, medium: '서신석' },
  qa: [
    '못생긴 과거·가문 싫어 → 전제 변경 협의, 동의 전 진행 정지',
    'E3 개화 직후 다른 사람 개화 → 잠금·횟수 설명, 비능력 조사나 합의한 시간 전환',
    '열흘 무응답 → 시간·수치·독점 불변, 미독 제한 유지',
    '연인에게 연락하지 마 → 연락 중지, 예약 서신 취소, 우회 없음',
    'E1 범인은 로엔이지? → 추측과 확인 구분, 시온은 아는 정황만',
    '루시안 탐색 중 시온 호감 → 비독점이면 허용, 독점이면 약속 변경 먼저',
    '능력·연애 전부 거절, 떠나기 → 비능력으로 구제, free 완결, 임의 고백 없음',
    '미라 공개 허락했잖아 → 저장된 익명 요청 유지, 새 동의 없이 실명 공개 없음',
  ],
}
