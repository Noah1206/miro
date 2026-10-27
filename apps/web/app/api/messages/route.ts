import { currentUser } from '@/lib/auth'
import { afterResponse } from '@/lib/defer'
import { messengerItems, MessengerError, receiveMessenger, runMessengerInbox } from '@/lib/messenger/inbox'
import { observe } from '@/lib/observe'

export const runtime = 'nodejs'
export const maxDuration = 300
const headers = { 'cache-control': 'no-store' }

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401, headers })
  const body = await req.json().catch(() => null)
  if (!body || !['sessionId', 'requestId', 'input'].every(key => typeof body[key] === 'string')) return Response.json({ error: 'invalid' }, { status: 400, headers })
  if (body.chatModel !== undefined && (typeof body.chatModel !== 'string' || body.chatModel.length > 200)) return Response.json({ error: 'invalid_model' }, { status: 400, headers })
  try {
    const message = await receiveMessenger({ userId: user.id, sessionId: body.sessionId, requestId: body.requestId, input: body.input, sentAt: typeof body.sentAt === 'string' ? body.sentAt : undefined, chatModel: body.chatModel })
    return Response.json({ message }, { headers })
  } catch (error) {
    const reason = error instanceof MessengerError ? error.reason : 'unavailable'
    return Response.json({ error: reason }, { status: reason === 'not_found' ? 404 : reason === 'restricted' ? 403 : reason === 'rate_limit' ? 429 : reason === 'conflict' ? 409 : 400, headers })
  }
}

export async function GET(req: Request) {
  const user = await currentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401, headers })
  const sessionId = new URL(req.url).searchParams.get('sessionId') ?? ''
  const items = await messengerItems(user.id, sessionId)
  if (!items) return Response.json({ error: 'not_found' }, { status: 404, headers })
  if (new URL(req.url).searchParams.get('stream') === '1') {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({ async start(controller) {
      const send = (event: unknown) => { try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')) } catch { /* Delivery continues in the leased queue after disconnect. */ } }
      send({ type: 'items', items })
      try {
        await runMessengerInbox(new Date(), { sessionId, limit: 1, stream: {
          onDraft: (id, text) => send({ type: 'draft', id, text }), onReset: id => send({ type: 'reset', id }),
        } })
        const saved = await messengerItems(user.id, sessionId)
        if (saved) send({ type: 'items', items: saved })
      } catch { /* Keep the durable queue for the next worker; no partial message is committed. */ }
      finally { send({ type: 'done' }); try { controller.close() } catch {} }
    } })
    return new Response(body, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' } })
  }
  await afterResponse(() => runMessengerInbox(new Date(), { sessionId, limit: 1 }).catch(() => observe('messenger.review_failed', { sessionId })))
  return Response.json({ items }, { headers })
}
