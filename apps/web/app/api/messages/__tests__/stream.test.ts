import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ user: vi.fn(), items: vi.fn(), inbox: vi.fn() }))
vi.mock('@/lib/auth', () => ({ currentUser: fixture.user }))
vi.mock('@/lib/defer', () => ({ afterResponse: vi.fn() }))
vi.mock('@/lib/messenger/inbox', () => ({ messengerItems: fixture.items, runMessengerInbox: fixture.inbox, receiveMessenger: vi.fn(), MessengerError: class extends Error {} }))
import { GET } from '../route'
import { readMessengerStream } from '@/lib/messenger/stream'
beforeEach(() => { vi.resetAllMocks(); fixture.user.mockResolvedValue({ id: 'owner' }); fixture.items.mockResolvedValue([]) })
describe('authenticated DM stream', () => {
  it('streams a preview while a leased reply is running, then swaps to saved items', async () => {
    let finish!: () => void
    fixture.items.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'saved', role: 'character', content: '완료' }])
    fixture.inbox.mockImplementation(async (_now, options) => {
      options.stream.onDraft('lease', '작성 중')
      await new Promise<void>(resolve => { finish = resolve })
      options.stream.onReset('lease')
    })
    const events = vi.fn()
    const reading = readMessengerStream(await GET(new Request('http://localhost/api/messages?sessionId=owned&stream=1')), events)
    await vi.waitFor(() => expect(events).toHaveBeenCalledWith({type:'draft',id:'lease',text:'작성 중'}))
    expect(events.mock.calls.some(([e]) => e.type === 'done')).toBe(false)
    finish(); await reading
    expect(events.mock.calls.map(([e]) => e.type)).toEqual(['items','draft','reset','items','done'])
    expect(events.mock.calls.at(-2)![0].items[0].id).toBe('saved')
  })
  it.each([false, true])('checks authentication and ownership before starting a worker (%s)', async loggedIn => {
    if (!loggedIn) fixture.user.mockResolvedValue(null)
    else fixture.items.mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/api/messages?sessionId=other&stream=1'))
    expect(res.status).toBe(loggedIn ? 404 : 401)
    expect(fixture.inbox).not.toHaveBeenCalled()
  })
  it('finishes a failed preview without manufacturing a saved message', async () => {
    fixture.inbox.mockRejectedValue(new Error('fixture failure'))
    const events = vi.fn()
    await readMessengerStream(await GET(new Request('http://localhost/api/messages?sessionId=owned&stream=1')), events)
    expect(events.mock.calls.map(([e]) => e.type)).toEqual(['items','done'])
  })
})
