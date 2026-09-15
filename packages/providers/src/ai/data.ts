import { createHash } from 'node:crypto'
/** Screening only. Human privacy review remains mandatory before training export. */
export function redactData(text: string, identifiers: string[] = []): string {
  let out = text
  for (const id of identifiers.filter(s => s.length > 1)) out = out.split(id).join('[REDACTED]')
  return out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?:\+?82[- .]?)?0?1[016789][- .]?\d{3,4}[- .]?\d{4}/g, '[PHONE]')
    .replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g, '[IDENTITY]')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '[URL]')
    .replace(/\b(?:sk-|Bearer\s+)[A-Za-z0-9_-]+/g, '[SECRET]')
}
export function sensitiveData(text: string): boolean {
  return /주민등록|계좌번호|비밀번호|신용카드|진단받|병력|성폭행|자해|자살|미성년.*성|집주소/.test(text)
}
export function contentHash(text: string): string { return createHash('sha256').update(text.normalize('NFKC').replace(/\s+/g, ' ').trim()).digest('hex') }
export type TrainingCandidate = {
  sourceId: string; subjectId: string; conversationGroup: string; consentVersion: string;
  allowTraining: boolean; providerTrainingAllowed: boolean; privacyReviewed: boolean; qualityScore: number;
  promptVersion: string; modelVersion: string; messages: Array<{role:'system'|'user'|'assistant';content:string}>;
  chosen?: string; rejected?: string; explicitPreference?: boolean
}
export async function buildTrainingDataset(candidates: TrainingCandidate[], currentConsent: (subjectId: string, version: string) => Promise<boolean>) {
  const seen = new Set<string>(), sft: unknown[] = [], dpo: unknown[] = []
  for (const c of candidates) {
    if (!c.allowTraining || !c.providerTrainingAllowed || !c.privacyReviewed || !Number.isFinite(c.qualityScore) || c.qualityScore < 4 || !await currentConsent(c.subjectId, c.consentVersion)) continue
    const all = c.messages.map(m => m.content).join('\n') + (c.chosen ?? '') + (c.rejected ?? '')
    if (sensitiveData(all)) continue
    const messages = c.messages.map(m => ({ role:m.role,content:redactData(m.content) }))
    const hash = contentHash(JSON.stringify(messages))
    if (seen.has(hash)) continue
    seen.add(hash)
    // Conversation-group split prevents fragments of the same conversation leaking into test.
    const bucket = parseInt(contentHash(c.conversationGroup).slice(0,8),16) % 100
    const split = bucket < 80 ? 'train' : bucket < 90 ? 'validation' : 'test'
    const meta = { datasetVersion: 'miro-sft-v1', hash, split, promptVersion:c.promptVersion,modelVersion:c.modelVersion }
    sft.push({ ...meta, messages })
    if (c.explicitPreference && c.chosen && c.rejected && c.chosen !== c.rejected) dpo.push({ ...meta, prompt:messages.filter(m => m.role !== 'assistant'),chosen:redactData(c.chosen),rejected:redactData(c.rejected) })
  }
  return { sft, dpo }
}
