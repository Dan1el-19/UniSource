import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll } from 'vitest'

declare module 'cloudflare:test' {
  interface ProvidedEnv extends CloudflareBindings {
    TEST_MIGRATIONS: D1Migration[]
  }
}

beforeAll(async () => {
  await applyD1Migrations(env.usrc_d1, env.TEST_MIGRATIONS)
})
