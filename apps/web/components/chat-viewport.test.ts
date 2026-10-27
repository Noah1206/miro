import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindChatComposerFollow, bindChatViewport, chatViewportState } from './chat-viewport'
const full = {height:800,width:390,scale:1,offsetTop:0,offsetLeft:0}
describe('chat keyboard viewport', () => {
  it('fits the visible viewport with the keyboard open', () => {
    expect(chatViewportState({...full,height:450,offsetTop:40},800,true)).toMatchObject({keyboard:true,height:450,top:40,width:390,left:0})
  })
  it('still detects the keyboard after Safari has zoomed an input', () => {
    expect(chatViewportState({...full,height:400,width:350,scale:1.1,offsetLeft:20},800,true)).toMatchObject({keyboard:true,width:350,left:20})
  })
  it('does not mistake pinch zoom or a browser toolbar for a keyboard', () => {
    expect(chatViewportState({...full,height:400,width:195,scale:2},800,true).keyboard).toBe(false)
    expect(chatViewportState({...full,height:720},800,true).keyboard).toBe(false)
  })
  it('releases keyboard layout when focus leaves the chat', () => {
    expect(chatViewportState({...full,height:450},800,false).keyboard).toBe(false)
  })
  it('waits for the visible viewport to recover after blur', () => {
    expect(chatViewportState({...full,height:450},800,false,true).keyboard).toBe(true)
    expect(chatViewportState(full,800,false,true).keyboard).toBe(false)
  })
  it('uses the new orientation baseline rather than the previous portrait height', () => {
    expect(chatViewportState({...full,height:390,width:800},390,true).keyboard).toBe(false)
    expect(chatViewportState({...full,height:220,width:800},390,true).keyboard).toBe(true)
  })
})


describe('chat composer bottom anchor', () => {
  afterEach(() => vi.unstubAllGlobals())
  function setup() {
    const composer = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const room = { querySelector: vi.fn(() => composer) }
    const transcript = { closest: vi.fn(() => room) } as unknown as HTMLElement
    const frames = new Map<number, FrameRequestCallback>()
    let sequence = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    const resume = vi.fn()
    const cleanup = bindChatComposerFollow(transcript, resume)
    const focus = (isInput: boolean) => {
      const listener = composer.addEventListener.mock.calls[0]![1] as EventListener
      listener({ target: { matches: () => isInput } } as unknown as Event)
    }
    const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }
    return { resume, focus, flush, cleanup, composer, frames }
  }
  it('resumes bottom following when typing after reading older messages and after focus reflow', () => {
    const { focus, resume, flush } = setup()
    focus(true)
    expect(resume).toHaveBeenCalledTimes(1)
    flush()
    expect(resume).toHaveBeenCalledTimes(2)
  })
  it('does not jump to the bottom when opening a model or menu button', () => {
    const { focus, resume, frames } = setup()
    focus(false)
    expect(resume).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })
  it('cancels pending alignment and removes its focus listener on navigation', () => {
    const { focus, resume, flush, cleanup, composer } = setup()
    focus(true)
    cleanup()
    flush()
    expect(resume).toHaveBeenCalledTimes(1)
    expect(composer.removeEventListener).toHaveBeenCalledWith('focusin', composer.addEventListener.mock.calls[0]![1])
  })
})


describe('chat visible viewport binding', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('tracks keyboard animation and Safari viewport panning, then restores the full room', () => {
    const viewport = Object.assign(new EventTarget(), { height: 800, width: 390, scale: 1, offsetTop: 0, offsetLeft: 0 })
    const win = Object.assign(new EventTarget(), { visualViewport: viewport, innerHeight: 800, innerWidth: 390, scrollY: 0, scrollTo: vi.fn() })
    class Textarea { closest() { return {} } }
    const doc = Object.assign(new EventTarget(), { activeElement: new Textarea() as Textarea | null })
    const styles = new Map<string, string>()
    const room = { dataset: {} as Record<string, string>, style: { setProperty: (key: string, value: string) => styles.set(key, value) },
      contains: () => true, getBoundingClientRect: () => ({ top: 0 }) } as unknown as HTMLElement
    const frames = new Map<number, FrameRequestCallback>()
    let sequence = 0
    vi.stubGlobal('window', win); vi.stubGlobal('document', doc)
    vi.stubGlobal('HTMLTextAreaElement', Textarea); vi.stubGlobal('HTMLInputElement', class {})
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }
    const cleanup = bindChatViewport(room)
    viewport.height = 450; viewport.offsetTop = 30
    viewport.dispatchEvent(new Event('resize')); flush()
    expect(room.dataset.keyboard).toBe('true')
    expect(styles.get('--chat-visible-height')).toBe('450px')
    expect(styles.get('--chat-visible-top')).toBe('30px')
    viewport.height = 420; viewport.offsetTop = 45
    viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll')); flush()
    expect(styles.get('--chat-visible-height')).toBe('420px')
    expect(styles.get('--chat-visible-top')).toBe('45px')
    doc.activeElement = null; doc.dispatchEvent(new Event('focusout')); flush()
    expect(room.dataset.keyboard).toBe('true')
    viewport.height = 800; viewport.offsetTop = 0
    viewport.dispatchEvent(new Event('resize')); flush()
    expect(room.dataset.keyboard).toBe('false')
    cleanup()
    viewport.height = 300; viewport.dispatchEvent(new Event('resize')); flush()
    expect(styles.get('--chat-visible-height')).toBe('800px')
  })
})
