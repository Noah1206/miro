/** Compare physical visible height so pinch/input zoom alone never looks like a keyboard. */
export function chatViewportState(viewport: { height: number; width: number; scale: number; offsetTop: number; offsetLeft: number }, baselineHeight: number, focused: boolean) {
  return { keyboard: focused && baselineHeight - viewport.height * viewport.scale > 120,
    height: viewport.height, width: viewport.width, top: viewport.offsetTop, left: viewport.offsetLeft }
}
