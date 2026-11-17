import { NotesView } from '../memory/notes-view'

/** 11/17 유저노트 — 베이비챗과 같은 개념: 사용자가 이 이야기에서 꼭 지켜 달라고 적는 설정. 기억 노트와 한 화면(토글)에서 본다. */
export default async function UserNotePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  return <NotesView sessionId={sessionId} active="note" />
}
