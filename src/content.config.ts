import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Only the rules live in Markdown: they are a word-for-word transcription of the
 * league's rules PDF and change rarely. Everything else comes from the league
 * Google Sheet (src/data/league/).
 */
const rules = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/rules' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
  }),
});

export const collections = { rules };
