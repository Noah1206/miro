import { localDay } from './evaluator'

/** A user's request is a delivery boundary, not a personality score or a romantic rejection. */
export type ContactBoundary = {
  version: 1
  mode: 'open' | 'paused' | 'blocked'
  until: string | null
  requestedAt: string
  sourceRequestId: string
}

export function contactBoundaryActive(boundary: ContactBoundary | null | undefined, now: Date): boolean {
  if (!boundary || boundary.mode === 'open') return false
  // A malformed pause must not silently enable delivery.
  return boundary.mode === 'blocked' || !boundary.until || !Number.isFinite(Date.parse(boundary.until)) || Date.parse(boundary.until) > now.getTime()
}

/** Find the next local midnight rather than adding 24 hours (DST days can be 23/25 hours). */
function nextLocalDay(now: Date, timeZone: string, days: number): Date {
  const day = localDay(now, timeZone)
  const target = new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
  let low = now.getTime(), high = low + (days + 2) * 86_400_000
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (localDay(new Date(middle), timeZone) < target) low = middle
    else high = middle
  }
  return new Date(high)
}

/** Only direct requests: quoted dialogue, reported speech, hypotheticals and ordinary solitude are not instructions. */
export function requestedContactBoundary(input: string, now: Date, timeZone: string, sourceRequestId: string): ContactBoundary | null {
  const clauses = input.normalize('NFKC').replace(/```[\s\S]*?```|"[^"\n]*"|“[^”\n]*”|「[^」]*」|『[^』]*』/g, '')
    .split(/[.!?\n。！？]+/).map(c => c.trim()).filter(c => c && !/(?:라고|다고|라며|다며)\s*(?:말|했|하|들|적|쓰)|(?:라는|단)\s*(?:대사|말|문장)|예를\s*들|가정|만약|\b(?:if|suppose|quoted|said|says)\b|と言|って言|としたら|如果|他说|她说/i.test(c))
  let request: ContactBoundary | null = null
  for (const text of clauses) {
    // A denial of the boundary or a question about the other person's solitude is not consent/request.
    if (/(?:연락|문자|메시지|전화|톡).{0,20}(?:뜻|의미|말).{0,8}아니|(?:혼자|혼자만의).{0,12}(?:싶지\s*않|싶진\s*않|필요하지\s*않|싶은\s*건\s*아니)|\bi (?:don'?t|do not) (?:want|need).{0,15}(?:space|alone)/i.test(text)) continue
    const stop = /(?:연락|문자|메시지|전화|톡)(?:은|는|도|을)?\s*(?:하지\s*(?:마|말)|그만\s*(?:해|하)|안\s*(?:해\s*줘|해주세요|했으면))|(?:먼저\s*)?(?:연락|문자|메시지|전화|톡)\s*(?:보내지|걸지|하지)\s*(?:마|말)|\b(?:don'?t|do not|stop)\s+(?:contact(?:ing)?|text(?:ing)?|messag(?:e|ing)|call(?:ing)?)\s+me\b|\bleave me alone\b|連絡しないで|連絡をやめ|不要(?:再)?(?:联系|聯繫|联络|傳訊息|发消息)/i.test(text)
    const space = /(?:혼자\s*(?:있고|쉬고)\s*싶|혼자만의\s*시간(?:이|을)?\s*(?:필요|갖고)|시간을\s*좀\s*줘)|\b(?:i (?:need|want) (?:some )?(?:space|time alone)|i want to be alone)\b|一人(?:で|の時間).*(?:いたい|過ごしたい|ほしい)|(?:想|需要)(?:一个人|一個人|独处|獨處)/i.test(text)
      && !/^(?:너는|넌|당신은|그는|그녀는|\b(?:do you|does he|does she)\b)/i.test(text)
    const resume = /(?:이제|다시|지금|앞으로).{0,12}(?:먼저\s*)?(?:연락|문자|메시지|전화|톡).{0,6}(?:해도\s*(?:돼|괜찮)|해\s*줘|해주세요|해도\s*좋)|\b(?:you can|please)\s+(?:contact|text|message|call)\s+me(?:\s+again)?\b|(?:もう|また)連絡(?:して|しても)|(?:可以|请|請)(?:再)?(?:联系|聯繫|联络)/i.test(text)
      && !/내일|나중|며칠\s*뒤|\b(?:tomorrow|later|next week)\b|明日|明天/i.test(text)
    if (!stop && !space && !resume) continue
    const base = { version: 1 as const, requestedAt: now.toISOString(), sourceRequestId }
    // A stop wins over permission in the same clause; separate later permission can explicitly resume.
    if (resume && !stop && !space) { request = { ...base, mode: 'open', until: null }; continue }
    const duration = /([1-9]\d?)\s*(분|시간|일|minutes?|hours?|days?)/i.exec(text)
    let until: Date | null = null
    if (duration) {
      const unit = duration[2]!.toLowerCase()
      const multiplier = /분|minute/.test(unit) ? 60_000 : /시간|hour/.test(unit) ? 3_600_000 : 86_400_000
      until = new Date(now.getTime() + Math.min(30 * 86_400_000, Number(duration[1]) * multiplier))
    } else if (/오늘|오늘밤|\btoday\b|\btonight\b|今日は|今夜|今天|今晚/i.test(text)) until = nextLocalDay(now, timeZone, 1)
    else if (/내일(?:까지|도)|\bthrough tomorrow\b|明日まで|明天.*(?:之前|为止)/i.test(text)) until = nextLocalDay(now, timeZone, 2)
    else if (stop && request?.mode === 'paused' && request.until && !/앞으로|다시는|당분간|계속|\b(?:ever|anymore|indefinitely)\b/i.test(text)) until = new Date(request.until)
    else if (space && !/당분간|계속|앞으로|다시\s*말할|\buntil i\b|しばらく|一段时间/i.test(text)) until = new Date(now.getTime() + 86_400_000)
    request = { ...base, mode: until ? 'paused' : 'blocked', until: until?.toISOString() ?? null }
  }
  return request
}

/** Both the planner and renderer receive the same explicit delivery constraint. */
export function contactBoundaryDirective(boundary: ContactBoundary | null | undefined, now: Date): string {
  if (!contactBoundaryActive(boundary, now)) return ''
  return `The user requested space. Proactive contact is disabled ${boundary?.until ? `until ${boundary.until}` : 'until they explicitly permit it again'}. Respect this without guilt, pressure, repeated apologies or promises to contact sooner. A new user message can be answered now; it does not by itself lift the contact boundary. Do not treat needing space as hostility, loss of affection or a breakup.`
}
