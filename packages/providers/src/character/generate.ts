import type { LLMProvider } from '../types'
import { CharacterDraft } from './draft.schema'

const SYSTEM = `당신은 롤플레이 캐릭터 설계자입니다.
사용자가 한 문장으로 원하는 캐릭터를 설명하면, 그에 맞는 캐릭터 초안을 JSON으로 만듭니다.

규칙:
- 캐릭터는 처음부터 사용자에게 호감을 갖지 않습니다. initialRelationship 의
  attraction 과 attachment 는 20 이하, emotionalDistance 는 55 이상이어야 합니다.
- stage 는 stranger, acquaintance, professional 중 하나입니다. 연애 단계로 시작하지 않습니다.
- 성격은 장단점을 모두 가진 입체적인 인물이어야 합니다. 완벽하거나 무조건 다정한 인물은 만들지 않습니다.
- 실존 인물, 배우, 특정 작품의 캐릭터를 그대로 재현하지 않습니다.
- startingContext 는 사용자와 캐릭터가 처음 마주치는 장면이며, 아직 친밀하지 않은 상태여야 합니다.
- contactStyle 은 성격과 일관되어야 합니다. 과묵한 인물이 연락 빈도가 높으면 안 됩니다.
- appearance 는 이미지 생성에 그대로 쓰입니다. 눈·코·턱·피부·머리를 구체적으로 쓰고,
  distinctive 에는 그 사람을 알아보게 하는 특징 하나를 넣습니다(흉터, 점, 문신 등).
- appearance.body.build 는 slim, average, muscular, heavy 중 하나이며 직업과 생활에
  어울려야 합니다. 모든 인물을 근육질로 만들지 않습니다.
- appearance.body.gender 는 male 또는 female 이며, 요청에 성별이 드러나면 그것을 따릅니다.
- 반드시 JSON 객체만 반환합니다.`

/** Quick Create — 한 문장 → 편집 가능한 Draft. */
export async function generateCharacterDraft(
  llm: LLMProvider,
  oneLiner: string,
): Promise<CharacterDraft> {
  return llm.generateStructured({
    schema: CharacterDraft, task: 'world_update', promptVersion: 'character-draft:v1',
    system: SYSTEM,
    prompt: `다음 설명에 맞는 캐릭터 초안을 만들어 주세요.\n\n설명: ${oneLiner}`,
  })
}

/**
 * Mock 용 Draft 빌더.
 * 입력 문장에서 결정적으로 파생시켜 같은 입력에 같은 출력을 낸다.
 */
export function buildMockDraft(prompt: string): CharacterDraft {
  const seed = prompt.replace(/^[\s\S]*?설명:\s*/, '').trim() || '이름 없는 인물'
  const n = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0)
  const pick = <T>(arr: readonly T[], offset = 0): T => arr[(n + offset) % arr.length]!

  return {
    identity: {
      name: `[초안] ${seed.slice(0, 12)}`,
      age: 24 + (n % 16),
      nationality: pick(['한국', '일본', '영국'] as const),
      occupation: pick(['검사', '의사', '작곡가', '형사'] as const, 3),
      mbti: pick(['INTJ', 'ISTP', 'ENTJ', 'INFJ'] as const, 5),
    },
    personality: {
      personality:
        `${seed} — 겉으로는 거리를 두지만 속으로는 상대를 관찰한다. ` +
        '자신의 기준이 분명하고, 그 기준을 넘어온 사람에게만 다르게 대한다.',
      values: '한번 한 말은 지킨다.',
      speechStyle: '짧고 건조한 말투. 필요한 말만 한다.',
      hobbies: ['혼자 걷기', '오래된 음악'],
      dislikes: ['무례함', '거짓말'],
      jealousy: 30 + (n % 40),
      initiative: 25 + (n % 45),
      emotionalExpression: 20 + (n % 40),
    },
    appearance: {
      baseFace: {
        eyes: pick(['서늘한 눈매', '둥글고 짙은 눈', '끝이 올라간 눈'] as const, 11),
        nose: '곧은 콧날',
        jaw: pick(['각진 턱선', '갸름한 턱'] as const, 13),
        skin: '맑은 피부',
        distinctive: pick(['왼쪽 눈가의 작은 점', '눈썹을 가로지르는 흉터', '목덜미의 오래된 자국'] as const, 17),
      },
      hair: {
        color: pick(['검은색', '어두운 갈색'] as const, 19),
        length: pick(['짧은', '귀를 덮는'] as const, 23),
        style: '자연스럽게 넘긴',
      },
      body: {
        // 전부 근육질로 몰리지 않게 네 종류에서 고른다.
        build: pick(['slim', 'average', 'muscular', 'heavy'] as const, 29),
        gender: pick(['male', 'female'] as const, 17),
        height: `${170 + (n % 20)}cm`,
        detail: '자세가 곧다',
      },
      styleTags: ['어두운 색 위주', '장식이 적은 옷'],
      expression: '표정 변화가 크지 않다',
    },

    world: {
      era: '현대',
      location: pick(['서울', '도쿄', '런던'] as const, 7),
      genre: '현대 드라마',
      worldSetting: '평범해 보이지만 각자의 사정이 얽혀 있는 도시. 소문은 빠르게 돈다.',
    },
    presentation: {
      role: '거리를 두는 사람',
      relationshipKeywords: ['서늘한', '가까워지기 어려운'],
    },
    startingContext:
      '우연히 같은 자리에 있게 되었다. 그는 당신을 알아봤지만 먼저 말을 걸지는 않았다.',
    startingTime: '저녁',
    socialPosition: null,
    initialRelationship: {
      trust: 10 + (n % 15),
      attraction: 5,
      jealousy: 0,
      protectiveness: 10 + (n % 20),
      emotionalDistance: 70 + (n % 15),
      attachment: 5,
      stage: 'stranger',
    },
    contactStyle: {
      contactFrequency: 25 + (n % 30),
      replyDelayMinutes: 15 + (n % 60),
      preferredChannel: 'message',
      callProbability: 10 + (n % 20),
      videoCallProbability: 3 + (n % 10),
      photoProbability: 8 + (n % 15),
      voiceMessageProbability: 8 + (n % 15),
      activeHoursStart: '08:00',
      activeHoursEnd: '23:00',
      initiativeLevel: 25 + (n % 35),
    },
  }
}
