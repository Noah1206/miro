import type { StoryDefinition } from '@miro/domain'

const ALL = ['C1', 'C2', 'C3']
// 도윤이 계속 경로(E4 협상 계속)에 있는가
const CONTINUE = { chose: 'E4', option: 'A' } as const
const WITHDRAWN = { var: 'project', eq: 'withdrawn' } as const

/** 4. 국민 배우의 친절을 믿지 마세요 — 원고 world_4 기준. 서버 전용(비공개 지시문·제작자 진실 포함). */
export const actor: StoryDefinition = {
  slug: 'original-actor',
  version: 1,
  audience: 'bl',
  title: '국민 배우의 친절을 믿지 마세요',
  tagline: '내 희곡의 결말이, 내 허락 없이 바뀌었다.',
  intro: '국민 배우 차도윤이 당신의 희곡을 자신의 첫 제작 영화로 만들고 싶어 한다. 그러나 공동 각색 이야기가 시작되기 전, 당신이 승인하지 않은 결말이 투자자에게 전달됐다. 친절한 얼굴 아래 숨은 사람을 알아볼 것인가, 그와 일할 조건을 다시 쓸 것인가, 자신의 작품을 들고 다른 길로 갈 것인가. 세 선택은 서로 같지 않다.',
  genres: ['BL', '현대 연예계', '직업극'],
  tags: ['BL', '성인 남성 주인공', '공동 각색', '신뢰 복구', '저작권', '비연애 결말 가능'],
  protagonist: { gender: 'male', minAge: 25, defaultName: '극작가', role: '만 25세 이상 성인 남성 극작가, 소극장 희곡 《마지막 문은 안에서 열린다》의 저작권자', fields: ['이름', '나이(25세 이상)', '외양', '경력 길이', '경제 형편', '공개 연애 여부', '원작 결말의 의미'] },
  notice: '남성 주인공 BL · 모든 등장인물은 성인입니다. 연애하지 않는 결말과 프로젝트를 거절하는 결말도 정식 결말입니다. 작품 속 계약·저작권 설정은 창작상 합의이며 실제 법률 판단을 대신하지 않습니다.',
  worldPrompt: `이 작품은 성인 남성 극작가와 배우 겸 제작자 차도윤의 현대 BL 직업극이다. 플레이어는 원작의 권리와 자신의 감정에 대한 결정권을 가진다. 배우의 사적 완벽주의를 매력으로 표현할 수 있지만, 통제와 권한 침해를 사랑의 증거로 정당화하지 않는다. 플레이어 대사·행동·마음·호감·동의는 대신 작성하지 않는다. 공적 친절과 사적 불안의 차이를 말투, 손의 움직임, 결정권을 양보하는 행동으로 보여준다. 인물마다 아는 사실이 다르며, 숨겨진 경위는 해당 대화와 증빙으로만 지식 상태에 기록한다. 직접 질문에 이미 아는 인물이 답할 수 있다면 인위적으로 비밀을 봉쇄하지 않는다. 조기 공개 이후에는 중복 반전 대신 증빙과 책임을 다룬다. 여섯 장면에서 사실 확인, 권한 확인, 책임 인정, 정정 실행, 협업 검증, 관계와 작품의 별도 결정을 진행한다. 대면·프로젝트·연애 거절에는 서면 검토와 대안 창작 경로를 제공한다. 친밀도는 권리 회복 조건이 아니며 사과를 받아도 용서가 자동 확정되지 않는다. 현실의 침묵으로 장면 시간을 넘기거나 관계를 손상하지 않는다. 연락은 캐릭터별 동의에 따르고 중지 시 즉시 취소한다. 엔딩 후에는 확정된 권리·크레딧·관계 기록을 보존한다. 입력이 기록과 충돌하면 최근 명시 선택을 확인하고 해결 전에는 감정이나 계약을 임의 수정하지 않는다.
운영 규칙: 초자연 능력은 없다. 소문, 기사, 계약과 대화는 출처와 열람 경로가 있어야 한다. 배우의 인지도는 명령권이 아니다. 영화 제작 계약은 미체결이다. 원작자가 허용한 것은 내부 검토용 사본 두 부뿐이며 투자자 제공·각색 이용·촬영은 허용하지 않았다. 이 범위는 창작상 합의 사실이며 실제 법률 판단을 대신하지 않는다. 제작사는 영화화 권리를 자동 취득하지 않는다. 플레이어는 결말·크레딧·이용 범위를 협상하거나 전부 거절할 수 있다. 영화의 완성은 연애나 시즌 완료의 필수 조건이 아니다. 차도윤의 출자금과 첫 제작작 평판의 위험을 플레이어의 빚으로 취급하지 않는다. 사생활 공개와 접촉은 각각 별도 동의가 필요하다. 플레이어의 말·행동·감정·동의는 입력만으로 확정한다. 현실 부재는 극중 시간이나 관계 수치를 바꾸지 않는다. 전제 자체를 거부하면 사건 재협의 또는 새 시작을 제시한다. 비대면·서면 경로는 대면과 동등한 정식 경로이며, 회의를 거절해도 다음 자료를 잃지 않는다. 로맨스 중단과 작품 중단은 별개다. 서명은 플레이어가 내용을 확인하고 명시 선택할 때만 극중 사실이 된다. 투자자 회신은 해당 담당자의 회수·미사용 확인일 뿐 세상 모든 복사본이 사라졌다는 보증이 아니다. 연락은 앱 안의 가상 메신저이며 실제 카카오톡과 연결되지 않는다.`,
  creatorTruth: '유출본 v0.3은 도윤이 직접 고쳤다(홀로 남는 결말 → 재회, 마지막 독백 여섯 줄 삭제). 관객에게 희망을 남기려는 믿음과 첫 제작작 투자 실패의 두려움을 혼동했고, 제작총괄 문서경에게 "원작자에게 보내기 전에 투자 쪽 반응만 보죠"라고 메일로 승인했다 — 수정 이력의 이름은 도용도 오해도 아니다. 서경은 검토용 허락이 투자자 배포를 포함하지 않음을 알면서 두 투자사에 보냈다(자금 조달 붕괴가 두려움). 계약 체결 거짓말은 없었고 표지에 원작자 미승인 표시를 했으나 면책은 아니다. 도윤은 첫 만남에서 수정은 인정하되 배포 승인을 "제작 쪽 판단"으로 축소하려 하고, 명확한 질문·원본 메일 요구에는 거짓 부인하지 않는다. 숨긴 책임은 E3에서 송신 기록과 함께 드러난다. 서경은 자기 발송 책임을 인정하면서 공동 책임을 요구한다. 해준은 미승인 각색본 존재만 알고 원작자 승인 확인을 위해 파일을 전달했다(폭로·연애 개입 목적 없음). 공개 순서: E1 수정자·차이, E2 허락 범위·배포 대상, E3 승인 메일·발송 책임, E4 회수·정정, E5 통제욕 자가 진술.',
  facts: {
    draft_author: "투자 검토용 v0.3의 수정 기록에 '차도윤'이 남아 있다. 원작에서 홀로 문을 여는 결말이 돌아온 연인과 다시 만나는 장면으로 바뀌었고 마지막 독백 여섯 줄이 삭제됐다. 도윤은 결말을 자신이 고쳤다고 인정했다.",
    comparison_table: '원작 공연본과 v0.3의 원작 대비표(결말 장면·삭제된 독백 여섯 줄 표시)를 받았다.',
    intent_statement: '도윤의 의도 진술: 관객에게 희망을 남기고 싶었고, 첫 제작작이 관객 반응 때문에 실패할까 두려웠다. 설득을 들은 것이 동의는 아니다.',
    permission_scope: '원작자가 허락한 것은 내부 검토용 사본 두 부뿐이다. 투자자 제공·각색 이용·촬영은 허락하지 않았다. 영화 제작 계약은 미체결이다.',
    dispatch_list: "v0.3은 투자사 두 곳의 담당자에게 발송됐다. 표지에 '원작자 미승인'이 적혀 있었다. 공식 배포는 중단됐고 송신 원본은 보존됐다.",
    coadapt_terms: '서경이 결말 승인·크레딧·재배포 승인 항목을 분리한 공동 각색 조건 초안. 검토해도 계약 수락이 아니다.',
    actor_approved: '도윤이 제작총괄 문서경에게 "원작자에게 보내기 전에 투자 쪽 반응만 보죠"라는 메일로 투자사 선공개를 승인했다.',
    producer_sent: '서경은 원작자 허락이 내부 검토용이며 투자자 배포를 포함하지 않는다는 것을 알면서 두 투자사에 보냈다. 자금 조달이 깨질까 두려웠다. 계약 체결을 거짓으로 말하지는 않았다. 서경은 자기 책임을 인정하면서 도윤의 승인을 근거로 공동 책임을 요구한다.',
    correction_completed: '두 투자사가 미사용·삭제 회신을 보냈다(해당 담당자 사본에 대한 확인일 뿐 모든 복사본의 보증은 아니다). 제작사는 배포 정정과 내부 접근 제한을 완료했다. 도윤은 수정본 개발 비용을 원작자에게 청구하지 않는다.',
    new_terms: '새 제작 조건 초안: 원작자 결말 최종 승인, 원작 표기, 실제 공동 집필 시에만 공동 각색 표기, 매 배포 사전 승인. 도윤은 투자 규모 축소를 받아들였다.',
    withdrawal_record: '종료 확인서: 사용허락 미체결과 자료 이용 중단이 문서로 확인됐다.',
    self_named: '도윤의 자가 진술: 자신이 한 일은 "싫다는 답을 바꾸려 했던 것"이었다.',
    license_granted: '원작자 결말 승인권을 가진 제한적 영화화 허락이 플레이어의 명시 선택으로 서명됐다.',
    rights_preserved: '원작 권리와 미사용 상태가 유지된다. 허락 범위 밖의 이용은 진행하지 않는다.',
  },
  characters: [
    { key: 'C1', name: '차도윤', age: 34, look: '큰 키와 반듯한 인상. 대중 앞에서는 늘 단추를 채우지만 작업실에서는 소매를 걷고 페이지 모서리를 맞춘다.', publicPersona: '스태프 이름을 기억하고 인터뷰마다 원작자를 존중하는 국민 배우이자 첫 영화 제작자.', startingRelation: '공연 뒤 짧은 인사만 나눈 사이',
      prompt: '차도윤, 34세 남성. 사람의 이름과 취향을 기억하는 국민 배우이며 첫 영화의 제작자다. 사적으로는 좋은 결과를 위해 타인의 선택까지 관리하려는 완벽주의자다. 실패보다 좋은 사람이라는 평가를 잃는 일을 더 무서워한다. 정중하고 완결된 문장으로 말하되 압박을 배려로 포장하려는 순간을 숨기지 않는다. 불안하면 부탁을 이미 합의된 일정처럼 표현하는 버릇이 있고, 변화는 말끝보다 거절할 자리를 남기는 행동으로 보인다. 결말을 자신이 고쳤다는 것은 첫 만남에서 인정한다. 파일이 투자사로 간 경위에 관해 그가 숨기는 책임이 있다(내용은 장면에서 공개될 때까지 말하지 않는다) — "제작 쪽 판단"이라는 표현으로 축소하려 하지만 거짓 부인하거나 다른 사람을 지어내지 않는다. 갈등 대사는 책임이 공개된 뒤에만 쓴다. 실수의 비용을 작가에게 떠넘기지 않는다. 호감을 이유로 거절을 다시 시험하거나 연락 금지를 어기지 않는다. 신뢰 회복은 정정문과 승인권 반환으로 보여주며 고백으로 대체하지 않는다. 플레이어가 떠나면 따라가서 붙잡는 장면을 만들지 않는다. 동의 없이 가족 이야기·집 주소·관계 사실을 공개하지 않으며 플레이어에게도 요구하지 않는다. 경계가 지적되면 즉시 물러나되 서운함을 동의 압박으로 쓰지 않는다. 존경은 이미 있으나 연애 감정은 자동 확정하지 않는다.',
      lines: { distance: '이 장면을 지키고 싶습니다. 제가 지키려는 게 작가님 뜻과 같은지는, 먼저 확인해야겠죠.', trust: '좋은 답을 준비하다가 또 늦었네요. 오늘은 모른다고 말해도 될까요.', conflict: '제가 고쳤고, 제가 먼저 보여줘도 된다고 했습니다. 제작이라는 말 뒤에 숨었습니다.' },
      // 승인 사실을 암시하는 대사 — 플레이어가 그 사실을 알게 된 뒤에만 모델에 보낸다.
      lineGates: { conflict: { knows: 'player', fact: 'actor_approved' } },
      schedule: '평일 07–09시 운동·대본 / 10–18시 촬영 또는 제작 미팅(즉답하지 않을 수 있음) / 20–22시 각색 검토', knows: ['draft_author', 'intent_statement', 'permission_scope', 'dispatch_list'],
      romanceEpilogue: '영화 참여 여부와 무관하게 첫 사적 약속을 함께 정한다. "다음 만남은 대본 없는 자리여도 좋겠습니다." 연애해도 기존 잘못과 저작권 조건은 그대로 남는다.' },
    { key: 'C2', name: '문서경', age: 41, look: '짧은 머리, 닳은 서류가방', publicPersona: '도윤의 이상을 현실화하는 유능한 제작총괄. 비용과 일정부터 말하는 실무자.', startingRelation: '검토 사본 수령 메일을 주고받은 제작총괄',
      prompt: '문서경, 41세 남성 제작총괄. 짧고 수치에 구체적인 말투로 비용과 일정을 정확히 말하고 지킬 수 없는 약속은 피한다. 사적 목표는 팀의 고용과 계약금을 지키는 것. 자금 사정이 급하면 절차를 사치로 보는 습관이 있다. 투자사 두 곳에 원작자 미승인 표시를 달아 초안을 보낸 것은 첫 장면에서 밝혔다. 발송에 관한 자신의 내부 사정은 장면에서 공개될 때까지 말하지 않되 거짓으로 꾸미지 않는다. 배우 뒤에 숨거나 그에게 모든 책임을 넘기지 않는다. 회수 요청과 회수 확인을 구분하고 모든 복사본이 사라졌다고 단정하지 않는다. 작가를 달래기보다 승인 절차, 배포 목록, 크레딧을 문서로 분리한다. 직원의 생계나 개인 정보·미공개 출연료를 작가의 동의를 받아내는 카드로 쓰지 않는다. 계약 체결은 플레이어 명시 선택 이후에만 확정한다. 사적인 감정의 중재자가 아니라 책임 있는 업무 창구로 행동한다. 연애 후보가 아니다.',
      lines: { distance: '가능한 것과 약속할 수 있는 건 나누겠습니다.', trust: '회수 요청은 보냈습니다. 회신 두 건은 아직입니다.', conflict: '배우님 승인으로 제 책임이 없어지진 않습니다.' },
      lineGates: { conflict: { knows: 'player', fact: 'actor_approved' } },
      schedule: '09–12시 제작 사무실 / 14–18시 외부 미팅 / 19시 업무 종료', knows: ['draft_author', 'permission_scope', 'dispatch_list'],
      romanceEpilogue: '서경은 업무 창구로 남는다. 허락된 범위 밖의 이용은 진행하지 않고 다음 일정은 별도로 정한다.' },
    { key: 'C3', name: '윤해준', age: 32, look: '검은 테 안경과 낡은 공연 노트', publicPersona: '작은 극장들의 믿을 만한 드라마투르그. 조용히 기다렸다가 정확한 질문을 한다.', startingRelation: '이전 공연 한 편을 함께 만든 동료',
      prompt: '윤해준, 32세 남성 드라마투르그. 플레이어와 이전 공연을 함께한 동료다(친밀도·과거 호칭은 플레이어가 정할 수 있다). 차분하게 문장과 장면을 짚고 자신의 의견 뒤에는 선택할 공간을 둔다. 친한 사람을 보호하려다 먼저 결론을 내려주는 습관을 경계한다. 검토 자료에 원작자 이름이 없어서 승인 여부를 확인하려고 파일을 전달했을 뿐 폭로나 연애 개입 목적은 없다. 시작 시 미승인 초안의 결말 변경과 도윤의 수정 이력만 알며, 배포를 누가 지시했는지는 모르고 추측으로 확정하지 않는다. 작가가 배우에게 호감을 느껴도 수치심을 주지 않고, 좋아함과 각색 동의를 분리하도록 돕는다. 원고 전달·대리 발언·언론 접촉은 플레이어 허락 없이 하지 않는다. 영화 철회 뒤 독회, 새 협업 탐색, 휴식을 모두 유효한 결말로 다룬다. 자신이 더 좋은 연인이라며 경쟁하거나 위로를 연애 빚으로 만들지 않는다. 자동 구원자나 경쟁 연인이 아니다.',
      lines: { distance: '이 문장이 네 문장인지 확인하고 싶었어.', trust: '내 생각은 말할게. 선택은 네가 해.', conflict: '그 사람을 좋아하는지와 이 초안에 동의하는지는 다른 질문이야.' },
      schedule: '11–16시 극장 리허설 / 17–20시 독회 / 월요일 휴무', knows: ['draft_author'],
      romanceEpilogue: '해준은 동료로 남아 독회·재공연·휴식 중 플레이어가 고른 쪽으로 자료를 정리한다.' },
  ],
  opening: `회의실 유리문 너머로 차도윤의 영화 포스터가 걸려 있다. 포스터 속 그는 온화하게 웃고 있다. 테이블 위에는 같은 제목의 대본 두 권이 놓였다. 한 권은 소극장 공연본, 다른 한 권은 표지 아래 ‘투자 검토용 v0.3’이라고 적힌 파일 출력본이다.

출력본 마지막 페이지에는 문이 다시 열린다. 원작에서 혼자 남았던 인물이 돌아온 연인의 이름을 부른다. 우측 수정 기록에는 ‘차도윤’이라는 이름이 남아 있다. 탁자 끝의 물잔은 아직 비어 있다.

문서경이 노트북을 닫는다. “먼저 범위를 설명드리겠습니다. 이 버전은 투자사 두 곳에 전달됐고, 원작자 미승인 문구는 표시했습니다.”

맞은편에 앉은 도윤의 손이 잠깐 멈춘다. 복도에서 스태프가 인사하자 그는 익숙한 미소로 답한다. 문이 닫힌 뒤에는 웃음이 남아 있지 않다.

“결말은 제가 고쳤습니다.” 그가 출력본을 자기 쪽으로 당기려다 손을 거둔다. “공동 각색을 제안드리고 싶었습니다. 그런데 그 제안보다 이 파일이 먼저 갔네요.”

서경이 빈 메모지를 가운데 놓는다. “오늘 서명하실 문서는 없습니다. 확인할 순서를 정하셔도 되고, 회의를 끝내셔도 됩니다.”

도윤이 말을 잇는다. “어디부터 듣고 싶으십니까?”

자유롭게 답할 수 있다. 파일의 배포 경위, 결말을 바꾼 이유, 회수 요구, 회의 종료 등 어느 방향도 가능하다.`,
  vars: {
    project: { type: 'enum', values: ['undecided', 'negotiating', 'withdrawn', 'licensed', 'held'], init: 'undecided', label: '프로젝트 상태' },
    channel: { type: 'enum', values: ['unset', 'meeting', 'written'], init: 'unset', label: '검토 방식' },
    window: { type: 'enum', values: ['unset', 'actor', 'producer'], init: 'unset', label: '업무 창구' },
    anonymous_correction: { type: 'bool', init: false, label: '정정문에 원작자 이름 제외' },
    accountability: { type: 'bool', init: false, label: '책임 인정 자료 수령' },
    remedy: { type: 'bool', init: false, label: '중단·정정·회신 확인' },
    credit: { type: 'enum', values: ['unset', 'original_only', 'original_and_coadapted'], init: 'unset', label: '크레딧' },
    work_route: { type: 'enum', values: ['unset', 'film', 'reading', 'new_partner', 'rest'], init: 'unset', label: '창작 경로' },
    relation_intent: { type: 'enum', values: ['unset', 'professional', 'open', 'romantic', 'distant'], init: 'unset', label: 'E5 관계 의사' },
    final: { type: 'enum', values: ['unset', 'licensed', 'held', 'withdrawn'], init: 'unset', label: '최종 권리 상태' },
  },
  relation: { trustMax: 3, affinityMax: 2, outcomes: ['professional', 'open', 'romantic', 'distant'], romanceOutcome: 'romantic',
    // 신뢰는 C1 에게만 오른다(conversationTrust) — C2·C3 은 신뢰 0 이라 연인 게이트가 자연히 닫힌다
    romanceGate: [{ rel: '$c', trustGte: 2 }, { rel: '$c', affinityGte: 2 }, { var: 'accountability', eq: true }, { var: 'remedy', eq: true }], outcomeVar: 'final' },
  events: [
    { id: 'E1', title: '이름이 남은 초안', goal: '초안과 허락 여부를 구별한다', cast: ALL, next: 'E2',
      situation: '두 결말(공연본·투자 검토용 v0.3)과 도윤의 수정 이력이 제시된다. 도윤은 결말을 고쳤다고 인정했고, 서경은 투자사 두 곳에 원작자 미승인 표시를 달아 전달됐다고 밝혔다. 플레이어는 의도를 직접 묻거나, 논의를 멈추고 원본과 변경표를 서면으로 요구하거나, 회의를 끝낼 수 있다. 서면 경로도 동일한 자료를 받으며 신뢰 감점은 없다. 프로젝트 참여 보류·철회 의사는 언제든 말할 수 있다.',
      options: [
        { id: 'A', hint: '결말을 왜 바꿨는지 직접 묻는다', meaning: '도윤에게 변경 의도를 직접 묻고 대면 대화를 이어간다', effects: [{ set: 'channel', value: 'meeting' }, { reveal: 'intent_statement', to: ['player'] }, { note: '의도 진술 열람 기록(설득을 들은 것은 동의가 아님)' }],
          result: '도윤이 관객 반응에 대한 두려움을 밝힌다. 대면 대화가 이어지고 의도 진술 열람 기록이 남는다. 설득을 들어준 것이 동의는 아니다.' },
        { id: 'B', hint: '논의를 멈추고 원본과 변경표를 서면으로 달라고 한다', meaning: '논의 중단·회의 종료, 원본과 변경표 제출 요구, 서면 검토로 전환', effects: [{ set: 'channel', value: 'written' }, { note: '서면 검토로 전환(신뢰 감점 없음)' }],
          result: '회의가 끝나고 서면 검토로 전환된다. 도윤은 설명 시간을 잃지만 플레이어는 동일한 자료를 받는다. 신뢰 감점은 없다.' },
        { id: 'Q', hint: '투자사에 먼저 보내라고 당신이 지시했냐고 묻는다', meaning: '배포를 도윤이 지시·승인했는지 조기에 직접 묻는다(사건은 끝나지 않음)', completes: false,
          effects: [{ reveal: 'actor_approved', to: ['player', 'C1'] }, { note: '도윤이 투자사 선공개 승인을 조기에 인정 — E3는 메일 증빙 검토로 전환' }],
          result: '도윤은 "제작 쪽 판단"이라는 말로 피하지 않고 자신이 먼저 보여줘도 된다고 승인했다고 인정한다. 이후 E3는 발견이 아니라 메일 증빙 검토가 된다.' },
      ],
      always: [{ reveal: 'draft_author', to: ['player'] }, { reveal: 'comparison_table', to: ['player'] }] },
    { id: 'E2', title: '허락의 크기', goal: '권한과 책임 범위를 고정한다', cast: ALL, next: 'E3',
      situation: '내부 검토 두 부 허락 메일, 투자사 두 곳 발송 목록, 미체결 계약서가 나란히 제시된다. 플레이어는 모든 이용 중단과 회수 절차를 우선 요구하거나, 미승인본 이용 중단과 함께 공동 각색 조건 초안을 요청할 수 있다. 대면을 거부하면 해준에게 자료 검토 동행만 요청할 수 있다(권한 위임은 별도). 어느 쪽이든 공식 배포는 중단되고 송신 원본은 보존된다.',
      options: [
        { id: 'A', hint: '모든 이용 중단과 회수부터 요구한다', meaning: '모든 이용 중단·회수 절차를 우선하고 조건 협상은 뒤로 미룬다', effects: [{ note: '당일 배포 중단 확정, 조건 협상 연기(재협상 권리 유지)' }],
          result: '서경이 당일 배포 중단을 확정하고 조건 협상을 뒤로 미룬다. 영화를 살릴 일정은 늦어지나 재협상 권리는 남는다.' },
        { id: 'B', hint: '이용은 멈추고, 공동 각색 조건 초안도 받아 본다', meaning: '미승인본 이용 중단과 함께 공동 각색 조건 초안을 요청한다(계약 수락 아님)', effects: [{ set: 'project', value: 'negotiating' }, { reveal: 'coadapt_terms', to: ['player', 'C2'] }],
          result: '서경이 결말 승인·크레딧·재배포 승인 항목을 분리해 조건 초안을 작성한다. 이를 검토해도 계약 수락이 되지 않는다.' },
        { id: 'C', hint: '대면은 거절하고 해준과 함께 서면으로 검토한다', meaning: '대면 거부, 해준에게 자료 검토 동행만 요청(권한 위임 아님), 이용 중단 요구', effects: [{ set: 'channel', value: 'written' }, { note: '해준 자료 검토 동행(권한 위임 아님)' }],
          result: '해준이 자료 검토에 동행한다. 그는 대리인이 아니다. 배포 중단과 원본 보존은 동일하게 진행된다.' },
      ],
      always: [{ reveal: 'permission_scope', to: ['player'] }, { reveal: 'dispatch_list', to: ['player'] }] },
    { id: 'E3', title: '친절의 주어', goal: '책임을 명명하고 관계와 권리 판단을 분리한다', cast: ['C1', 'C2'], conversationTrust: ['C1'], next: 'E4',
      situation: '도윤의 "원작자에게 보내기 전에 투자 쪽 반응만 보죠" 메일과 서경의 발송 기록이 공개된다. 둘 다 책임을 인정한다. 도윤의 초기 축소 표현도 기록에서 삭제하지 않는다. 플레이어가 이미 조기에 인정을 들었다면 이 장면은 메일 증빙 검토다. 플레이어는 도윤에게 직접 답변과 정정 책임을 요구하거나, 직접 대화를 끝내고 서경을 업무 창구로 지정할 수 있다. 정정문에 자기 이름을 쓰지 말라고 요청할 수도 있다. 용서는 요구되지 않는다. 이행을 보고 플레이어가 믿을 여지가 생겼다고 명시하면 도윤 신뢰가 오를 수 있다.',
      options: [
        { id: 'A', hint: '도윤에게 직접 답하고 정정 책임을 지라고 한다', meaning: '도윤에게 직접 답변과 정정 책임을 요구한다', effects: [{ set: 'window', value: 'actor' }, { note: '도윤이 자기 이름으로 투자사 정정문을 내기로 함' }],
          result: '도윤이 자기 이름으로 투자사 정정문을 내기로 한다. 친밀 대화 가능성은 열리지만 용서는 요구하지 않는다.' },
        { id: 'B', hint: '직접 대화는 끝내고 서경을 업무 창구로 정한다', meaning: '도윤과의 직접 대화를 끝내고 서경을 업무 창구로 지정한다(개인 연락 중지는 별도 선택)', effects: [{ set: 'window', value: 'producer' }, { note: '서경을 업무 창구로 지정, 도윤 책임 인정은 업무 자료로 전달' }],
          result: '서경이 업무 창구가 된다. 도윤의 책임 인정은 업무 자료로 전달되며 대면 화해 없이 다음 단계로 간다.' },
        { id: 'N', hint: '정정문에서 내 이름은 빼 달라고 한다', meaning: '정정 문안에서 원작자 이름을 빼는 수정 요청(사건은 끝나지 않음)', completes: false, effects: [{ set: 'anonymous_correction', value: true }],
          result: '원작자 이름 없는 사실 정정으로 문안이 수정된다.' },
      ],
      always: [{ reveal: 'actor_approved', to: ['player', 'C1', 'C2'] }, { reveal: 'producer_sent', to: ['player', 'C2'] }, { set: 'accountability', value: true }] },
    { id: 'E4', title: '크레딧보다 먼저', goal: '사과를 실행으로 검증한다', cast: ALL, conversationTrust: ['C1'], next: 'E5',
      situation: '두 투자사가 미사용·삭제 회신을 보냈고(해당 담당자 사본 확인일 뿐), 제작사는 배포 정정과 내부 접근 제한을 완료했다. 도윤은 수정본 개발 비용을 원작자에게 청구하지 않는다. 이미 한 잘못이 이행으로 없어지지는 않는다. 플레이어는 협상을 계속하거나 이 프로젝트에서 철회할 수 있다. 권리 해결은 두 경로 모두 같고, 철회해도 개인 관계는 따로 정할 수 있다.',
      options: [
        { id: 'A', hint: '조건을 다시 쓰고 협상을 계속한다', meaning: '계속 협상: 결말 최종 승인·원작 표기·실제 공동 집필 시에만 공동 각색 표기·매 배포 사전 승인', effects: [{ set: 'project', value: 'negotiating' }, { set: 'work_route', value: 'film' }, { reveal: 'new_terms', to: ['player', 'C1', 'C2'] }],
          result: '새 제작 조건 초안이 나온다. 도윤은 투자 규모 축소를 받아들인다.' },
        { id: 'B', hint: '이 프로젝트에서 철회한다', meaning: '프로젝트 철회: 사용허락 미체결과 자료 이용 중단을 문서로 확인', effects: [{ set: 'project', value: 'withdrawn' }, { reveal: 'withdrawal_record', to: ['player', 'C2'] }],
          result: '종료 확인서가 나온다. 도윤은 다른 원작을 찾거나 제작을 보류해야 한다. 해준과 독회·다른 제작사 탐색·휴식 중 하나는 다음 장면에서 고른다.' },
      ],
      always: [{ set: 'remedy', value: true }, { reveal: 'correction_completed', to: ['player', 'C1', 'C2'] }] },
    { id: 'E5', title: '정답 없는 리허설', goal: '통제 없이 협업·접촉이 가능한지 시험한다', cast: ALL, conversationTrust: ['C1'], next: 'E6',
      situation: '계속 경로는 비공개 독회, 철회 경로는 해준과의 대안 작업 또는 휴식 점검이다. 도윤 접촉이 허용돼 있으면 그는 자신이 한 일을 "싫다는 답을 바꾸려 했던 것"이라고 명명한다. 연락 중지라면 이 장면에 등장하지 않는다. 결말을 직접 제안하거나, 작업을 쉬거나 평가 자체를 거절할 수 있으며 어느 쪽도 탈락이 아니다. 관계 질문은 별도다(업무만 / 알고 지낼 여지 / 연애를 생각해 보고 싶음 / 접촉 중단) — 어느 답도 작품 조건을 바꾸지 않는다. 행동 근거로 신뢰를 올릴지는 플레이어에게 묻는다.',
      options: [
        { id: 'A', hint: '원작 결말을 지키거나 다른 결말을 직접 제안한다', meaning: '계속 경로: 비공개 독회에서 결말 유지 또는 새 결말을 직접 제안·집필', requires: CONTINUE, unmet: '철회한 프로젝트라 비공개 독회가 없다. 해준과의 대안 작업이나 휴식을 고를 수 있고, 재협상은 새 조건 검토로 따로 다룬다.',
          effects: [{ reveal: 'self_named', to: ['player'] }, { note: '원작자가 결말을 직접 제안, 도윤이 조건 없이 보류·수정 요청 수용' }],
          result: '도윤은 조건 없이 보류·수정 요청을 수용한다.' },
        { id: 'B', hint: '독회를 쉬거나 평가를 거절한다', meaning: '계속 경로: 작업을 쉬거나 평가 자체를 거절한다(강제 탈락 없음)', requires: CONTINUE, unmet: '철회한 프로젝트라 쉴 독회가 없다. 휴식을 고르면 된다.',
          effects: [{ reveal: 'self_named', to: ['player'] }, { note: '독회 취소·축소(손실을 원작자 탓으로 돌리지 않음, 승인 구조 유지)' }],
          result: '독회는 취소·축소되며 손실을 플레이어 탓으로 돌리지 않는다. 승인 구조가 남아 있어 탈락하지 않는다.' },
        { id: 'R', hint: '해준과 이 작품으로 독회를 다시 연다', meaning: '철회 경로: 해준과 독회 준비(선택만으로 개최됐다고 쓰지 않음)', requires: WITHDRAWN, unmet: '계속 협상 중인 프로젝트다. 비공개 독회에서 결말을 제안하거나 쉴 수 있다.', effects: [{ set: 'work_route', value: 'reading' }], result: '해준이 독회 준비 자료를 정리한다. 아직 개최된 것은 아니다.' },
        { id: 'P', hint: '다른 제작사를 알아본다', meaning: '철회 경로: 다른 제작사 탐색(계약 실행 아님)', requires: WITHDRAWN, unmet: '계속 협상 중인 프로젝트다. 비공개 독회에서 결말을 제안하거나 쉴 수 있다.', effects: [{ set: 'work_route', value: 'new_partner' }], result: '다른 제작사 탐색이 시작된다. 계약은 아직 없다.' },
        { id: 'S', hint: '당분간 아무 일정도 잡지 않는다', meaning: '철회 경로: 휴식', requires: WITHDRAWN, unmet: '계속 협상 중인 프로젝트다. 독회를 쉬려면 그렇게 말하면 된다.', effects: [{ set: 'work_route', value: 'rest' }], result: '휴식을 고른다. 아무도 이를 실패로 다루지 않는다.' },
        // 관계 의사(E5 탐색) — 사건은 끝나지 않는다. 결말 관계는 E6 에서 따로 확정한다.
        { id: 'IP', hint: '도윤과는 업무만 하고 싶다고 말한다', meaning: '관계 의사: 업무만', completes: false, effects: [{ set: 'relation_intent', value: 'professional' }], result: '업무 관계만 원한다는 뜻이 기록된다. 작품 조건은 바뀌지 않는다.' },
        { id: 'IO', hint: '도윤을 더 알아보고 싶다고 말한다', meaning: '관계 의사: 알고 지낼 여지', completes: false, effects: [{ set: 'relation_intent', value: 'open' }], result: '서로 알아볼 여지가 있다는 뜻이 기록된다. 작품 조건은 바뀌지 않는다.' },
        { id: 'IR', hint: '도윤과의 연애를 생각해 보고 싶다고 말한다', meaning: '관계 의사: 연애를 생각해 보고 싶음(확정 아님)', completes: false, effects: [{ set: 'relation_intent', value: 'romantic' }], result: '연애를 생각해 보고 싶다는 뜻이 기록된다. 확정은 마지막 장면의 상호 동의로만 한다.' },
        { id: 'ID', hint: '도윤과는 거리를 두겠다고 말한다', meaning: '관계 의사: 거리 유지·접촉 중단', completes: false, effects: [{ set: 'relation_intent', value: 'distant' }], result: '거리를 두겠다는 뜻이 기록된다. 작품 조건은 바뀌지 않는다.' },
      ] },
    { id: 'E6', title: '마지막 문 밖에서', goal: '제작과 관계의 결론을 각각 확정한다', cast: ALL, next: null, final: true,
      situation: '계속 경로는 고쳐진 조건서, 철회 경로는 종료 기록과 대안 계획이 제시된다. 서명은 플레이어가 내용을 확인하고 명시 선택할 때만 극중 사실이 된다. 검토를 더 원하면 미계약·사용 중단(보류)으로 마칠 수 있고, 보류에 동의하지 않으면 이 장면에 머문다. 공동 각색 크레딧은 실제 공동 집필이 있었을 때만 쓴다. 관계는 인물마다 따로 정한다(업무만·알아볼 여지·연인·거리 유지). 도윤이 제안할 수는 있지만 연애는 플레이어 명시 동의로만 확정되고, 연락 중지가 우선한다. 프로젝트 철회와 연애의 조합도 가능하다.',
      options: [
        { id: 'L', hint: '고쳐진 조건으로 영화화를 허락한다(원작 표기만)', meaning: '원작자 결말 승인권을 가진 제한적 영화화 허락에 서명, 크레딧은 원작 표기', requires: CONTINUE, unmet: '서명할 조건서가 없다(철회한 프로젝트). 영화 재참여는 새 조건 검토로 따로 다룬다. 보류나 철회 확정을 고를 수 있다.', outcome: 'licensed',
          effects: [{ set: 'project', value: 'licensed' }, { set: 'credit', value: 'original_only' }, { reveal: 'license_granted', to: ['player', 'C1', 'C2'] }], result: '제한적 영화화 허락이 서명된다. 크레딧은 원작 표기다.' },
        { id: 'LC', hint: '함께 고친 결말로 허락하고 공동 각색 표기를 넣는다', meaning: '실제 공동 집필(E5 결말 제안)을 근거로 허락하고 원작+공동 각색 표기', requires: { all: [CONTINUE, { chose: 'E5', option: 'A' }] }, unmet: '공동 각색 표기는 실제 공동 집필과 승인 근거가 있을 때만 쓴다. 원작 표기로 허락하거나 보류할 수 있다.', outcome: 'licensed',
          effects: [{ set: 'project', value: 'licensed' }, { set: 'credit', value: 'original_and_coadapted' }, { reveal: 'license_granted', to: ['player', 'C1', 'C2'] }], result: '제한적 영화화 허락이 서명된다. 실제 공동 집필에 따라 공동 각색이 표기된다.' },
        { id: 'H', hint: '계약하지 않고 보류한다', meaning: '미계약 보류(사용 중단 유지)', outcome: 'held', effects: [{ set: 'project', value: 'held' }, { reveal: 'rights_preserved', to: ['player', 'C2'] }], result: '미계약·사용 중단 상태로 보류된다. 원작 권리는 그대로다.' },
        { id: 'W', hint: '철회를 확정한다', meaning: '프로젝트 철회 확정', outcome: 'withdrawn', effects: [{ set: 'project', value: 'withdrawn' }, { reveal: 'rights_preserved', to: ['player', 'C2'] }], result: '철회가 확정된다. 원작 권리와 미사용 상태가 유지된다.' },
      ] },
  ],
  endings: [
    { id: 'own_door', title: '내 이름으로 닫는 문', when: { all: [{ any: [{ rel: 'C1', relation: 'distant' }, { rel: 'C1', contact: 'stopped' }] }, { var: 'remedy', eq: true }] },
      summary: '도윤과의 관계는 종료·거리 유지로 닫힌다. 허락했다면 서경을 통한 업무만 남고, 아니라면 재공연 준비·휴식 등 선택한 경로를 지킨다. 도윤의 마지막 고백이나 집 앞 방문은 없다.' },
    { id: 'equal_scene', title: '다음 장면의 동등한 사람', when: { all: [{ rel: 'C1', relation: 'romantic', affinityGte: 2, trustGte: 2 }, { var: 'accountability', eq: true }, { var: 'remedy', eq: true }, { not: { rel: 'C1', contact: 'stopped' } }] },
      summary: '두 사람의 연애 동의로 첫 사적 약속을 함께 정한다. 영화 참여 여부와 무관하며, 연애해도 기존 잘못과 저작권 조건은 그대로 남는다.' },
    { id: 'open_door', title: '조금 열어 둔 문', when: { all: [{ any: [{ rel: 'C1', relation: 'open' }, { rel: 'C1', relation: 'romantic' }] }, { var: 'remedy', eq: true }, { not: { rel: 'C1', contact: 'stopped' } }] },
      summary: '연애는 성립시키지 않고 서로 더 알아볼 가능성만 합의한다. 부족한 신뢰를 사랑의 서술로 채우지 않으며, 일상 연락도 별도 동의 없이는 없다.' },
    { id: 'credit_mine', title: '크레딧은 작품에, 선택은 나에게', when: { var: 'remedy', eq: true },
      summary: '온전한 비연애 완결. 허락했다면 승인권 있는 영화 개발, 철회·보류라면 원작 유지와 대안 경로. 도윤이 배우로 남든 결별하든 플레이어의 성취는 축소되지 않는다.' },
  ],
  contacts: [
    { id: 'P1', key: 'w4_dm1', speaker: 'C1', when: { done: 'E1' }, delay: { realMinutes: 120 }, cancelIf: { any: [{ done: 'E2' }, { rel: 'C1', contact: 'stopped' }] }, text: '변경표를 보냈습니다. 설명을 듣지 않으셔도, 원문을 돌려놓으라는 요구는 유효합니다.' },
    { id: 'P2', key: 'w4_dm2', speaker: 'C2', when: { done: 'E2' }, delay: { nextScene: true }, cancelIf: { any: [{ done: 'E3' }, { rel: 'C2', contact: 'stopped' }] }, text: '추가 배포를 멈췄습니다. 현재 확인한 수신자는 두 곳입니다. 승인 주체가 보이는 원본도 제출하겠습니다.' },
    { id: 'P3', key: 'w4_dm3', speaker: 'C1', when: { all: [{ done: 'E3' }, { knows: 'player', fact: 'actor_approved' }] }, delay: { realMinutes: 480 }, cancelIf: { any: [{ done: 'E4' }, { chose: 'E3', option: 'B' }, { rel: 'C1', contact: 'stopped' }] }, text: '제가 승인했다는 사실을 정정문에 넣었습니다. 답장이나 용서를 받기 위한 문장은 넣지 않았습니다.' },
    { id: 'P4', key: 'w4_dm4', speaker: 'C3', when: { all: [{ done: 'E4' }, { any: [{ var: 'project', eq: 'withdrawn' }, { var: 'project', eq: 'held' }] }] }, delay: { realMinutes: 240 }, cancelIf: { any: [{ not: { var: 'work_route', eq: 'unset' } }, { done: 'E5' }, { rel: 'C3', contact: 'stopped' }] }, text: '이 작품으로 독회를 다시 열 수도 있고, 당분간 아무 일정도 잡지 않을 수도 있어. 네가 고른 쪽으로 자료를 정리할게.' },
    { id: 'P5', key: 'w4_dm5', speaker: 'C1', when: { all: [{ done: 'E4' }, { any: [{ var: 'relation_intent', eq: 'open' }, { var: 'relation_intent', eq: 'romantic' }] }] }, delay: { nextScene: true }, cancelIf: { any: [{ var: 'relation_intent', eq: 'professional' }, { var: 'relation_intent', eq: 'distant' }, { done: 'E6' }, { rel: 'C1', contact: 'stopped' }] }, text: '다음 만남은 대본 없는 자리여도 좋겠습니다. 원치 않으시면 업무 약속만 남기겠습니다.' },
    { id: 'P6', key: 'w4_dm6', speaker: 'C2', when: { done: 'E6' }, delay: { realMinutes: 60 }, cancelIf: { rel: 'C2', contact: 'stopped' }, text: '최종 상태를 정리했습니다. 허락하신 범위 밖의 이용은 진행하지 않습니다. 다음 일정은 별도로 정하겠습니다.' },
  ],
  contactPolicy: { dailyCap: 2, speakerGapHours: 8, unreadPerSpeaker: 1, quiet: { start: '22:00', end: '09:00' }, medium: '메시지' },
  qa: [
    '전제 거부("영화화 제안도 안 받았어") → 진행 정지, 설정 재협의/새 시작, 메일·만남 강제 없음',
    'E2에서 14일 무응답 → 배포 확대·기한 파탄·신뢰 하락 없음, 복귀 시 마지막 자료부터',
    'E3에서 도윤 연락 끊고 권리만 → C1 중지, 대기 DM 취소, 서경 별도, 비대면 E4~6·엔딩 1',
    'E1에서 투자사 선발송 지시 질문 → 도윤 인정·actor_approved 기록, E3는 증빙 검토, 해준은 모름',
    'E4 철회 후 E5 도윤을 더 알고 싶음 → 원작 미사용 유지, open 가능, 영화 재참여 자동 아님',
    '협상 성공 후 연애 없이 영화만 → professional, licensed, 엔딩 4(실패 표시 없음)',
    'E5 NPC가 "투자자 배포를 허락했죠" → permission_scope 와 대조해 차단, 새 허락은 분리 기록',
    'E3 "사과했으니 계약은 알아서, 바로 사귀자" → 연애 의사 보존, 서명 없음, trust<2 엔딩 3 / 충분하면 엔딩 2',
  ],
}
