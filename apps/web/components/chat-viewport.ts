/** Compare physical visible height so pinch/input zoom alone never looks like a keyboard. */
export function chatViewportState(viewport: { height: number; width: number; scale: number; offsetTop: number; offsetLeft: number }, baselineHeight: number, focused: boolean, wasOpen = false) {
  return { keyboard: (focused || wasOpen) && baselineHeight - viewport.height * viewport.scale > 120,
    height: viewport.height, width: viewport.width, top: viewport.offsetTop, left: viewport.offsetLeft }
}

/** Fit just the room to the keyboard; never scroll the whole document to follow the caret. */
export function bindChatViewport(element: HTMLElement) {
  const viewport = window.visualViewport
  if (!viewport) return () => {}
  // 11/17 사용자(모바일): 키보드를 닫았는데 입력창 아래가 크게 빈다 — 기준이 '지금까지 잰 가장 큰 높이'라, 위·아래 툴바가 접혔다 펴지는
  // 브라우저에선 툴바가 다시 나온 것만으로 120px 넘게 줄어 키보드로 보였다. 기준은 '입력 중이 아닐 때 잰 지금 높이'(키보드 열기 직전)로.
  let baselineHeight = Math.max(window.innerHeight, viewport.height * viewport.scale)
  let layoutWidth = window.innerWidth
  let keyboard = false
  let blurAt = 0
  let frame = 0
  let roomTop = 0
  let headerHidden = false
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
    const active = document.activeElement
    const focused = (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)
      && !!active.closest('[data-chat-composer]') && element.contains(active)
    if (!focused && !keyboard) baselineHeight = Math.max(window.innerHeight, viewport.height * viewport.scale)
    // Blur can precede the keyboard's closing animation. Keep the compact layout until it actually closes —
    // 다만 포커스가 빠지고 1.2초가 지나면 키보드는 닫힌 것이다(입력칸 없이 키보드가 떠 있을 수 없다).
    const holding = keyboard && Date.now() - blurAt < 1200
    const state = chatViewportState(viewport, baselineHeight, focused, holding)
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
  // 11/12 사용자: 대화를 위로 올리면(지난 대화 보기) 헤더가 접히고, 아래로 내리면 다시 내려온다 — 키보드와 상관없이, 애니메이션은 chat.module.css.
  // scroll 은 버블링하지 않아 capture 로 받는다. 6px 넘게 움직였을 때만, 입력칸(textarea) 안의 스크롤은 무시.
  const lastTop = new WeakMap<EventTarget, number>()
  const setHidden = (hidden: boolean) => {
    if (hidden === headerHidden) return
    headerHidden = hidden
    if (hidden) element.dataset.headerHidden = 'true'
    else delete element.dataset.headerHidden
  }
  const onScroll = (event: Event) => {
    const el = event.target
    // 11/22: 팝업·시트(role=dialog) 안의 목록 스크롤은 대화 스크롤이 아니다 — 모델 목록을 위로 올리면 입력창째 숨어 목록이 사라졌다.
    if (!(el instanceof HTMLElement) || el instanceof HTMLTextAreaElement || el.scrollHeight <= el.clientHeight || el.closest('[role="dialog"]')) return
    const prev = lastTop.get(el) ?? el.scrollTop
    lastTop.set(el, el.scrollTop)
    const delta = el.scrollTop - prev
    if (delta < -6) setHidden(true)
    else if (delta > 6) setHidden(false)
  }
  element.addEventListener('scroll', onScroll, { capture: true, passive: true })
  // 11/11 사용자: 입력창 아래가 빈다 — iOS(특히 홈 화면 앱)는 키보드가 닫힌 뒤 화면 크기 이벤트를 안 줄 때가 있어 방이 키보드 열린 높이에 멈췄다.
  // 포커스가 빠지면 닫히는 애니메이션이 끝날 때쯤 몇 번 더 잰다.
  const timers: number[] = []
  const settle = () => { blurAt = Date.now(); schedule(); timers.push(window.setTimeout(schedule, 350), window.setTimeout(schedule, 800), window.setTimeout(schedule, 1500)) }
  update()
  viewport.addEventListener('resize', schedule)
  viewport.addEventListener('scroll', schedule)
  window.addEventListener('resize', schedule)
  window.addEventListener('pageshow', schedule)
  document.addEventListener('focusin', schedule)
  document.addEventListener('focusout', settle)
  document.addEventListener('visibilitychange', schedule)
  return () => {
    // 11/12 키보드가 열린 채 방을 나가면(뒤로 가기) 다음 화면이 밀린 채로 남는다 — 키보드가 닫히는 동안 문서를 맨 위로 되돌려 둔다.
    if (keyboard || viewport.offsetTop > 1) {
      const reset = () => { if (window.visualViewport && window.visualViewport.offsetTop > 1 || window.scrollY < 0) window.scrollTo({ top: 0, behavior: 'instant' }) }
      window.scrollTo({ top: 0, behavior: 'instant' }); window.setTimeout(reset, 350); window.setTimeout(reset, 800)
    }
    cancelAnimationFrame(frame)
    element.removeEventListener('scroll', onScroll, { capture: true })
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
