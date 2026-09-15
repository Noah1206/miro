/** Test fixtures must only be written to a local, explicitly named test database. */
export function testDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  const url = new URL(value)
  if (!['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(url.hostname)
    || !/^\/(?:test|test_[a-z0-9_]+|[a-z0-9_]+_test)$/i.test(url.pathname)) {
    throw new Error('Tests and demo seeds require a local test database (for example miro_test). Shared application databases are not allowed.')
  }
  return value
}
