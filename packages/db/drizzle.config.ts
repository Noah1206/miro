import type { Config } from 'drizzle-kit'

export default {
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  /** DDL 은 세션을 오래 쥔다 — Supabase 라면 pooler(6543) 가 아니라 직결(5432)로. */
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL! },
} satisfies Config
