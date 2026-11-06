import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Saat `npm run dev`, request /api diteruskan ke backend lokal.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_URL || 'http://localhost:3000', changeOrigin: true } },
  },
});
