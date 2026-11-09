# MA Senior Pool League website

> **Looking for standings, schedules or results?** They're on the league website,
> **https://ma-senior-pool-league.pages.dev**. This page only holds the code behind it, for the
> volunteers who maintain the site. The data files here are starter copies and may be out of date:
> the league's Google Sheet is the real source.

Website for the MA Senior Pool League, a Massachusetts senior 8-ball travel league: standings,
division schedules and results by season, playoffs, playing locations, rules, printable forms,
score-sheet submission, photos and news. The main audience is the four Division Coordinators and
the team captains.

**How it works:** a static [Astro](https://astro.build) site that rebuilds itself from the league's
Google Sheet. Score sheets come in through a Google Form. A volunteer's own AI agent reads each
photo into a Games tab, which drives the player stats; the instructions are at `/score-sheet-agent/`.
The league runs everything from Google, with no code edits for routine updates and nothing to pay
for.

| Doc | For |
| --- | --- |
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | Requirements, decisions, data issues, questions for Richard |
| [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md) | One-time setup: league Google account, Sheet, Form, hosting, automatic updates |
| [docs/COMMISSIONER_GUIDE.md](docs/COMMISSIONER_GUIDE.md) | Plain-language guide for the commissioner |
| [docs/SCORE_SHEET_AGENT.md](docs/SCORE_SHEET_AGENT.md) | Instructions for a volunteer's AI agent that reads score sheets (published at `/score-sheet-agent/`) |
| [src/data/league/README.md](src/data/league/README.md) | Every tab and column |

> **Status:** preview. Real locations, teams, rules and the Greater Boston Fall 2026 schedule and
> results are loaded; other divisions are pending. Google setup not done yet.

## Quick start

Requires Node 22.23.4 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:4321.

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server (uses the CSVs in `src/data/league/` as they are) |
| `npm run build` | Downloads the published Sheet tabs (if linked), then builds into `dist/` |
| `npm run sync` | Just the download step; fails loudly if a tab can't be read |
| `npm run preview` | Serves the built `dist/` locally |
| `npm run check` | TypeScript / Astro type check |

## Data flow

```text
League Data Google Sheet ──(tabs published as CSV, links in league-sheets.json)──►
  scripts/sync-sheet.mjs ──► src/data/league/*.csv ──► src/lib/league.ts ──► pages
```

- Each tab is one CSV in `src/data/league/`. The committed CSVs are the fallback and starter data.
  A tab that can't be downloaded keeps its last good copy.
- People type names ("Walpole A"); ids and URLs come from the names. Dates like `9/3/2026` and
  times like `11:00 AM` are fine.
- **Bad rows never break the build.** They're skipped, printed in the build log and listed on
  `/data-check/`.
- Standings: matches won, then games won. Scores include tie-breaker games, so they can't be tied.
- `google/apps-script.gs` runs inside the Sheet and asks the host to rebuild after form submissions,
  daily, and from a **League website → Update website now** menu.

Only the rules text lives in code (`src/content/rules/`, transcribed word for word from the July
2024 PDF). When the rules change, the commissioner sets `rules_url` in Settings and the Rules page
points there instead.

## Project layout

```text
src/
  site.config.ts      name, tagline, timezone, navigation (things that change only with a redesign)
  lib/schema.mjs      tab/column definitions, shared with the sync script
  lib/league.ts       loads, checks and combines the tabs; computes standings
  lib/format.ts       date/time display helpers
  data/league/        one CSV per Sheet tab
  content/rules/      league rules (Markdown)
  components/         StandingsTable, SeasonStandings, MatchTable, PlayoffTable, PlayerStats
  pages/              one file per page; seasons/[season]/[division] for division pages
  styles/global.css   all styling
scripts/sync-sheet.mjs
google/apps-script.gs           rebuilds, change watcher, reader emails, "Update website now" menu
google/score-sheet-reader.gs    optional paid automatic reader (Claude API); off by default
```
