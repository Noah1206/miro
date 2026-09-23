'use client'

/** Navigate immediately, without snapshot transitions or animation delays. */
export function startNavigation(_direction: 'forward' | 'back', navigate: () => void, destination?: string) {
  if (destination) window.dispatchEvent(new CustomEvent('miro:route-start', { detail: destination }))
  navigate()
}

/** Retained for existing layout callers; navigation no longer waits for settlement. */
export function settleNavigation() {}
