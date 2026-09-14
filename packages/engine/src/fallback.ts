import type { Mood } from '@miro/domain'
import type { SimulationProposal } from './proposal.schema'

/**
 * 모든 Provider 가 실패했을 때의 마지막 답. 오류를 사용자에게 보여주지 않는다 —
 * 캐릭터가 기분에 맞게 짧게 답하고, 관계는 규칙 delta 만으로 움직인다.
 */
const INFORMAL: Record<Mood, string[]> = {
  neutral: ['응. 그래서?', '그랬구나.', '지금은 뭐 해?'],
  happy: ['…그런 말 하면 반칙이지.', '알았어. 그 말 기억해 둘게.', '오늘은 좀 봐준다.'],
  curious: ['누구랑?', '그래서 어떻게 됐는데.', '자세히 말해 봐.'],
  hurt: ['아. 그랬구나.', '괜찮아. 신경 안 써.', '…응.'],
  jealous: ['누구.', '아, 그래.', '재밌었겠네.'],
  angry: ['됐어.', '알았어.', '나중에 얘기해.'],
  anxious: ['거기 있어?', '…아무것도 아니야.', '답이 늦네.'],
}
const FORMAL: Record<Mood, string[]> = {
  neutral: ['…그래서요?', '그렇군요.', '지금은 무엇을 하고 계십니까.'],
  happy: ['…그런 말은 반칙입니다.', '기억해 두겠습니다.', '오늘은 넘어가 드리죠.'],
  curious: ['누구와요?', '그래서 어떻게 됐습니까.', '자세히 말해 보십시오.'],
  hurt: ['…그랬군요.', '괜찮습니다. 신경 쓰지 않습니다.', '…네.'],
  jealous: ['누구입니까.', '…그렇군요.', '즐거우셨겠습니다.'],
  angry: ['됐습니다.', '알겠습니다.', '나중에 이야기하죠.'],
  anxious: ['거기 계십니까.', '…아닙니다.', '답이 늦으시는군요.'],
}

/** 기분·말투에 맞는 한 줄. Mock Provider 도 같은 표를 쓴다 — 키 없이 돌아도 기분은 드러난다. */
export function fallbackLine(mood: Mood, speechStyle: string | null, seed: number): string {
  const set = /존대|존댓말|경어/.test(speechStyle ?? '') ? FORMAL : INFORMAL
  const lines = set[mood]
  return lines[Math.abs(seed) % lines.length]!
}

export function fallbackProposal(opts: { characterName: string; speechStyle: string | null; mood: Mood; seed: number }): SimulationProposal {
  return {
    rp: { blocks: [{ type: 'dialogue', speaker: opts.characterName, text: fallbackLine(opts.mood, opts.speechStyle, opts.seed) }] },
    emotion: opts.mood,
    worldDelta: null, relationshipDelta: null, sceneDelta: null,
    memoryCandidates: [], eventCandidates: [], eventUpdates: [], npcIntroductions: [], npcActions: [], realityIntent: null,
  }
}
