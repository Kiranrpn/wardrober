import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the same build works on a subpath host and inside a
// Capacitor/Cordova native shell without rebuilding.
export default defineConfig({
  base: './',
  plugins: [react()],
})
