import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // TODO: set `site` to the host's free address once the site is created (needed for canonical
  // URLs, sitemaps and social-share tags). No custom domain is planned.
  // site: 'https://ma-senior-pool-league.netlify.app',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
