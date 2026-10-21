import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// sourcemap: true supaya ralat dalam Console (F12) tunjuk nama fail dan baris sebenar.
export default defineConfig({
  plugins: [react()],
  build: { sourcemap: true },
});
