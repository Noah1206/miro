/** Test-only escape hatch: never permits mocks against a shared service database. */
export function isolatedTestRuntime(): boolean {
  if (process.env.MIRO_TEST_MODE !== '1' || process.env.VERCEL_ENV === 'production') return false
  try {
    const url = new URL(process.env.DATABASE_URL ?? '')
    return ['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(url.hostname)
      && /^\/(?:test|test_[a-z0-9_]+|[a-z0-9_]+_test)$/i.test(url.pathname)
  } catch { return false }
}

export function productionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production'
    || (process.env.NODE_ENV === 'production' && !isolatedTestRuntime())
}

export function mockProvidersAllowed(): boolean { return !productionRuntime() }

export function devApiAllowed(): boolean {
  return !productionRuntime() && (process.env.NODE_ENV !== 'production' || isolatedTestRuntime())
}
