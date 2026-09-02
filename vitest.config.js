import { defineConfig } from 'vitest/config'

// Pin the timezone before Vitest spawns its workers. The date helpers guard a
// bug that only appears west of UTC (`toISOString()` rolling to the next day
// during the evening), so those tests would pass vacuously under TZ=UTC —
// which is exactly how a CI box would run them. America/New_York is where the
// app is actually used.
process.env.TZ = 'America/New_York'

// Test-only config (additive — does not touch the app's vite.config.js / build).
// Tests import the REAL shipped modules from src/. We stub the Supabase env
// vars so src/lib/supabase.js (which throws when they're absent) can load in
// the modules that import it; the client itself is mocked per-test via vi.mock.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
    env: {
      TZ: 'America/New_York',
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
