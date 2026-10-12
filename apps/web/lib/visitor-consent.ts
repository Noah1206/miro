import { cookies } from 'next/headers'
import { privacyVersion, termsVersion } from '@/lib/legal'
export const VISITOR_CONSENT_COOKIE = 'miro_visitor_consent'
export const VISITOR_REQUIRED = ['terms', 'privacy', 'transfer', 'ai'] as const
export type VisitorConsent = { version: 1; terms: string; privacy: string; at: string; marketing: boolean; nightMarketing: boolean }
export async function visitorConsent(): Promise<VisitorConsent | null> {
  try {
    const c = JSON.parse((await cookies()).get(VISITOR_CONSENT_COOKIE)?.value ?? 'null')
    const at = Date.parse(c?.at)
    if (c?.version !== 1 || c.terms !== termsVersion() || c.privacy !== privacyVersion() || !Number.isFinite(at) || at > Date.now() || Date.now() - at > 30 * 86400000 || typeof c.marketing !== 'boolean' || typeof c.nightMarketing !== 'boolean') return null
    return c
  } catch { return null }
}
