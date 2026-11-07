# CLAUDE.md

Website for the "MA Senior Pool League" (Massachusetts senior 8-ball travel league; commissioner
Richard DiBona). Main audience: the four Division Coordinators and team captains. Astro 7 static
site, TypeScript, plain CSS, **driven entirely by the league's Google Sheet** (plus a Google Form
for score sheets, Drive for uploads, Google Photos for the gallery).

**Hard constraint:** the people maintaining this long-term don't code. Anything routine must be
changeable from the Google Sheet. Never require a code edit for content, seasons, links or banners.
Docs: [README.md](README.md), [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) (requirements, decisions,
open questions), [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md),
[docs/COMMISSIONER_GUIDE.md](docs/COMMISSIONER_GUIDE.md).

## Commands

- `npm run dev` — dev server (http://localhost:4321)
- `npm run build` — downloads published Sheet tabs (soft: never fails), then builds to `dist/`
- `npm run check` — `astro check` (type check); run before finishing a change
- `npm run sync` — just the download step (exits 1 if a tab fails)

## Architecture notes

- **All league data goes through `src/lib/league.ts`** (`getLeague()`). It reads one CSV per Sheet tab
  from `src/data/league/` (column definitions and header aliases in `src/lib/schema.mjs`, shared
  with `scripts/sync-sheet.mjs`), resolves names to slug ids, and computes standings per season per
  division. Pages never read CSVs directly.
- **Forgiving by design:** a bad row is skipped and recorded as a `Problem` (shown on `/data-check/`
  and in the build log). Only "no usable seasons at all" throws. Keep messages in plain language
  that names the tab, row and fix. Don't add validation that fails the build.
- People type names, not ids; ids/URLs are `slugify(name)` (or an optional `id` column). Dates and
  times accept US Sheets formats (`parseDate`, `parseTime`).
- Results come from a Google Form (via a QUERY tab), so `results.csv` accepts the form's question
  titles as headers (aliases), matches by season+week+home+away (falling back to a unique
  home/away pairing), tolerates duplicate submissions, and honors an optional `approved` column.
- Each schedule row carries its `division`, so past seasons keep their grouping even if a team moves.
- Standings: matches won, then games won, then name. Scores include tie-breaker games, so ties are
  reported as problems.
- `google/apps-script.gs` runs in the Sheet and POSTs the host's deploy hook (after form submits,
  daily, and from a menu).
- Rules in `src/content/rules/` are a word-for-word transcription of the league's July 2024 rules
  PDF; don't reword them. When rules change, the commissioner sets `rules_url` in Settings and the
  Rules page links there instead.
- Things that change only with a redesign (name, tagline, timezone, nav) are in `src/site.config.ts`.
  Everything else (banner, contact email, form/album/rules links, current season) comes from the
  Settings and Seasons tabs.
- "Upcoming" is computed at build time using `site.timezone` (`todayISO()` in `src/lib/format.ts`).
  Dates are handled as `YYYY-MM-DD` strings / UTC to avoid timezone drift.

## Conventions

- Audience is seniors: keep base text large (18px), high contrast, big tap targets, visible focus,
  semantic HTML, no JS required for content. Don't add client-side JS without a clear need.
- Mobile-first; tables scroll inside `.table-wrap`.
- All styling lives in `src/styles/global.css` (CSS variables at the top). Component-specific
  styles only when truly local.
- Internal links use trailing slashes (`trailingSlash: 'always'`).
- Never invent real-world facts about the league (rules, fees, names, addresses, playoff formats).
  Unknowns go in the "Questions for Richard" list in docs/PROJECT_PLAN.md, not on the site.
- Once the Sheet is linked, the Google Sheet is the source of truth; the CSVs here are starter data
  and fallback. Don't overwrite them without telling the user.
- Never publish (or tell anyone to publish) the "Form Responses 1" tab: it contains email addresses.

## Gotchas

- Run Node commands from the repo root: `getLeague()` resolves data via `process.cwd()`.
- Google takes up to ~5 minutes to refresh a published tab, which is why the Apps Script delays rebuilds.
- `@astrojs/check` needs TypeScript 5 or 6 (TS 7 is not yet supported) — keep `typescript` at `^6`.
