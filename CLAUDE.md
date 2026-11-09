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
- Results come from a Google Form (via a Results tab whose formula picks the form's columns by name), so `results.csv` accepts the form's question
  titles as headers (aliases), matches by season+week+home+away (falling back to a unique
  home/away pairing), tolerates duplicate submissions, and honors an optional `approved` column.
  When two different results conflict, the later `timestamp` wins, not the later row: Google Forms
  inserts each response under the header, above any pasted-in rows (which have no timestamp).
- Each schedule row carries its `division`, so past seasons keep their grouping even if a team moves.
- Standings: matches won, then games won, then name. Scores include tie-breaker games, so ties are
  reported as problems.
- `google/apps-script.gs` runs in the Sheet and POSTs the host's deploy hook (after form submits,
  daily, and from a menu). The host is Cloudflare Pages (`ma-senior-pool-league.pages.dev`, free
  plan: 500 builds/month). Netlify's free plan (~20 builds/month) was too small; don't go back.
- Settings `hide_from_search` = yes adds a robots `noindex` meta tag (used during the preview).
- `google/apps-script.gs` also emails Settings `reader_email` about each submission, and its
  `watchForChanges` trigger (every 15 minutes) rebuilds the site when any tab's values change.
- The form asks only for home/visiting team, both scores, photo (required) and notes. On submit,
  the script fills Season and Week into the response from the Schedule tab (nearest scheduled match
  before the timestamp); `league.ts` infers them too if still blank. Once Reader status is
  read/check/failed, `watchForChanges` emails the submitter what was read (Settings
  `captain_emails`, replies to `contact_email`) and stamps "Captain emailed".
- **Score-sheet reading, default:** the league pays for nothing. A volunteer's own AI agent follows
  `docs/SCORE_SHEET_AGENT.md`, which the site publishes at `/score-sheet-agent/` and as raw text at
  `/score-sheet-agent.md`. It writes Games rows and Reader status. Keep that doc agent-agnostic (no
  product names) and self-contained (no repo-relative links).
- **Optional, off:** `google/score-sheet-reader.gs` is the paid automatic reader (Claude Messages API
  over raw HTTP, structured JSON output, `claude-opus-5-5`, effort `low` then `medium`, key in
  Script Properties `ANTHROPIC_API_KEY`). Its SYSTEM_PROMPT and SCORE_SHEET_AGENT.md describe the
  same reading rules; keep them in step.
- Player stats: `games.csv` + `players.csv` → `season.playerStats` per division. Player names are
  resolved within the team (full name, also_known_as, unique first name; a full name from another
  roster for subs); unknown names become provisional players and a Problem. Public display uses
  `playerName()` (Settings `player_names`: initial | full).
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
