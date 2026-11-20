import type { ChatModelChoice } from './chat-models'
import { msg } from '@/lib/i18n'

export function selectedChatChoice(choices: ChatModelChoice[], id: string) {
  return choices.find(choice => choice.id === id) ?? choices.find(choice => choice.length === (id === 'pro' ? 'long' : 'scene')) ?? choices[0]
}
export function chatModelFamily(choice: ChatModelChoice) { return choice.id.replace(/:(short|scene|plus|long|saga)$/, '') }

/** 11/21 사용자: 모델마다 고르는 이유가 보이게 한 줄 소개 — 이름이 표에 없으면 아래 계열 문구. */
const MODEL_NOTES: Record<string, string> = {
  'Claude Sonnet 5.5': msg('속도와 서사력이 고르게 좋은 미로의 기본 모델'),
  'Claude Haiku 5.5': msg('가볍고 빠르게 주고받는 대화에 맞는 모델'),
  'Claude Opus 5.5': msg('묘사와 감정선이 가장 깊은 플래그십 모델'),
  'Claude Fable 5.2': msg('캐릭터가 끝까지 흔들리지 않는 롤플레잉 특화 모델'),
  'Gemini 4 Argon': msg('풍성한 묘사로 장면에 빠져들게 하는 모델'),
  'Gemini 4 Carbon': msg('긴 이야기와 복잡한 설정을 잘 기억하는 모델'),
  'Gemini 4 Hydrogen': msg('답이 빨라 대화가 끊기지 않는 모델'),
  'Gemini 3.8 Flash': msg('빠르면서도 표현력이 좋은 최신 Flash 모델'),
  'Gemini 3.7 Flash': msg('자연스럽게 이어지는 대화에 맞는 Flash 모델'),
  'Gemini 3 Flash': msg('토큰 부담이 가장 적은 가벼운 모델'),
  'Gemini 3.1 Pro': msg('설정을 꼼꼼히 챙기는 안정적인 Pro 모델'),
  'GPT 6.1 Sol': msg('섬세한 감정 표현이 돋보이는 모델'),
  'GPT 6.1 Terra': msg('문장이 깔끔하고 응답이 빠른 모델'),
  'GPT 6 Astra': msg('복잡한 전개도 논리적으로 풀어내는 최상위 모델'),
  'GPT-5.5': msg('여러 장르를 고르게 소화하는 모델'),
}
/** Display metadata never replaces the server's registry ID or price quote. */
export function modelPresentation(choice: ChatModelChoice) {
  const note = MODEL_NOTES[choice.name.replace(/ · .*$/, '')]
  const base = basePresentation(choice)
  return note ? { ...base, description: note } : base
}
function basePresentation(choice: ChatModelChoice) {
  const name = choice.name
  if (/claude/i.test(name)) {
    const family = /haiku|sonnet|opus|fable/i.exec(name)?.[0]
    const version = /\d+(?:[.-]\d+)*/.exec(name)?.[0].replace(/-/g, '.') ?? ''
    return { provider: 'Anthropic', icon: 'claude', label: family ? `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${version}`.trim() : name,
      description: /haiku/i.test(name) ? msg('빠른 응답을 위한 경량 모델') : /sonnet/i.test(name) ? msg('속도와 서사력을 균형 있게 갖춘 모델') : /opus/i.test(name) ? msg('서사력과 몰입감이 가장 뛰어난 플래그십 모델') : msg('복잡한 작업과 깊이 있는 추론에 집중') }
  }
  if (/deepseek/i.test(name)) return { provider: 'DeepSeek', icon: 'deepseek', label: name, description: msg('대화용 AI 모델') }
  if (/gemini/i.test(name) || choice.provider === 'gemini') {
    const version = /\d+(?:\.\d+)*/.exec(name)?.[0] ?? ''
    const family = /argon|carbon|hydrogen|flash-lite|flash|pro/i.exec(name)?.[0] ?? ''
    return { provider: 'Google', icon: 'gemini', label: `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version}`.trim(),
      description: /argon/i.test(name) ? msg('장문의 대화에 적합한 고성능 모델') : /flash-lite|hydrogen/i.test(name) ? msg('빠른 응답을 위한 경량 모델')
        : /3\.8/.test(name) && /flash/i.test(name) ? msg('표현력과 몰입감이 좋은 최신 Flash 모델') : /flash/i.test(name) ? msg('자연스러운 대화에 맞춘 빠른 Flash 모델') : msg('복잡한 작업과 깊이 있는 추론에 집중') }
  }
  if (/gpt|openai|o[134]-/i.test(name) || choice.provider === 'openai') {
    const family = /astra|sol|terra|luna/i.exec(name)?.[0]
    const version = /\d+(?:\.\d+)*/.exec(name)?.[0] ?? ''
    return { provider: 'OpenAI', icon: 'openai', label: family ? `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${version}` : name.replace(/^gpt-/i, 'GPT-'),
      description: /mini|nano|luna/i.test(name) ? msg('빠른 응답을 위한 경량 모델') : msg('다양한 대화와 문장 생성을 위한 모델') }
  }
  return { provider: choice.providerLabel ?? 'AI', icon: null, label: name, description: msg('대화용 AI 모델') }
}
