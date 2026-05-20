import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Base path comes from BASE_URL env so GH Pages can deploy under /<repo>/.
// Defaults to '/' for local dev. Set BASE_URL=/Today-App/ before `vite build`
// to produce a GH-Pages-ready bundle.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_URL || '/',
})
