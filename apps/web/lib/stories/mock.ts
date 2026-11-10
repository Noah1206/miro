import type { GenerationRequest } from '@miro/providers'
import { DM_VERSION, INTERPRET_VERSION, NARRATE_VERSION } from './prompts'

/**
 * 모델 없이 돌리는 결정적 응답(테스트·E2E·로컬 확인용, AI_PROVIDER=mock). 운영에서는 쓰이지 않는다.
 * 해석: "[A]" 같은 선택 표시, 인물 이름 + 정해진 낱말로 관계 행동을 만든다. 근거는 언제나 입력 원문.
 */
type Req = Pick<GenerationRequest, 'prompt' | 'promptVersion'>

export function storyMock(req: Req): unknown {
  const data = JSON.parse(req.prompt) as Record<string, unknown>
  if (req.promptVersion === INTERPRET_VERSION) return interpret(data)
  if (req.promptVersion === DM_VERSION) return { text: `(${String((data.lines as { distance?: string })?.distance ?? '')}) 연락석 확인했어.` }
  if (req.promptVersion === NARRATE_VERSION) return narrate(data)
  throw new Error('story_mock_unknown_prompt')
}

function interpret(d: Record<string, unknown>) {
  const input = String(d.input ?? '')
  const chars = (d.characters as { key: string; name: string }[]) ?? []
  const ev = d.event as { id: string; final?: boolean; options?: { id: string; example?: string; pick?: string[] }[] }
  const actions: Record<string, unknown>[] = []
  const add = (a: Record<string, unknown>) => actions.push({ character: null, option: null, pick: null, value: null, quote: input, ...a })
  const named = chars.filter(c => input.includes(c.name) || input.includes(c.name.split(' ')[0]!))
  const targets = named.length ? named : /모두|전부|다들/.test(input) ? chars : []
  const opt = input.match(/\[([A-Z])(?::(\w+))?\]/)
  const byExample = ev.options?.find(o => o.example && input.includes(o.example))
  if (opt && ev.options?.some(o => o.id === opt[1])) add({ type: 'option', option: opt[1], pick: opt[2] ?? null })
  else if (byExample) add({ type: 'option', option: byExample.id, pick: byExample.pick?.[0] ?? null })
  if (/설정 싫어|입학 안 할래|전제 싫어|이 역할 싫어/.test(input)) add({ type: 'refuse_premise' })
  if (/다시 할게|받아들일게/.test(input)) add({ type: 'accept_premise' })
  if (/연락하지 마|연락 그만/.test(input)) for (const c of targets) add({ type: 'contact', character: c.key, value: 'stopped' })
  if (/연락해도 돼|연락석 받을게/.test(input)) for (const c of targets) add({ type: 'contact', character: c.key, value: 'allowed' })
  if (/좋아해|사랑해|마음이 있어/.test(input)) for (const c of named) add({ type: 'affinity', character: c.key })
  if (/약속|협력|함께 정하/.test(input)) for (const c of named) add({ type: 'trust', character: c.key })
  if (/약속/.test(input)) for (const c of named) add({ type: 'promise', character: c.key, value: input.slice(0, 80) })
  if (/시간을 넘기|다음 날로|건너뛰/.test(input)) add({ type: 'time_skip' })
  if (/만 만날게/.test(input)) for (const c of named) add({ type: 'exclusive', character: c.key })
  if (ev.final) {
    const outcome = /연인/.test(input) ? 'romance' : /더 알아가/.test(input) ? 'explore' : /거리/.test(input) ? 'space' : /동료/.test(input) ? 'colleague' : null
    if (outcome) for (const c of targets) add({ type: 'relation_outcome', character: c.key, value: outcome })
  }
  const clarify = /잤잖아|했었잖아/.test(input) ? '기록에는 그런 일이 없어요. 어떤 장면을 말하는지 알려 줄래요?' : null
  return { actions, clarify }
}

function narrate(d: Record<string, unknown>) {
  const done = d.completed as { title: string; result?: string } | undefined
  const ev = d.event as { title?: string; situation?: string; ended?: boolean; note?: string }
  const parts = [
    d.premise ? String(d.premise) : null,
    done?.result ?? null,
    (d.unmetChoice as string[] | undefined)?.join(' ') ?? null,
    ev?.situation ?? ev?.note ?? null,
    d.clarify ? String(d.clarify) : null,
  ].filter(Boolean)
  return { blocks: [{ kind: 'narration', speaker: null, text: parts.join('\n\n') || '장면이 이어진다.' }] }
}
