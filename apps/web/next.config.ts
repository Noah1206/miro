import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@miro/domain', '@miro/db', '@miro/config', '@miro/providers'],
}

export default config
