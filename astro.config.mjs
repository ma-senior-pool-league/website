import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // TODO: set `site` to the real production URL once a domain is chosen
  // (needed for canonical URLs, sitemaps and social-share tags).
  // site: 'https://www.example.org',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
