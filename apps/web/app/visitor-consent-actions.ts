'use server'
import { cookies } from 'next/headers'
import { privacyVersion, termsVersion } from '@/lib/legal'
import { VISITOR_CONSENT_COOKIE, VISITOR_REQUIRED, type VisitorConsent } from '@/lib/visitor-consent'
export async function acceptVisitorConsent(form: FormData): Promise<boolean> {
  if (!VISITOR_REQUIRED.every(key => form.get(key) === 'on')) return false
  const consent: VisitorConsent = { version: 1, terms: termsVersion(), privacy: privacyVersion(), at: new Date().toISOString(), marketing: form.get('marketing') === 'on', nightMarketing: form.get('nightMarketing') === 'on' }
  ;(await cookies()).set(VISITOR_CONSENT_COOKIE, JSON.stringify(consent), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 86400 })
  return true
}
