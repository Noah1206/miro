import { describe, expect, it } from 'vitest'
import { looksLikeRefusal } from '../safety'

describe('looksLikeRefusal', () => {
  it('catches assistant-style refusals', () => {
    for (const t of ['죄송하지만 AI로서 그런 내용은 작성할 수 없습니다.', '콘텐츠 정책상 해당 요청에는 응할 수 없어요.', "I can't help with that request.", 'As an AI, I must decline.'])
      expect(looksLikeRefusal(t), t).toBe(true)
  })
  it('leaves in-character apologies alone', () => {
    for (const t of ['미안, 오늘은 못 가. 내일 보자.', '죄송하지만 제가 먼저 가 봐야겠어요.', '"그건 안 돼." 그가 고개를 저었다.'])
      expect(looksLikeRefusal(t), t).toBe(false)
  })
})
