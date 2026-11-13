import { expect, test } from 'vitest'
import { minimalInputRun } from '../context'

const u = (content: string) => ({ role: 'user', content }) as never
const c = (content: string) => ({ role: 'character', content }) as never

test('counts consecutive minimal user inputs, current input included', () => {
  expect(minimalInputRun({ userInput: '…', recentMessages: [u('오늘 뭐 했어?'), c('그냥.'), u('ㅇㅇ'), c('…')] })).toBe(2)
  expect(minimalInputRun({ userInput: '흠...', recentMessages: [u('...'), c('?'), u('응'), c('왜')] })).toBe(3)
  expect(minimalInputRun({ userInput: '카페 가자', recentMessages: [u('ㅇㅇ'), c('왜')] })).toBe(0)
  expect(minimalInputRun({ userInput: 'ㅋㅋㅋ 진짜?', recentMessages: [] })).toBe(0)
})
