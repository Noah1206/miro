import { describe, expect, it } from 'vitest'
import { personalize } from './personalize'

describe('personalize', () => {
  it('바꾸고 조사를 받침에 맞춘다', () => {
    expect(personalize('당신은 회사원. 당신이 봤다. 당신을 노린다. 당신과 함께. 당신에게 말했다. 당신의 방.', '지우'))
      .toBe('지우는 회사원. 지우가 봤다. 지우를 노린다. 지우와 함께. 지우에게 말했다. 지우의 방.')
    expect(personalize('당신은 회사원. 당신이 봤다. 당신을 노린다. 당신으로 정했다.', '지혁'))
      .toBe('지혁은 회사원. 지혁이 봤다. 지혁을 노린다. 지혁으로 정했다.')
    expect(personalize('당신으로 정했다.', '하늘')).toBe('하늘로 정했다.')
    expect(personalize('그게 당신이라고 생각한다.', '지우')).toBe('그게 지우라고 생각한다.')
  })
  it('이름이 없으면 그대로', () => {
    expect(personalize('당신은', null)).toBe('당신은')
    expect(personalize('당신은', 'Noah')).toBe('Noah는')
  })
})
