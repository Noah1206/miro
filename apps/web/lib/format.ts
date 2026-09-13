/**
 * 96.1만 처럼 짧게. 서버·클라이언트 양쪽에서 쓰므로 'use client' 파일에 두지 않는다
 * (클라이언트 모듈의 함수는 서버에서 호출할 수 없다).
 */
export function compact(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}만`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}천`
  return String(n)
}
