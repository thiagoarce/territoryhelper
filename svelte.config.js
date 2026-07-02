import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    version: {
      // Checa a cada 60s se saiu versão nova (compara _app/version.json).
      // Alimenta o store `updated` → banner "Atualizar" no layout.
      pollInterval: 60000
    }
  }
};

export default config;
