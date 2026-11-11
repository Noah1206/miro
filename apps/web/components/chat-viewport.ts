/** Compare physical visible height so pinch/input zoom alone never looks like a keyboard. */
export function chatViewportState(viewport: { height: number; width: number; scale: number; offsetTop: number; offsetLeft: number }, baselineHeight: number, focused: boolean, wasOpen = false) {
  return { keyboard: (focused || wasOpen) && baselineHeight - viewport.height * viewport.scale > 120,
    height: viewport.height, width: viewport.width, top: viewport.offsetTop, left: viewport.offsetLeft }
}

/** Fit just the room to the keyboard; never scroll the whole document to follow the caret. */
export function bindChatViewport(element: HTMLElement) {
  const viewport = window.visualViewport
  if (!viewport) return () => {}
  let baselineHeight = Math.max(window.innerHeight, viewport.height * viewport.scale)
  let layoutWidth = window.innerWidth
  let keyboard = false
  let frame = 0
  let roomTop = 0
  const update = () => {
    frame = 0
    // A rotation/split-screen change starts a new baseline. Pinch zoom does not.
    if (Math.abs(window.innerWidth - layoutWidth) > 80) {
      layoutWidth = window.innerWidth
      baselineHeight = window.innerHeight
      keyboard = false
    }
    // Layout and visual viewport rotation events can arrive in different frames.
    // Do not carry the old portrait height into the new landscape baseline.
    if (Math.abs(viewport.width * viewport.scale - layoutWidth) > 24) return
    baselineHeight = Math.max(baselineHeight, window.innerHeight, viewport.height * viewport.scale)
    const active = document.activeElement
    const focused = (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)
      && !!active.closest('[data-chat-composer]') && element.contains(active)
    // Blur can precede the keyboard's closing animation. Keep the compact layout until it actually closes.
    const state = chatViewportState(viewport, baselineHeight, focused, keyboard)
    if (!keyboard && state.keyboard) roomTop = element.getBoundingClientRect().top + window.scrollY
    const closed = keyboard && !state.keyboard
    keyboard = state.keyboard
    element.dataset.keyboard = String(keyboard)
    element.dataset.inputFocused = String(focused)
    element.style.setProperty('--chat-visible-height', `${state.height}px`)
    element.style.setProperty('--chat-visible-width', `${state.width}px`)
    element.style.setProperty('--chat-visible-top', `${state.top}px`)
    element.style.setProperty('--chat-visible-left', `${state.left}px`)
    if (closed && Math.abs(window.scrollY - roomTop) > 1) window.scrollTo({ top: roomTop, behavior: 'instant' })
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
  // 11/11 사용자: 입력창 아래가 빈다 — iOS(특히 홈 화면 앱)는 키보드가 닫힌 뒤 화면 크기 이벤트를 안 줄 때가 있어 방이 키보드 열린 높이에 멈췄다.
  // 포커스가 빠지면 닫히는 애니메이션이 끝날 때쯤 몇 번 더 잰다.
  const timers: number[] = []
  const settle = () => { schedule(); timers.push(window.setTimeout(schedule, 350), window.setTimeout(schedule, 800), window.setTimeout(schedule, 1500)) }
  update()
  viewport.addEventListener('resize', schedule)
  viewport.addEventListener('scroll', schedule)
  window.addEventListener('resize', schedule)
  window.addEventListener('pageshow', schedule)
  document.addEventListener('focusin', schedule)
  document.addEventListener('focusout', settle)
  document.addEventListener('visibilitychange', schedule)
  return () => {
    cancelAnimationFrame(frame)
    viewport.removeEventListener('resize', schedule)
    viewport.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    window.removeEventListener('pageshow', schedule)
    document.removeEventListener('focusin', schedule)
    document.removeEventListener('focusout', settle)
    timers.forEach(clearTimeout)
    document.removeEventListener('visibilitychange', schedule)
  }
}

/** Resume the latest reply when typing begins, then align again after focus layout settles.
 * ResizeObserver in each transcript keeps this anchor through the keyboard animation.
 * Opening menus and browsing older messages must not move the transcript.
 */
export function bindChatComposerFollow(transcript: HTMLElement, resume: () => void) {
  const composer = transcript.closest('[data-chat-theme]')?.querySelector('[data-chat-composer]')
  if (!composer) return () => {}
  let frame = 0
  const focus = (event: Event) => {
    if (!(event.target as Element | null)?.matches?.('textarea, input')) return
    resume()
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { frame = 0; resume() })
  }
  composer.addEventListener('focusin', focus)
  return () => {
    cancelAnimationFrame(frame)
    composer.removeEventListener('focusin', focus)
  }
}
