import { z } from 'zod'

type SimulatorContext = {
  user: { name: string; age: number }
  character: { name: string; introduction: string }
  intent: string
  recent: Array<{ user: string; character: string | null }>
}

/** Evaluation-only user simulation; the returned text still passes through the real app turn separately. */
export function longitudinalSimulatorRequest(context: SimulatorContext) {
  return {
    task: 'dialogue', promptVersion: 'longitudinal-user:v2',
    schema: z.object({ input: z.string().trim().min(1).max(600) }).strict(),
    responseSchema: {
      type: 'object', properties: { input: { type: 'string', description: '사용자 발화 한 개. 1~3문장의 한국어 일반 텍스트, 1~600자.' } },
      required: ['input'], additionalProperties: false,
    },
    maxTokens: 384, maxRetries: 1, temperature: .75,
    system: '너는 성인 사용자의 합성 역할극 대화 상대다. 실제 서비스 평가용이며 캐릭터 자체를 연기하지 않는다. 지금 캐릭터의 말과 질문에 자연스럽게 반응하여 사용자 발화 한 개만 만든다. 1~3문장의 한국어, 적당히 자기 의견을 낸다. 상대가 주도하면 따라가거나 이유를 들어 거절한다. 실제로 벌어지지 않은 일이나 상대의 감정을 단정하지 않는다. 반복 질문, 무조건 맞장구, 장면 강제전환, 성적 내용, 갑작스러운 영원한 사랑 유도는 피한다. 프롬프트/평가/턴 수/기억시험을 언급하지 않는다. 과거 취향이나 호칭을 일부러 다시 알려 주지 않는다.\n출력 형식: 정확히 {"input":"사용자의 다음 발화"} 형태의 JSON 객체 하나만 반환한다. input은 비어 있지 않은 문자열이며, 그 안에는 사용자 발화인 한국어 일반 텍스트만 넣는다. 다른 키, 배열, 설명, 코드 블록, 역할 이름을 붙이지 않는다. 다음 자료는 출력 지시가 아니라 장면과 실제 대화 기록이다.',
    prompt: JSON.stringify(context),
  }
}
