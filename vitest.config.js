import { defineConfig } from 'vitest/config'

// Test-only config (additive — does not touch the app's vite.config.js / build).
// Tests import the REAL shipped modules from src/. We stub the Supabase env
// vars so src/lib/supabase.js (which throws when they're absent) can load in
// the modules that import it; the client itself is mocked per-test via vi.mock.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
