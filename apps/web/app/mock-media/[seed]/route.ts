/**
 * Mock 이미지. Provider 미구성 상태를 시각적으로 명시한다 —
 * 실제 생성물처럼 보이게 만들지 않는다.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ seed: string }> }) {
  const { seed } = await ctx.params
  const hue = parseInt(seed.replace(/\D/g, '').slice(0, 6) || '0', 10) % 360

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 24% 22%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 40) % 360} 18% 12%)"/>
    </linearGradient>
  </defs>
  <rect width="600" height="800" fill="url(#g)"/>
  <text x="300" y="390" text-anchor="middle" fill="#9B9BA1"
        font-family="system-ui,sans-serif" font-size="22">Mock Image</text>
  <text x="300" y="422" text-anchor="middle" fill="#6F6F76"
        font-family="system-ui,sans-serif" font-size="14">Image Provider 미구성</text>
</svg>`

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
