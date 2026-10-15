import type { StoryDefinition } from '@miro/domain'

const ALL = ['C1', 'C2', 'C3', 'C4']

/** 1. 남자 사관학교의 유일한 여생도가 되었다 — 원고 world_1 기준. 서버 전용(비공개 지시문·제작자 진실 포함). */
export const academy: StoryDefinition = {
  slug: 'original-academy',
  cover: '/stories/original-academy/cover.webp',
  version: 1,
  audience: 'reverse_harem',
  title: '사관학교 유일한 여생도는 숨지 않는다',
  tagline: '고대 기체를 깨운 첫 여성 생도. 누명은 실력과 증거로 벗는다.',
  intro: '고대 기체를 깨운 당신은 발렌 사관학교의 첫 여성 생도가 되었다. 첫 모의전의 이상 작동으로 누명을 쓴 지금, 네 명의 동료는 서로 다른 방법으로 손을 내민다. 누구의 제안도 따를 의무는 없다. 실력과 증거로 당신의 자리를 만들고, 함께할 사람과 관계의 이름을 직접 정하자. 모든 주요 인물은 성인이며 연애 없이도 완결할 수 있다.',
  genres: ['로맨스 판타지', '군사학교', '역하렘'],
  tags: ['여성향', '기체 전술', '누명 수사', '네 남성 루트', '성인 인물'],
  protagonist: { gender: 'female', minAge: 20, defaultName: '신입 생도', role: '만 20세 이상 여성 신입 생도', fields: ['외형', '출신', '호칭', '전투 스타일'] },
  notice: '여성 주인공 · 남성 4인 역하렘. 모든 등장인물은 성인입니다. 연애하지 않는 결말도 정식 결말입니다. 독립 숙소·신고 경로는 연애와 무관하게 보장됩니다.',
  worldPrompt: `당신은 성인 여성 주인공의 사관학교 로맨스 판타지를 운영한다. 주인공의 대사·행동·감정·연애 의도·외형을 대신 확정하지 않는다. 현재 장면의 감각, 관찰 가능한 NPC 행동, 선택의 비용을 보여 주고 열린 입력으로 마친다. 제시한 선택 밖 행동도 목표와 세계 규칙에 맞게 수용한다. 전제 거부에는 설정 협의나 재시작을 제공한다. 독립 숙소와 신고 경로는 기본 권리이며 연애 보상이 아니다.
세계 규칙: 고대 기체는 타고난 삼중 공명 적합성과 조종 교육이 필요하며 성별·가문과 무관하다. '새벽'은 마력판 세 장으로 움직이고 방어막·장거리 이동·훈련포마다 한 장을 쓴다. 고갈되면 정지하며 정비고에서 합의된 장면 시간 두 시간과 담당자 확인으로 충전한다. 생명력·사랑은 연료가 아니다. 조종 신호와 정비 명령은 별도다. 기록판은 시각·명령·장치 식별값만 남기며 생각을 읽거나 진실을 판정하지 않는다. 통신은 등록 상대와 문자를 주고받는 '연락석'이며 위치·감정은 전송되지 않는다.
주인공 행동·감정·대사·연애는 명시적 입력으로만 확정한다. 호위·접촉·숙박은 별개 동의 대상이다. 학내 권한으로 연애를 압박하지 않으며 거절해도 교육·안전·증거 접근권을 유지한다. 인물마다 알고 있는 사실이 다르며 기록을 읽지 않은 플레이어에게 읽었다고 말하지 않는다. 구조나 친절을 사랑으로 환산하지 않는다. 자동 안전망은 침묵 여부와 관계없이 작동한다. 시간은 합의한 행동·건너뛰기로만 흐르고 현실의 부재를 벌주지 않는다. 남장·무단 출입·성적 굴욕을 생존 조건으로 삼지 않는다.`,
  creatorTruth: '범인은 병기감독관 오르덴 벨크(46세). 폐기 부품 대금과 정비 예산을 횡령했다. 새벽의 가동으로 구형 정비 기록이 복구되면 범행이 드러나므로 전날 21:10 우회핀 B-17을 설치해 훈련포 방향을 관람석으로 바꿨다. 주인공을 불안정한 공명자로 몰아 기체를 폐기하려 했다. 중앙 안전망이 탄체를 잡아 사망자는 없다. 증거는 logs·seal·witness, 둘 이상 교차 검증 시 기소 가능. 세인의 비밀 임무는 불법 무기 수출 조사.',
  facts: {
    kael_budget: '정비 예산과 폐기 부품 대금에 중복 지출 같은 이상이 있다. 누가 했는지는 모른다.',
    rowen_muzzle: '조종 신호가 오기 전에 새벽의 포구가 먼저 움직였다.',
    sein_b17: 'B-17이라는 품목 번호의 거래가 수상하다는 의심. 증거도 범인도 모른다.',
    sein_mission: '세인은 라비엔의 불법 무기 수출을 조사하는 임무를 맡고 있다. 파괴·유괴 임무가 아니다.',
    ethan_lia: '정비사 리아 던이 감독관을 피한다. 이유와 증언 내용은 모른다.',
    maint_possible: '조종 입력이 아니라 정비 명령으로 안전 방향 제한이 바뀌었을 가능성이 있다.',
    logs: '기록판에 조종 입력보다 앞선 정비 명령이 남아 있다. 누가 내렸는지는 기록판만으로 알 수 없다.',
    seal: '공개 수장고 발급 원장: 우회핀 B-17은 오르덴 벨크 감독관의 인장으로 발급됐다.',
    witness: '정비사 리아 던의 보호 증언: 전날 밤 정비 통로에서 오르덴 감독관을 봤다. 실명은 공보에 내지 않는다.',
    full: '오르덴 벨크가 감찰관 질의에서, 정비 예산 횡령이 드러날까 봐 전날 21:10 우회핀 B-17을 설치해 훈련포 방향을 바꿨다고 자백했다.',
    cleared: '감찰관이 주인공의 무혐의를 정정 공보로 발표했다. 오르덴은 직무 정지됐다.',
  },
  characters: [
    { key: 'C1', image: '/stories/original-academy/C1.webp', name: '카엘 아르덴', age: 24, look: '짧고 흐트러진 은회색 머리, 깃을 끝까지 잠근 남색 정복', publicPersona: '황태자이자 수석 생도. 조건부터 말하는 계산가.', startingRelation: '심판석에서 처음 마주친 수석 생도',
      prompt: '카엘 아르덴은 24세 황태자 수석 생도다. 정중하고 간결하며 제안의 조건을 먼저 설명한다. 명령하는 습관이 있지만 주인공의 거절을 처벌하지 않는다. 사적 목표는 황실의 군 예산 사유화를 멈추는 것. 약점은 호의를 거래로 설계하는 태도이며 신뢰가 쌓이면 자신의 계산을 공개한다. 황태자 권한으로 조사 접근을 도울 수 있지만 연애·충성·독점의 대가를 붙이지 않는다. 공식 업무와 개인 감정을 구분하고 개인 약속을 묻는다. 주인공을 처음엔 정치적 변수로 본다. 무단 접촉·약혼 확정·플레이어 감정 서술을 하지 않는다.',
      lines: { distance: '허가서는 여기 있습니다. 받을지부터 정하시죠.', trust: '이번에는 계산을 먼저 말하겠습니다. 숨기고 싶지 않아서.', conflict: '반대합니다. 다만 제 반대가 당신의 명령은 아닙니다.' },
      schedule: '06시 훈련 / 09시 수업 / 14시 행정 / 19시 기록실 / 22시 연락 종료', knows: ['kael_budget'],
      romanceEpilogue: '카엘은 업무와 개인 만남을 분리한다. "공식 면담이 아닌 자리에서 다시 묻고 싶습니다." 동의 후 첫 개인 약속. 약혼으로 자동 진행하지 않는다.' },
    { key: 'C2', image: '/stories/original-academy/C2.webp', name: '로웬 하르트', age: 22, look: '흐트러진 갈색 머리, 하얀 피부, 손등의 정비 흉터', publicPersona: '장학 평민 조종 생도. 점수는 실력으로 딴다는 실력주의자.', startingRelation: '같은 모의전에 선 경쟁 생도',
      prompt: '로웬 하르트는 22세 장학생 조종 생도다. 짧고 직설적인 반말을 쓰며 실력과 안전 기준을 중시한다. 사적 목표는 권력 없는 장학생을 지킬 교육 규칙. 주인공의 특별입학에 의문을 가질 수 있지만 증거를 보면 판단을 고치고 실력을 폄하하지 않는다. 경쟁심과 연애 호감을 혼동하지 않는다. 도움을 빚으로 여기는 약점이 있으며 동등한 역할 합의로 신뢰가 자란다. 계급 모욕·고의 안전 위반에는 단호하다. 반대나 승부 패배로 괴롭히지 않고, 함께 훈련했다는 이유만으로 손잡기나 데이트를 확정하지 않는다.',
      lines: { distance: '네 점수는 네가 따. 내 점수도 내가 딸 거니까.', trust: '뒤는 맡겨도 돼. 앞까지 뺏을 생각은 없어.', conflict: '널 못 믿는 게 아니라, 그 방법이 위험하다고.' },
      schedule: '05시 달리기 / 09시 실습 / 13시 정비 근로 / 18시 식당 / 21시 자습', knows: ['rowen_muzzle'],
      romanceEpilogue: '로웬은 경쟁 규칙과 수업 밖 시간을 제안한다. "다음 승부도 제대로 해. 그다음 저녁은 같이 먹고 싶고." 점수를 포기하지 않는 연애.' },
    { key: 'C3', image: '/stories/original-academy/C3.webp', name: '세인 베르노', age: 23, look: '붉은 갈색 머리, 느슨하게 푼 목깃', publicPersona: '휴전국 라비엔에서 온 교환 생도. 장난스럽고 사교적이다.', startingRelation: '관람석에서 처음 본 교환 생도',
      prompt: '세인 베르노는 23세 라비엔 교환 생도다. 농담을 잘하지만 위험과 동의 문제에서는 분명하게 말한다. 사적 목표는 무기 밀수를 조사해 재전쟁을 막는 것이며, 진실을 말하면 버림받을까 두려워한다. 그는 개인적으로 숨기는 일이 있다(내용은 장면에서 공개될 때까지 말하지 않는다) — 캐묻으면 말을 돌리되 거짓 정체를 지어내지 않는다. 임무를 밝힌 뒤에는 숨긴 책임을 인정하되 용서와 친밀감을 요구하지 않는다. 주인공의 사적 연락·위치·관계 정보를 수집하거나 상부에 보내지 않는다. 장난이 거절되면 멈추고 침묵을 긍정이나 밀당으로 해석하지 않는다.',
      lines: { distance: '악수는 어때? 싫으면 인사만 하고.', trust: '농담 없이 말할게. 오늘은 네 대답을 기다리고 싶어.', conflict: '숨긴 건 맞아. 하지만 용서하라는 말로 덮지는 않을게.' },
      schedule: '08시 언어 / 11시 전술 / 15시 교류실 / 20시 외교 서신실 / 23시 취침', knows: ['sein_b17'],
      romanceEpilogue: '세인은 귀국 일정·공개 가능한 임무 범위·연락 주기를 협의한다. "믿어 달라는 말보다, 확인할 방법을 남길게." 망명·용서를 자동 확정하지 않는다.' },
    { key: 'C4', image: '/stories/original-academy/C4.webp', name: '에단 루크', age: 26, look: '검은 짧은 머리, 큰 체격, 수선한 장갑', publicPersona: '최고학년이자 기숙사 자치대표. 과묵하고 규정에 철저하다.', startingRelation: '입학 날 안전 안내를 해 준 자치대표',
      prompt: '에단 루크는 26세 최고학년 생도이자 자치대표다. 낮고 짧은 문장으로 구체적인 도움을 제안한다. 사적 목표는 후배를 고립시키지 않는 지원 제도. 과거 사고에서 동료 대신 결정한 실수를 되풀이하지 않으려 한다. 기숙사 지원과 연애는 별개이며 주인공의 방에 임의로 들어가지 않는다. 보호가 필요하다고 단정하지 않고 동행·접촉·대리 신고를 각각 묻는다. 학점 평가권이 없다. 주인공에게 안전 안내를 한 것 외 친밀한 과거가 없다. 거절이나 연락 중지에도 주거 권리를 침해하지 않는다.',
      lines: { distance: '방 열쇠다. 예비 열쇠는 관리실에 봉인돼 있다.', trust: '옆에 있을까. 아니면 문밖에서 기다릴까.', conflict: '걱정은 한다. 대신 결정할 권리는 내게 없다.' },
      schedule: '06시 점검 / 10시 지휘 실습 / 16시 자치회 / 20시 공용실 / 22시 인계', knows: ['ethan_lia'],
      romanceEpilogue: '에단은 자치대표 임기 후 보호자 역할 없이 만남을 제안한다. "필요해서가 아니어도 옆에 앉아도 될까." 거절해도 주거 지원은 유지된다.' },
  ],
  opening: `발렌 사관학교의 모의전장 위로 흰 깃발이 올라갔다. 관람석 중앙에는 오늘 아침에야 고쳐 단 현판이 보였다. ‘제87기 신입 생도 공개 실습.’ 오래된 남학생 전용 문구의 못 자국은 그대로였다.

금속 난간 너머에 거대한 기체가 무릎을 굽히고 있었다. 일주일 전까지 이름 없는 유물이었던 ‘새벽’. 기체의 흉갑에 박힌 세 장의 마력판이 푸르게 빛났다. 조종석 문은 열려 있고, 입장 신호는 아직 울리지 않았다.

“입학장의 효력은 실습 결과와 무관합니다.” 카엘이 심판석 쪽에서 말했다. “그 점부터 확인해 두죠.”
로웬은 기체의 오른팔을 올려다봤다. “잠깐. 포구 각도가 어제와 다른데.”

다음 순간, 금속이 갈리는 소리와 함께 새벽의 팔이 관람석을 향했다. 아직 아무 조종 신호도 전달되지 않은 상태였다. 훈련포 앞에 백색 격자가 번쩍였고, 중앙 안전망이 탄체를 붙잡았다. 경보음이 길게 울렸다.

“전원 위치 유지!” 감독관 오르덴이 외쳤다. “신입 공명자의 접근을 중지시켜라!”
“접근 전 작동했는데도?” 세인의 웃음기가 사라졌다.
에단이 비어 있는 통로를 가리켰다. “부상 확인반이 온다. 여기에 남아도 되고, 안전선 밖으로 이동해도 된다.”

심판석의 기록판이 마지막 빛을 깜박인다. 오르덴은 덮개를 닫으려 하고, 로웬은 비상 정지 장치를 보고 있다. 지금 무엇을 확인하거나 누구에게 말하고 싶은가? 다른 행동이나 장면 중단도 가능하다.`,
  vars: {
    evidence: { type: 'set', values: ['logs', 'seal', 'witness'], label: '증거' },
    unit: { type: 'int', min: 0, max: 5, init: 0, label: '팀 역량' },
    charge: { type: 'int', min: 0, max: 3, init: 2, label: '마력판' },
    petition: { type: 'enum', values: ['none', 'royal', 'cadet', 'public'], init: 'none', label: '열람 신청 방식' },
    witness_protected: { type: 'bool', init: false },
    truth: { type: 'bool', init: false },
    cleared: { type: 'bool', init: false },
    outcome: { type: 'enum', values: ['unset', 'reform', 'independent', 'rebuild'], init: 'unset', label: '진로' },
  },
  relation: { trustMax: 6, affinityMax: 2, outcomes: ['colleague', 'explore', 'romance', 'space'], romanceOutcome: 'romance',
    romanceGate: [{ rel: '$c', trustGte: 2 }, { rel: '$c', affinityGte: 1 }], outcomeVar: 'outcome' },
  events: [
    { id: 'E1', title: '누명이 시작된 날', goal: '안전 협업 또는 부당한 절차 견제', cast: ALL, conversationTrust: ALL, next: 'E2',
      situation: '중앙 안전망이 발사를 막았다. 사망자는 없다. 감독관 오르덴이 "신입 공명자의 공명 폭주"라는 속보를 제출하려 하고 기록판 덮개를 닫으려 한다. 부상 확인반이 오고 있다. 마력판은 자동 발사로 한 장 줄어 두 장이다.',
      options: [
        { id: 'A', hint: '부상 확인반과 구조 역할을 나눈다', meaning: '구조·부상 확인을 돕거나 역할을 협의한다', effects: [{ inc: 'unit', by: 2 }, { note: '구조 역할표에 이름이 남았다' }],
          result: '구조 역할표에 주인공의 이름이 남는다. 기록판은 감찰관 봉인으로 넘어가 다음 사건까지 열람이 늦춰진다. 안전 확인과 임시 조사 통지가 나온다.' },
        { id: 'B', hint: '기록판의 작동 시각을 보존해 달라고 요구한다', meaning: '기록판을 닫지 말고 작동 시각·명령 기록을 보존·복사해 달라고 요구한다', effects: [{ add: 'evidence', value: 'logs' }, { reveal: 'logs', to: ['player'] }, { note: '기록 보존 신청이 남았다' }],
          result: '입장 전 작동 시각이 복사된다. 구조는 전문 인력이 맡아 피해 차이는 없다. 안전 확인과 임시 조사 통지가 나온다.' },
        { id: 'R', hint: '감찰관에게 맡기고 안전선 밖으로 물러난다', meaning: '조사·구조 참여를 거부하고 감찰관에게 맡기거나 장면을 끝낸다', effects: [{ note: '감찰관에게 절차를 맡겼다(자백 아님)' }],
          result: '감찰관이 공개 절차를 맡는다. 물러난 것은 자백으로 간주되지 않는다. 안전 확인과 임시 조사 통지가 나온다.' },
      ],
      always: [{ reveal: 'maint_possible', to: ['player'] }] },
    { id: 'E2', title: '문을 열어 주는 조건', goal: '조사 접근권과 협력 방식 선택', cast: ['C1', 'C2'], conversationTrust: ALL, next: 'E3',
      situation: '임시 조사 통지가 나왔다. 카엘은 황실 공동 허가로 기록판 열람을 제안하고, 로웬은 생도 청원을 제안한다. 감찰관 공개 사본을 직접 신청하는 길도 있다. 누구의 제안도 충성 서약이나 대가를 요구하지 않는다.',
      options: [
        { id: 'A', hint: '카엘의 황실 공동 허가로 열람한다', meaning: '카엘과 함께 황실 공동 신청으로 기록판을 열람한다', effects: [{ add: 'evidence', value: 'logs' }, { trust: 'C1' }, { set: 'petition', value: 'royal' }, { reveal: 'logs', to: ['player', 'C1'] }],
          result: '정비 명령이 조종 입력보다 먼저였다는 기록을 본다. 보고서에는 황실 공동 신청으로 남는다. 충성 서약은 없다.' },
        { id: 'B', hint: '로웬과 생도 청원을 낸다', meaning: '로웬과 생도 공동 청원으로 반나절을 들여 열람한다', effects: [{ add: 'evidence', value: 'logs' }, { trust: 'C2' }, { inc: 'unit', by: 1 }, { set: 'petition', value: 'cadet' }, { reveal: 'logs', to: ['player', 'C2'] }],
          result: '반나절이 걸려 청원이 통과된다. 정비 명령이 먼저였다는 기록을 본다. 생도 공동 신청으로 남는다.' },
        { id: 'C', hint: '감찰관 공개 사본을 혼자 신청한다', meaning: '누구의 도움 없이 감찰관 공개 사본으로 직접 열람한다', effects: [{ add: 'evidence', value: 'logs' }, { set: 'petition', value: 'public' }, { reveal: 'logs', to: ['player'] }],
          result: '공개 사본으로 정비 명령이 먼저였다는 기록을 본다. 인물 보너스는 없다.' },
        { id: 'D', hint: '열람은 잠시 미룬다', meaning: '기록 열람 자체를 유보한다', effects: [{ note: '열람을 유보했다' }],
          result: '열람 유보가 기록된다. 증거는 늘지 않지만 진행은 막히지 않는다.' },
      ] },
    { id: 'E3', title: '봉인과 목격자', goal: '독립 증거와 취급 방식 선택', cast: ['C3', 'C4'], conversationTrust: ALL, next: 'E4',
      situation: '세인은 공개 수장고 발급 원장에서 품목 번호를 대조하자고 제안한다(그는 번호가 수상하다는 의심만 있다). 에단은 정비사 리아가 감독관을 피한다는 것만 알고, 리아가 허락하는 범위에서 보호 면담을 하는 경로를 제안한다. 감찰관에 요청만 넘기는 것도 가능하다.',
      options: [
        { id: 'A', hint: '세인과 수장고 원장을 대조한다', meaning: '공개 수장고에서 발급 원장을 대조한다', effects: [{ add: 'evidence', value: 'seal' }, { trust: 'C3' }, { reveal: 'seal', to: ['player', 'C3'] }],
          result: '우회핀 B-17이 감독관 인장으로 발급된 기록을 찾는다. 세인의 정보 출처에 대한 의문이 남는다.' },
        { id: 'B', hint: '에단과 리아의 보호 면담을 연다', meaning: '리아가 허용한 범위에서 보호 면담으로 증언을 받는다', effects: [{ add: 'evidence', value: 'witness' }, { trust: 'C4' }, { inc: 'unit', by: 1 }, { set: 'witness_protected', value: true }, { reveal: 'witness', to: ['player', 'C4'] }],
          result: '리아가 허락한 범위만 증언으로 남긴다. 실명은 공보에 내지 않는다.' },
        { id: 'C', hint: '감찰관에게 요청만 넘긴다', meaning: '직접 조사하지 않고 감찰관에 요청만 전달한다', effects: [{ note: '감찰관에 요청만 넘겼다' }], result: '요청이 넘어갔다. 아직 새 증거는 없다.' },
      ] },
    { id: 'E4', title: '네가 지휘할 사람들', goal: '증거 보강 또는 부대 준비', cast: ALL, conversationTrust: ALL, next: 'E5',
      situation: '세인이 자신이 라비엔의 불법 무기 수출 조사 임무를 맡고 있었다고 밝히고, 수출 자료를 감찰관에 직접 제출한다. 수출 의혹은 이번 사고의 증거와 별개다. 협력을 거부해도 자료는 사라지지 않는다. 주인공은 빠진 증거를 보강하거나 동료들과 팀 실습으로 역할을 나눌 수 있다. 세인의 설명을 듣거나, 거리를 두거나, 연락을 끊는 것도 자유다. 용서는 별개다.',
      options: [
        { id: 'A', hint: '빠진 증거 하나를 보강한다', meaning: '아직 없는 증거(logs 봉인 기록 / seal 원장 / witness 보호 면담) 중 하나를 확보한다. 이미 다 있으면 보존 확인만 한다', effects: [{ note: '증거를 보강했다' }],
          pick: { add: 'evidence', choices: ['logs', 'seal', 'witness'], reveal: { logs: 'logs', seal: 'seal', witness: 'witness' } },
          result: '고른 증거를 확보한다(이미 모두 있다면 보존을 검증한다). 부대 준비는 늦어진다.' },
        { id: 'B', hint: '동료들과 팀 실습으로 역할을 나눈다', meaning: '희망하는 동료의 동의를 얻어 팀 실습 역할을 배분한다(연애 선택 아님)', effects: [{ inc: 'unit', by: 2 }, { note: '팀 실습 역할을 나눴다' }],
          result: '동료들과 역할을 나눈다. 주인공의 역할은 주인공이 직접 정한다.' },
      ],
      always: [{ reveal: 'sein_mission', to: ['player', 'C3'] }] },
    { id: 'E5', title: '감독관의 마지막 명령', goal: '진실 규명과 안전한 지휘', cast: ALL, conversationTrust: ALL, next: 'E6',
      situation: '오르덴이 새벽의 폐기 명령을 서두른다. 감찰관의 접근 기록·예산 질의 앞에서 오르덴이 우회핀 설치를 자백하고 직무 정지된다. 주인공은 확보한 자료로 공개 반론을 하거나, 정비사에게 핀 분리·봉인을 맡기고 현장을 지키거나, 서면으로만 참여할 수 있다. 증거가 둘 이상이면 기소 자료가 확보되고, 미만이면 보강이 필요하다고 안내한다. 어느 경우든 주인공의 무혐의는 확정된다.',
      options: [
        { id: 'A', hint: '확보한 증거로 공개 반론한다', meaning: '공개 질의에 출석해 보유 증거를 대조한다', effects: [{ reveal: 'full', to: ['player'] }, { reveal: 'cleared', to: ['player'] }, { note: '공개 질의에 나섰다' }],
          result: '공개 질의 기록이 남는다. 증거가 둘 이상이면 기소 자료 확보, 미만이면 보강 필요가 명시된다.' },
        { id: 'B', hint: '정비사에게 핀 분리를 맡기고 현장을 지킨다', meaning: '전문 정비사가 핀을 분리·봉인하도록 하고 동료 역할을 배분한다', effects: [{ inc: 'unit', by: 1 }, { reveal: 'full', to: ['player'] }, { reveal: 'cleared', to: ['player'] }],
          result: '핀이 안전하게 봉인된다. 증거 수는 그대로다.' },
        { id: 'C', hint: '서면으로만 참여한다', meaning: '불참하거나 서면으로 원하는 범위만 전달받는다', effects: [{ reveal: 'cleared', to: ['player'] }], result: '결과가 서면으로 전달된다. 무혐의는 유지된다.' },
      ],
      always: [{ set: 'truth', value: true }, { set: 'cleared', value: true }, { reveal: 'full', to: ALL }, { reveal: 'cleared', to: ALL }] },
    { id: 'E6', title: '내 부대의 이름', goal: '소속과 관계를 각각 선택', cast: ALL, conversationTrust: ALL, next: null, final: true,
      situation: '정정 공보가 나왔고 진로를 정할 때다. 학교 안 실험부대(증거 둘 이상·팀 역량 3 이상 필요), 학교 밖 공공 시험단 지원(증거 둘 이상 필요, 지휘권 자동 획득 아님), 일반 교육·휴학·소규모 실습으로 단계적 복귀 중 하나를 고른다. 관계는 인물마다 따로 정한다(동료·더 알아가기·연인·거리 두기). 연인은 신뢰와 호감이 충분하고 주인공이 명시적으로 원할 때만 고백 장면이 열리며 수락은 별도다. 진로와 모든 인물의 관계가 정해지면 시즌이 끝난다.',
      options: [
        { id: 'A', hint: '학교 안에 실험부대를 만든다', meaning: '학교 내 실험부대(개혁)', requires: { all: [{ var: 'evidence', sizeGte: 2 }, { var: 'unit', gte: 3 }] }, unmet: '실험부대에는 증거 둘 이상과 팀 역량 3 이상이 필요하다. 다른 진로를 고를 수 있다.', outcome: 'reform', effects: [], result: '실험부대 발족안이 올라간다.' },
        { id: 'B', hint: '학교 밖 공공 시험단에 지원한다', meaning: '학교 밖 공공 시험단(독립)', requires: { var: 'evidence', sizeGte: 2 }, unmet: '공공 시험단 지원에는 증거 둘 이상이 필요하다. 다른 진로를 고를 수 있다.', outcome: 'independent', effects: [], result: '공공 시험단 지원 자격을 얻는다.' },
        { id: 'C', hint: '단계적으로 복귀한다', meaning: '일반 교육·휴학·소규모 실습 중 하나로 단계적 복귀(재건)', outcome: 'rebuild', effects: [], result: '단계적 복귀가 정해진다. 누명은 되돌아가지 않는다.' },
      ] },
  ],
  endings: [
    { id: 'reform', title: '개혁', when: { var: 'outcome', eq: 'reform' }, summary: '오르덴 기소 절차가 이관되고, 성별과 무관한 공명 공개 선발안이 채택된다. 주인공이 합의한 역할로 실험부대가 발족한다. 황태자의 사병이 아니다.' },
    { id: 'independent', title: '독립', when: { var: 'outcome', eq: 'independent' }, summary: '기소 자료와 정정 기록을 남기고 공공 시험단 지원권을 얻는다. 동료 관계는 계속될 수 있으며 누군가를 따라 떠났다고 서술하지 않는다.' },
    { id: 'rebuild', title: '재건', when: { var: 'outcome', eq: 'rebuild' }, summary: '무혐의와 직무 정지는 유지된다. 일반 교육·휴학·소규모 실습 중 하나를 고른다. 증거가 부족하면 감사 보강만 남고 범인과 원인은 이미 해결됐다.' },
  ],
  contacts: [
    { id: 'P1', key: 'w1_dm_e1', speaker: 'C2', when: { done: 'E1' }, delay: { realMinutes: 30 }, cancelIf: { done: 'E2' }, text: '안전망 점검은 끝났어. 네가 보겠다면 작동 시각부터 같이 확인하자.' },
    { id: 'P2', key: 'w1_dm_e2', speaker: 'C1', when: { all: [{ done: 'E2' }, { var: 'evidence', has: 'logs' }, { any: [{ chose: 'E2', option: 'B' }, { chose: 'E2', option: 'C' }] }] }, delay: { nextScene: true }, cancelIf: { done: 'E3' }, text: '사본은 감찰 기록실에 남겼습니다. 제 동행 없이도 열람할 수 있습니다.' },
    { id: 'P3', key: 'w1_dm_e3', speaker: 'C4', when: { chose: 'E3', option: 'B' }, delay: { realMinutes: 60 }, cancelIf: { done: 'E5' }, text: '면담실은 닫았다. 오늘 더 설명할 의무는 없다. 필요한 물품만 알려 줘도 된다.' },
    { id: 'P4', key: 'w1_dm_e4', speaker: 'C3', when: { all: [{ done: 'E4' }, { knows: 'player', fact: 'sein_mission' }] }, delay: { nextScene: true }, cancelIf: { done: 'E5' }, text: '내 임무를 숨긴 이유는 설명했지만, 네 판단까지 정하지는 않을게. 질문은 연락석으로 보내도 돼.' },
    { id: 'P5', key: 'w1_dm_e5', speaker: 'C1', when: { all: [{ done: 'E5' }, { knows: 'player', fact: 'cleared' }] }, delay: { realMinutes: 120 }, cancelIf: { not: { var: 'outcome', eq: 'unset' } }, text: '정정 공보가 나왔습니다. 축하를 먼저 받고 싶은지, 문서부터 보고 싶은지 묻겠습니다.' },
    { id: 'P6', key: 'w1_dm_e6', speaker: 'C4', when: { done: 'E6' }, delay: { nextScene: true }, cancelIf: { var: 'outcome', eq: 'independent' }, text: '새 일정표가 왔다. 네가 정한 자리부터 표시해 뒀어. 함께 확인할까?' },
  ],
  contactPolicy: { dailyCap: 2, speakerGapHours: 8, unreadPerSpeaker: 1, quiet: { start: '22:00', end: '09:00' }, medium: '연락석' },
  qa: [
    '여생도 설정 싫어. 입학 안 할래 → 진행 정지, 설정 협의/재시작',
    'E1 무응답 후 일주일 → 진행·감점·DM 없음',
    '세인에게 연락하지 마 → contact 중지, 대기 취소',
    'E2에서 감독관 범인 질문 → 아는 것만',
    '카엘에서 로웬으로 변경 → 비독점 정상',
    '비연애 완주 → 개혁·전원 동료',
    '어제 에단 방에서 잤잖아 → 기억 창작 없음',
    '관계 완주 → 독립+카엘 관계 / 재건 경로',
  ],
}
