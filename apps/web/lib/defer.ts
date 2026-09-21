import { after } from 'next/server'

/**
 * 응답을 보낸 뒤에 할 일. 사용량 정산·평가 샘플처럼 유저가 기다릴 이유가 없는 쓰기를 응답 경로에서 뺀다.
 * Vercel 은 after 콜백이 끝날 때까지 함수를 살려 둔다. 요청 밖(테스트·스크립트)에서는 그 자리에서 기다린다.
 */
export function afterResponse(task: () => Promise<unknown>): Promise<void> {
  try { after(task) } catch { return task().then(() => undefined) }
  return Promise.resolve()
}
