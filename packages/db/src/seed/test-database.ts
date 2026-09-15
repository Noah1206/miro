/**
 * 시드 스크립트가 실수로 실서비스 DB에 데모 캐릭터를 넣지 못하게 막는 안전장치.
 * tooling/test-database.ts 와 같은 검증 — 워크스페이스 패키지는 rootDir 제약으로 저장소 루트를
 * 직접 임포트할 수 없어 여기 복제한다. 둘이 갈라지면 이 파일을 tooling 쪽과 맞춰 고친다.
 */
export function testDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  const url = new URL(value)
  if (!['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(url.hostname)
    || !/^\/(?:test|test_[a-z0-9_]+|[a-z0-9_]+_test)$/i.test(url.pathname)) {
    throw new Error('Tests and demo seeds require a local test database (for example miro_test). Shared application databases are not allowed.')
  }
  return value
}
