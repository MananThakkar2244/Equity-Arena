import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:5001',
      '/stocks': 'http://localhost:5001',
      // Regex, not a prefix: a plain '/trade' also swallows the '/trader'
      // page route and hands it to Express, which 404s on refresh.
      '^/trade/': 'http://localhost:5001',
      '/portfolio': 'http://localhost:5001',
      '/admin': 'http://localhost:5001',
      // Without these the calls fall through to Vite's SPA fallback and come
      // back as HTML — which is why the session clock read NaN and the news
      // feed was always empty.
      '/session': 'http://localhost:5001',
      '/news': 'http://localhost:5001',
      '/orders': 'http://localhost:5001',
      '/socket.io': {
        target: 'http://localhost:5001',
        ws: true
      }
    }
  }
});
