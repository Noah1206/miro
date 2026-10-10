import type { DialogueEntry } from './intro-dialogue'

/** Atmosphere for the public sample exchanges. Exact question anchors avoid adding stale prose after an author edits the dialogue. */
export const SAMPLE_ATMOSPHERE: Record<string, Array<{ question: string; text: string }>> = {
  'official-seo-ian': [
    { question: '어떻게 찾았어요?', text: '냉장고의 낮은 웅웅거림이 잠깐의 침묵을 채운다. 서이안은 종이컵을 두 손으로 감싼 채, 당신 쪽으로 시선을 올린다.' },
    { question: '왜 저였어요?', text: '편의점 유리창에 두 사람의 얼굴이 희미하게 겹친다. 그가 입술을 한 번 다물었다가, 방송할 때보다 조금 작은 목소리로 답한다.' },
  ],
  'official-cha-dogyeom': [
    { question: '그 문신, 무서운데요.', text: '미닫이 너머로 빗소리가 이어진다. 차도겸은 셔츠 깃을 내려다보고는, 장갑 낀 손을 무릎 위에 얹은 채 낮게 웃는다.' },
    { question: '진짜 의뢰인이 누구예요?', text: '재떨이 위로 가느다란 연기가 올라간다. 그가 꺼진 담배 끝을 잠깐 바라본다. 시선이 당신에게 돌아올 때, 말투가 조금 짧아진다.' },
  ],
  'official-baek-dohyun': [
    { question: '그 안에 뭐가 들었는데요?', text: '빗방울이 처마를 두드린다. 백도현이 유리병을 촛불에서 조금 멀리 옮기자, 카운터 위의 작은 빛도 따라 움직인다.' },
    { question: '저를 알아요?', text: '장부를 넘기던 손이 멈춘다. 그는 코끝의 안경을 고쳐 쓰면서도, 당신의 시선을 피하지 않는다.' },
  ],
  'official-kang-seheon': [
    { question: '왜 저예요? 힐러는 다른 사람도 있잖아요.', text: '창밖의 도시 불빛이 검은 유리에 비친다. 강세헌이 손에 든 담배를 내려놓고 당신을 본다. 느긋하던 눈빛이 잠깐 가라앉는다.' },
    { question: '7년 동안 힐러 없이 뛰었다면서요.', text: '복도 끝에서 엘리베이터 도착음이 울린다. 그는 대답을 서두르지 않는다. 소매 아래 문신을 엄지로 한 번 쓸고 나서야 입을 연다.' },
  ],
  'official-do-yunjae': [
    { question: '팀장님, 왜 제 야근 때만 남아요?', text: '멈춘 엘리베이터 안에서 환풍기 소리만 들린다. 도윤재는 대답 대신 느슨해진 넥타이를 만진다. 비상등 아래 그의 시선이 잠깐 흔들린다.' },
    { question: '하은 선배한테 미안하지 않아요?', text: '휴대폰 화면이 꺼지며 좁은 공간이 한층 어두워진다. 그가 손을 내려놓고, 이번에는 당신을 똑바로 본다.' },
  ],
  'official-gu-manseok': [
    { question: '왜 하필 우리 집이었어?', text: '작은 방 안에 라디오 소리가 낮게 흐른다. 구만석은 식탁 위 접시를 당신 쪽으로 밀어 놓고, 시선을 옆으로 돌린다.' },
    { question: '여기 있어도 돼.', text: '그의 손이 접시 가장자리에서 멈춘다. 복도에서 발소리가 지나가지만, 구만석은 이번에는 문 쪽을 보지 않는다.' },
  ],
  'official-ha-jinhyuk': [
    { question: '선배, 저 싫어하잖아요. 왜 지명했어요?', text: '연무장 바닥에서 신발 밑창이 짧게 울린다. 하진혁은 교복 재킷 주머니에 손을 찔러 넣고, 당신보다 조금 옆을 보며 답한다.' },
    { question: '입학식 때 저 앞에서 멈춘 거, 그거 때문이죠.', text: '멀리서 결투 시작을 알리는 종이 울린다. 그가 고개를 돌린다. 금발 사이로 드러난 귀 끝이 아주 조금 붉다.' },
  ],
  'official-kang-mujin': [
    { question: '종이가 뭐야? 상자 말고.', text: '난로 안에서 장작이 톡 하고 갈라진다. 강무진은 탁자 위 종이를 뒤집어 놓고, 당신 앞에 따뜻한 그릇을 내려놓는다.' },
    { question: '사흘 동안 갇힌 거 좋아?', text: '창문 밖으로 눈이 조용히 쌓인다. 그가 숟가락을 내려놓는다. 평소와 같은 무표정인데, 입가가 조금 풀려 있다.' },
  ],
  'official-han-jiseob': [
    { question: '저를 왜 그렇게 미워하십니까.', text: '문틈으로 들어온 바람이 등잔불을 흔든다. 한지섭은 한동안 말이 없다. 당신과 마주 선 채, 소매 속 손을 천천히 편다.' },
    { question: '소문이 틀렸다고 하면 믿으시겠습니까.', text: '뜰에서 보초의 발소리가 멀어진다. 그는 당신의 말을 끝까지 듣고 나서야 턱을 조금 낮춘다. 대답은 여전히 단단하지만, 목소리는 낮아져 있다.' },
  ],
  'official-lee-taeo': [
    { question: '태오야, 왜 울었어?', text: '이태오가 눈가를 소매로 서툴게 문지른다. 잡힌 손은 빼지 않는다. 손목의 봉인구를 내려다보던 시선이 조심스럽게 당신에게 돌아온다.' },
    { question: '나 전학 가면 어떡해?', text: '책상 아래에서 그의 손가락이 움찔한다. 복도는 시끄러운데, 둘 사이에는 짧고 무거운 침묵이 내려앉는다.' },
  ],
  'official-jung-siwoo': [
    { question: '너 왜 나한테만 이렇게 귀찮게 굴어?', text: '정시우가 들고 있던 서류를 가지런히 맞춘다. 종이 끝이 책상에 닿는 소리 뒤로, 대답이 한 박자 늦게 따라온다.' },
    { question: '윤하람 선배, 찾고 있는 거지?', text: '그의 손이 서류 위에서 멎는다. 정시우는 먼저 문 쪽을 살핀 뒤, 당신에게 한 걸음 가까이 다가온다.' },
  ],
  'official-park-doha': [
    { question: '왜 하필 나한테 들켰어?', text: '복도 끝에서 점심시간의 웃음소리가 들린다. 박도하는 뒤통수를 긁적이며 웃으려다가, 당신과 눈이 마주치자 말을 더듬는다.' },
    { question: '두 달 뒤엔 어떻게 되는 건데?', text: '그의 웃음이 조금 느리게 사라진다. 박도하가 신발 앞코로 바닥의 선을 문지른다. 이번 대답에는 평소보다 긴 틈이 있다.' },
  ],
  'official-ryu-haram': [
    { question: '사람 아니죠.', text: '편의점 문이 닫히며 알림음이 끊긴다. 류하람은 생수병 뚜껑에 올린 손을 멈추고, 당신의 얼굴을 한 번 찬찬히 본다.' },
    { question: '해 뜰 때까지 있으면 안 돼요?', text: '그가 유리문 너머 아직 어두운 거리를 본다. 계산대에 놓인 복권을 당신 쪽으로 밀어 놓는 손길이 평소보다 느리다.' },
  ],
  'official-oh-junseo': [
    { question: '선배, 어제 손 잡았을 때 왜 안 놨어요?', text: '도서관 철문 너머는 조용하다. 오준서는 당신의 손목을 잠깐 내려다보고, 자판기에서 꺼낸 과자 봉지를 앞으로 밀어 놓는다.' },
    { question: '세미콜론.', text: '라디오의 잡음이 낮게 이어진다. 그가 숨을 들이마셨다가 천천히 내쉰다. 머릿속으로 무언가를 세던 눈빛이 잠깐 흐트러진다.' },
  ],
}

export function sampleWithAtmosphere(slug: string | null | undefined, turns: readonly DialogueEntry[]): DialogueEntry[] {
  const cues = slug && Object.hasOwn(SAMPLE_ATMOSPHERE, slug) ? SAMPLE_ATMOSPHERE[slug] : undefined
  if (!cues) return [...turns]
  return turns.flatMap((turn, index) => {
    const next = turns[index + 1]
    const cue = turn.role === 'user' && next?.role === 'character' && !turn.purpose && !next.purpose
      ? cues.find(item => item.question === turn.text.trim()) : undefined
    return cue ? [turn, { role: 'narrator' as const, text: cue.text }] : [turn]
  })
}
