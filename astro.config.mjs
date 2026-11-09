import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // The host's free address (canonical URLs, sitemaps, social-share tags). No custom domain.
  site: 'https://ma-senior-pool-league.netlify.app',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
