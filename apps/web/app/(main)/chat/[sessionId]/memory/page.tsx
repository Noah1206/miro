import { NotesView } from './notes-view'

/**
 * 11/17 기억 노트 — 캐릭터가 대화에서 스스로 정리해 둔 기억(나에 대한 생각 · 단기 기억 · 장기 기억). 보기만.
 * 유저노트와 한 화면(토글)에서 본다 — 본문은 memory-note.tsx.
 */
export default async function MemoryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  return <NotesView sessionId={sessionId} active="memory" />
}
