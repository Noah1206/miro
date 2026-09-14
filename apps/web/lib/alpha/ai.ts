import { resolveTextAI } from '@miro/providers'
import { fallbackReply, moodFromPrompt } from './character'

/** 알파용 Provider. 키가 없으면 기분에 맞는 정해진 대사로 흐름은 끝까지 돈다. */
export function resolveAlphaAI() {
  return resolveTextAI((input) => fallbackReply(moodFromPrompt(input.prompt), input.prompt.length))
}
