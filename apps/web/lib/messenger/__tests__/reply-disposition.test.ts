import { describe, expect, it } from 'vitest'
import type { LLMProvider } from '@miro/providers'
import { nextReplyReview, readReplyDisposition } from '../reply-disposition'

const llm = (output: unknown): LLMProvider => ({ info: { mode: 'mock', name: 'disposition-contract', notice: '' },
  async generateStructured(request) { return request.schema.parse(output) } })
describe('a read question remains durable until actually answered or explicitly closed', () => {
  it('does not turn generic wait into a terminal inbox decision', async () => {
    expect(await readReplyDisposition(llm({ disposition: 'retry', reason: 'unanswered', sourceId: '', quote: '' }),
      [{ id: 'm', text: '연습을 음악부터 익혀, 숫자로 세?' }])).toMatchObject({ disposition: 'retry' })
  })
  it('does not use a closing word to erase a question, old source or invented quote', async () => {
    const model = llm({ disposition: 'close', reason: 'acknowledgement', sourceId: 'm', quote: '고마워' })
    expect(await readReplyDisposition(model, [{ id: 'm', text: '고마워. 그래서 넌 어떻게 해?' }])).toMatchObject({ disposition: 'retry' })
    expect(await readReplyDisposition(model, [{ id: 'm', text: '고마워' }, { id: 'new', text: '하나 더 궁금한 게 있어.' }])).toMatchObject({ disposition: 'retry' })
    expect(await readReplyDisposition(model, [{ id: 'm', text: '응, 그런데' }])).toMatchObject({ disposition: 'retry' })
  })
  it('allows an actual explicit no-reply request to close the latest read batch', async () => {
    expect(await readReplyDisposition(llm({ disposition: 'close', reason: 'explicit_no_reply', sourceId: 'last', quote: '답장 안 해도 돼' }),
      [{ id: 'last', text: '여기까지 이해했어. 답장 안 해도 돼.' }])).toMatchObject({ disposition: 'close' })
  })
  it('backs off repeated deferrals without expiring or silently discarding the question', () => {
    const now = new Date('2026-10-16T11:00:00Z')
    expect(nextReplyReview(null, now)).toMatchObject({ replyReviews: 1, nextReviewAt: new Date(now.getTime() + 15 * 60_000) })
    expect(nextReplyReview({ replyReviews: 30 }, now).nextReviewAt).toEqual(new Date(now.getTime() + 120 * 60_000))
    expect(nextReplyReview({ replyReviews: 'oops' }, now).replyReviews).toBe(1)
  })
})
