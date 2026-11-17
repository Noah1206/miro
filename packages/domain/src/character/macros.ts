/**
 * 11/18 다른 플랫폼(바베챗 등)에서 쓰던 설정을 그대로 붙여 넣어도 되게 — {{char}}·{{user}} 표기를 캐릭터 이름·사용자 이름으로 바꾼다.
 * 대소문자·안쪽 공백을 가리지 않고, <char>·<user> 표기도 같이 받는다. 사용자 이름을 모르면 '사용자'.
 */
const CHAR = /\{\{\s*char\s*\}\}|<char>/gi
const USER = /\{\{\s*user\s*\}\}|<user>/gi

export function fillCharacterMacros(text: string, char: string, user?: string | null): string {
  if (!text || !text.includes('{') && !text.includes('<')) return text
  return text.replace(CHAR, () => char).replace(USER, () => user?.trim() || '사용자')
}
