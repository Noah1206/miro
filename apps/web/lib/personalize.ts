/**
 * 캐릭터 글의 "당신"을 사용자 페르소나 이름으로 바꾼다 — 위프처럼 설명을 읽는 순간부터 내 이야기가 되게(10/5).
 * 서술(소개·첫 장면·인트로의 서술 줄)에만 쓴다. 캐릭터의 대사는 사람을 부르는 말이라 바꾸지 않는다.
 * 조사는 이름의 받침에 맞춘다(지우는/지혁은, 지우가/지혁이…). 한글이 아닌 이름은 받침 없는 쪽으로 붙인다.
 */
const PAIRS: Record<string, [string, string]> = {
  은: ['은', '는'], 는: ['은', '는'], 이: ['이', '가'], 가: ['이', '가'],
  을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'],
  이랑: ['이랑', '랑'], 랑: ['이랑', '랑'], 으로: ['으로', '로'], 로: ['으로', '로'],
}

function final(name: string): 'none' | 'rieul' | 'other' {
  const code = name.trim().slice(-1).charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return 'none'
  const f = (code - 0xac00) % 28
  return f === 0 ? 'none' : f === 8 ? 'rieul' : 'other'
}

export function personalize(text: string, name?: string | null): string {
  const who = name?.trim()
  if (!who || !text.includes('당신')) return text
  const f = final(who)
  return text
    // 서술격 조사: "당신이다/당신이라고/당신이었다" → "지혁이다/지우라고/지우였다"는 다루기 어려워 '이'만 받침에 맞춘다.
    .replace(/당신이(?=라|다|야|었|에요|지만)/g, f === 'none' ? who : `${who}이`)
    .replace(/당신(이랑|으로|에게서|에게|한테|은|는|이|가|을|를|과|와|랑|로)?/g, (_m, p: string | undefined) => {
      if (!p) return who
      const pair = PAIRS[p]
      if (!pair) return who + p
      // '로' 는 받침이 없거나 ㄹ 받침이면 '로', 아니면 '으로'.
      if (p === '로' || p === '으로') return who + (f === 'other' ? '으로' : '로')
      return who + (f === 'none' ? pair[1] : pair[0])
    })
}
