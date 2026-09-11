import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  session: false,
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['@astrojs/cloudflare'],
    },
    ssr: {
      external: ['@xyflow/react', 'react', 'react-dom'],
    },
  },
});
