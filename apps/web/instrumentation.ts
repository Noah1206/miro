export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installAIUsageSink } = await import('./lib/usage/ai-usage')
    installAIUsageSink()
  }
}
