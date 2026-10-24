export type InstallPlatform = 'ios' | 'android' | 'desktop'

export function installPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || /Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'
  return /Android/i.test(userAgent) ? 'android' : 'desktop'
}

export function embeddedBrowser(userAgent: string): boolean {
  return /KAKAOTALK|Instagram|FBAN|FBAV|NAVER|Line\//i.test(userAgent)
}

export function standaloneDisplay(target: Window = window): boolean {
  return target.matchMedia('(display-mode: standalone)').matches
    || target.matchMedia('(display-mode: fullscreen)').matches
    || (target.navigator as Navigator & { standalone?: boolean }).standalone === true
}
