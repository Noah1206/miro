'use client'

/** Navigate immediately, without snapshot transitions or animation delays. */
export function startNavigation(_direction: 'forward' | 'back', navigate: () => void) {
  navigate()
}

/** Retained for existing layout callers; navigation no longer waits for settlement. */
export function settleNavigation() {}
