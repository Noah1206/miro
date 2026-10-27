import type { ChatModelChoice } from './chat-models'
import { msg } from '@/lib/i18n'

export function selectedChatChoice(choices: ChatModelChoice[], id: string) {
  return choices.find(choice => choice.id === id) ?? choices.find(choice => choice.length === (id === 'pro' ? 'long' : 'scene')) ?? choices[0]
}
export function chatModelFamily(choice: ChatModelChoice) { return choice.id.replace(/:(scene|long)$/, '') }

/** Display metadata never replaces the server's registry ID or price quote. */
export function modelPresentation(choice: ChatModelChoice) {
  const name = choice.name
  if (/claude/i.test(name)) {
    const family = /haiku|sonnet|opus|fable/i.exec(name)?.[0]
    const version = /\d+(?:[.-]\d+)*/.exec(name)?.[0].replace(/-/g, '.') ?? ''
    return { provider: 'Anthropic', icon: 'claude', label: family ? `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${version}`.trim() : name,
      description: /haiku/i.test(name) ? msg('빠른 응답을 위한 경량 모델') : /sonnet/i.test(name) ? msg('속도와 지능을 균형 있게 제공하는 모델') : msg('복잡한 작업과 깊이 있는 추론에 집중') }
  }
  if (/gpt|openai|o[134]-/i.test(name) || choice.provider === 'openai') {
    const family = /astra|sol|terra|luna/i.exec(name)?.[0]
    const version = /\d+(?:\.\d+)*/.exec(name)?.[0] ?? ''
    return { provider: 'OpenAI', icon: 'openai', label: family ? `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${version}` : name.replace(/^gpt-/i, 'GPT-'),
      description: /mini|nano|luna/i.test(name) ? msg('빠른 응답을 위한 경량 모델') : msg('다양한 대화와 문장 생성을 위한 모델') }
  }
  return { provider: choice.providerLabel ?? 'AI', icon: null, label: name, description: msg('대화용 AI 모델') }
}
