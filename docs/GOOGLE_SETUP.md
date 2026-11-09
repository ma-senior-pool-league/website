# One-time setup: Google + hosting

For the person setting the site up (Michael). Allow an afternoon. Once this is done, the league
runs everything from Google, and nobody needs to touch code for routine updates. Richard's
day-to-day instructions are in [COMMISSIONER_GUIDE.md](COMMISSIONER_GUIDE.md).

**Preview first.** Steps 1–9 give only Michael access. The site runs at its real address with the
preview banner up, so it can be tested and improved for as long as needed. Nothing costs money,
and nothing is announced. Step 10 brings Richard in once the site is ready to show: he sees the
running site and the documents together, and gets access then.

## How it fits together

```text
Captain's phone ──► Google Form (score sheet photo + score)
                        │  photo ──► league Google Drive (Form "File responses" folder)
                        ▼
              League Google Sheet  ◄── Richard edits schedules, teams, rosters, news, playoffs, settings
              (one tab per kind of data; tabs published as CSV)
                        │
   Apps Script emails the reader ──► a volunteer's own AI agent reads the photo ──► Games tab
                                     (one row per game; the optional paid reader can do this instead)
   Apps Script asks the host to rebuild (after a form submit, within ~20 min of any tab change,
   daily, or on demand)
                        ▼
   Web host (Netlify or Cloudflare Pages) runs `npm run build`
     = scripts/sync-sheet.mjs (downloads the published tabs) + astro build
                        ▼
                 The public website  (+ /data-check/ page listing any rows it skipped)
```

Bad data never takes the site down. A tab that can't be read keeps its last good copy, and a bad
row is skipped. Both are listed in plain language on `/data-check/`.

## 1. Create a dedicated league Google account

Yes, use a dedicated account rather than yours or Richard's. Everything uploaded through the form
is stored in the form owner's Drive and counts against that account's storage. Anything a person
creates stays owned by that person. A league account means nothing is lost when people change.

- Create a free Gmail account named for the league (pick any available name), with the name
  **MA Senior Pool League**. That's what people see on emails it sends.
- **Set it up for Michael alone for now.** Step 10 adds Richard, after which **two people can
  always sign in** and neither has to wait for the other.
  - **Sign in with a passkey, not the password.** Michael signs in to the league account on his
    phone and adds a passkey (Google Account → Security & sign-in → Passkeys and security keys →
    Create a passkey). From then on, signing in takes the phone's fingerprint, face or PIN, with
    no password and no code. Leave **Skip password when possible** turned on (same page), so
    Google offers the passkey first.
  - **Password, as a fallback only:** Google requires one and won't let you remove it. Make it
    long and random, and keep it in a password manager.
  - **2-Step Verification:** turn it on, with an authenticator app. It protects signing in with
    the password (a passkey already counts as both steps). Print the backup codes (Google Account
    → Security & sign-in → 2-Step Verification → Backup codes).
  - **Recovery:** Google allows one recovery phone and one recovery email. Use Michael's personal
    email as the recovery email, and Michael's mobile as the recovery phone until step 10.
  - **When someone hands over** (later on): remove their passkey (Passkeys and security keys) and
    their phone (Security & sign-in → Your devices), since Android sometimes adds a passkey on its
    own. Then change the password and their recovery option, and get new backup codes.
- **Create everything below while signed in as the league account** (Sheet, Form, Drive folders,
  Photos album, web host), so the league owns all of it. The one exception is GitHub (step 6).
  In Drive, make one top-level folder, **MA Senior Pool League**, and keep the League Data sheet,
  the form and the website documents folder inside it.
- **Day to day, everyone works from their own Google account.** Share the top-level folder with
  Michael's own account as **Editor** now (step 10 adds Richard). That shares everything inside it.
  Nobody signs in to the league account except for setup and the occasional admin task.
- **A file belongs to whoever creates it,** even inside the shared folder. Create league files as
  the league account, or move them over afterwards: **Share →** the league account **→ Transfer
  ownership**, then accept the request in the league account's Gmail.
- **Storage:** the free 15 GB is shared by Gmail, Drive and Photos. Score-sheet photos are about
  2–4 MB each, roughly 0.5 GB a season. Photos will use the most. If it fills up, Google One
  100 GB is about $2/month.

## 2. Build the League Sheet from the starter data

The starter data is in this repository at `src/data/league/*.csv`. It includes the real locations,
teams, rules documents and Greater Boston Fall 2026 data.

1. In Google Sheets, create a blank spreadsheet named **League Data**.
2. For each CSV except `results.csv`: **File → Import → Upload → (choose the file) → Insert new
   sheet(s) → Import data**. Rename each tab to match: Settings, Seasons, Divisions, Locations,
   Teams, Players, Schedule, Games, Playoffs, News, Documents, Contacts. Delete the empty "Sheet1".
3. **Keep each tab's first row exactly as it is.** Those are the column names the website looks
   for. Extra columns to the right are fine and ignored.
4. Recommended, to prevent typos: add dropdowns (**Data → Data validation**):
   - Schedule `season` → range `Seasons!A2:A`
   - Schedule `division` → `Divisions!A2:A`
   - Schedule `home` / `away` → `Teams!A2:A`
   - Teams `division` → `Divisions!A2:A`
   - Teams `home_location` → `Locations!A2:A`
5. Dates and times can be typed the normal way (`9/3/2026`, `11:00 AM`). The website understands
   both.

## 3. Create the score-sheet form

1. In the League Data sheet, choose **Tools → Create a new form**. This links the form's responses
   to this spreadsheet as a new tab, "Form Responses 1".
2. Title: **Submit a completed score sheet**. Add these questions **in this order, with these
   titles**:

   | # | Question title | Type | Notes |
   | --- | --- | --- | --- |
   | 1 | Season | Dropdown | e.g. `Fall 2026`. Must match the Seasons tab |
   | 2 | Week | Dropdown | 1, 2, 3 … 15 |
   | 3 | Home team | Dropdown | All team names, exactly as on the Teams tab |
   | 4 | Away team | Dropdown | Same list |
   | 5 | Home team games won | Short answer | Response validation: Number, ≥ 0. Include tie-breaker games |
   | 6 | Away team games won | Short answer | Same |
   | 7 | Score sheet photo | File upload | Allow images and PDF; max 5 files; 10 MB |
   | 8 | Submitted on behalf of | Short answer | Optional; for when Richard or a coordinator submits for a captain |
   | 9 | Notes | Paragraph | Optional |

   Choosing **File upload** asks you to confirm that files go to the form owner's Drive and that
   people must sign in to Google to submit. Click **Continue**.
3. **Settings:** Responses → *Collect email addresses* = **Verified**. *Limit to 1 response* =
   **Off**, so the same person can submit many times (Richard submitting for several captains).
4. **Publish the form.** Click **Publish**, then **Manage** next to Responders, and set *Responder
   view* to **Anyone with the link** (the default, "Specific people", would shut captains out).
   Click **Publish** again. The link under the Published button is the one for Settings →
   `score_sheet_form_url`.
5. **Load the Fall 2026 results:** open `results.csv` and paste its rows (without the header) into
   "Form Responses 1", starting in the **Season** column. Its columns line up: Season, Week, Home
   team, Away team, Home games, Away games, Score sheet photo. Leave Timestamp and Email blank.
   Where the Email column sits depends on when email collection was turned on, so go by the
   column names, not letters. Google Forms puts each new response right under the header, above
   these pasted rows. That's fine: the website goes by the Timestamp, not the row, to tell which
   of two different results for a match was sent in later.
6. **Make a public-safe Results tab.** "Form Responses 1" contains submitters' email addresses, so
   it must never be published. Add a new tab named **Results** and put this in cell A1:

   ```text
   =LET(r, 'Form Responses 1'!A:Z, h, CHOOSEROWS(r, 1), FILTER(CHOOSECOLS(r, XMATCH({"Season","Week","Home team","Away team","Home team games won","Away team games won","Score sheet photo","Timestamp"}, h)), CHOOSECOLS(r, XMATCH("Season", h)) <> ""))
   ```

   This copies only Season through Score sheet photo, plus the Timestamp, finding them by their
   column names, and updates itself as responses arrive. If you ever rename a form question, change it here too.
7. *Optional, if Richard wants to approve results before they go live:* type `Approved` in the first
   empty header cell of "Form Responses 1", insert checkboxes below it, and add `,"Approved"` after
   `"Timestamp"` in the formula. Unticked results are held back and counted on
   `/data-check/`.
8. **Score-sheet photos** land in Drive in a folder named after the form ("… (File responses)").
   Keep its general access **Restricted**. Share it (Viewer) with the coordinators who should see
   completed sheets. In Settings, `show_score_sheet_links` = `yes` adds a "View" link next to each
   result on the website. Only people the folder is shared with can open it; others see "Request
   access", which emails the league account.

## 4. Publish the tabs

**File → Share → Publish to web.**

1. **First limit what gets published.** Open **Published content & settings**, change "Entire
   document" to just the tabs below (untick Entire document, then tick each one). **Leave "Form
   Responses 1" unticked.** Publishing the entire document would make its email addresses
   readable by anyone who guesses the tab's link. Leave "Automatically republish when changes
   are made" ticked, then click **Start publishing**.
2. For each tab below: choose the tab and **Comma-separated values (.csv)** under Link, and copy
   the link into `league-sheets.json` next to its file name. (All the links share one long code
   and differ only in `gid=`, the tab's number.)

| Tab | File in `league-sheets.json` |
| --- | --- |
| Settings | `settings.csv` |
| Seasons | `seasons.csv` |
| Divisions | `divisions.csv` |
| Locations | `locations.csv` |
| Teams | `teams.csv` |
| Players | `players.csv` |
| Schedule | `schedule.csv` |
| Games | `games.csv` |
| **Results** (not "Form Responses 1") | `results.csv` |
| Playoffs | `playoffs.csv` |
| News | `news.csv` |
| Documents | `documents.csv` |
| Contacts | `contacts.csv` |

> ⚠️ A published tab can be read by **anyone who has its link**, even if the website doesn't show
> every column. Never publish "Form Responses 1". Only put contact details on the Contacts tab that
> are OK to be public. The `public` column controls what the website shows, not who can read the
> tab.

Test locally: run `npm run sync`. Every tab should show ✓.

## 5. Photo album

In Google Photos (league account): create an album → **Share** → **Create link** → copy the link
into Settings → `photo_album_url`. A **Photos** item then appears in the site menu. In the album's
**⋮ → Options**, check that **Collaborate** is on, and turn **Share photo location** off: anyone
with the link can see the album.

## 6. Hosting (free)

1. **Code: a free GitHub organization, not a league GitHub account.** GitHub allows one free
   personal account per person and doesn't allow shared logins, so a league GitHub account would
   break its rules (and GitHub blocks new accounts that look like extras). Instead, from Michael's
   own GitHub account: **+ → New organization → Free**, named `ma-senior-pool-league`, contact
   email the league's, owned by **My personal account**. Create a **public** repository in it
   (`website`) and push this repository, including the filled-in `league-sheets.json`. Netlify's
   free plan only builds an organization's repository if it's public. Nothing in it is secret: the
   Sheet links are public anyway, and the README's first lines send anyone who finds it to the
   website. Nobody needs GitHub day to day. Before Michael steps away, invite a
   successor's own GitHub account as a second owner (organization **People → Invite member →
   Owner**).
2. Create a free **Netlify** account with the league email: sign up by email, not "Sign up with
   GitHub". (Cloudflare Pages works the same way.) Add a site from GitHub, and when GitHub asks,
   give Netlify access to the organization's `website` repository only. Use these settings:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variable: `NODE_VERSION` = `24`
3. In the host's settings, create a **build hook / deploy hook** and copy its URL (needed in
   step 7).
4. **Web address: use the host's free one.** No custom domain, so there's nothing to buy or renew. Pick
   the name when you create the site (e.g. `ma-senior-pool-league`), which gives an address like
   `https://ma-senior-pool-league.netlify.app` or `https://ma-senior-pool-league.pages.dev`. Set
   `site` in `astro.config.mjs` to it. Changing the name or host later changes the address, so settle
   it before the site is announced (renaming during the preview is harmless). A custom domain can
   still be added at any time without rebuilding anything.
5. **New Netlify sites start Private:** only people signed in to the league's Netlify account can
   see them; everyone else gets an error page. Keep it that way during the preview. Click **Make
   public** on the site's overview page before showing Richard (step 10). While it's private, a
   reader's AI agent can't open `/score-sheet-agent.md`; give it `docs/SCORE_SHEET_AGENT.md` from
   GitHub instead.

*Free-tier limits change, so check the host's current numbers. Expect roughly 100 builds a month
in season: one per batch of submissions, plus one daily.*

## 7. Automatic updates (Apps Script)

1. In the League Data sheet: **Extensions → Apps Script**. Replace the contents with
   [`google/apps-script.gs`](../google/apps-script.gs) and save.
2. **Project Settings** (gear icon) → **Script properties** → add `DEPLOY_HOOK_URL` = the hook URL
   from step 6.
3. **Signed in as the league account**, choose **setUp** in the toolbar and click **Run**. Approve
   the permissions (Google warns that the app is unverified: click *Advanced → Go to …*). The
   automatic jobs belong to whoever runs setUp. Run from a personal account, the reader emails would
   come from that person, and everything would stop if their access were removed.
4. Reload the spreadsheet. A **League website** menu appears with **Update website now**.

The site now rebuilds about 6 minutes after each form submission (after the last one, if several
come in close together), within about 20 minutes of any change to the spreadsheet (a check runs
every 15 minutes), every morning at 5 AM, and when anyone uses the menu. It also emails the score-sheet reader about each new submission (step 8). Google takes a few minutes to refresh published tabs, hence the delay.

## 8. Reading score sheets (for player stats)

Player stats come from the **Games** tab: one row per game, saying who played and who won. Someone
has to turn each score-sheet photo into those 16 rows. The league pays for nothing, so by default a
**volunteer's own AI agent** does it.

**First, rosters.** Fill the Players tab with one row per player (team, full name). Add
`also_known_as` only for nicknames that aren't a first name (for example "PC"). First names are
matched automatically when only one player on the team has that name.

### 8A. A volunteer's own AI agent (default)

1. Set `site_url` in Settings to the website's address. The emails then link to the instructions.
2. Set `reader_email` in Settings to the volunteer's email (several are allowed, comma-separated).
   Each new submission sends them a **"New score sheet to read"** email with the match, the
   captain's score, the photo link and the spreadsheet row.
3. Share the League Data sheet (Editor) and the form's photo folder (Viewer) with the volunteer's
   Google account.
4. The volunteer gives their agent the instructions at **`/score-sheet-agent/`** on the website
   (plain text at `/score-sheet-agent.md`; source `docs/SCORE_SHEET_AGENT.md`). They connect the
   agent to their Google account, and have it run when the email arrives or on a schedule. An agent
   that can't write to Sheets produces tab-separated rows for the volunteer to paste.
5. The website rebuilds by itself after the agent adds rows. The **Data check** page lists sheets
   still waiting to be read and any reading that doesn't add up.

Handing over to a new volunteer means changing `reader_email` and the sharing in steps 2–3.
Nothing else changes.

### 8B. Automatic reader (optional, paid)

If the league ever has a way to pay (about $15–25 a season), `google/score-sheet-reader.gs` reads
every photo with Claude through Anthropic's API, with nobody involved. It writes the same Games rows
as an agent would.

1. Create an Anthropic account (console.anthropic.com) with the league email. Add a card and a
   small amount of credit, turn on auto-reload, and set a monthly spend limit.
2. Create an API key. In Apps Script: **Project Settings → Script properties** → add
   `ANTHROPIC_API_KEY` = the key.
3. In the Apps Script editor click **+ → Script**, name it `score-sheet-reader`, and paste in
   [`google/score-sheet-reader.gs`](../google/score-sheet-reader.gs).
4. **Services (+) → Drive API → Add**. It's used to get a resized copy of each photo, which also
   converts iPhone photos.
5. Run **setUp** again, as the league account, and approve the new permissions. The log should say "Automatic (paid)
   reader: on".
6. Set `alert_email` in Settings. An email arrives only when a sheet needs a look or couldn't be
   read.
7. Test with a real photo. Within about 10 minutes, Form Responses 1 shows **Reader status: read**
   and the Games tab gets 16 rows.

It checks each reading the same way the website does: 4 games per round, one winner each, and
totals equal to the captain's score. A failed check is reread more carefully, then flagged in the
check column. The photos (with players' names) go to Anthropic's API, which by default doesn't use
API data to train its models. Its live API call hasn't been tested yet.

## 9. Settings tab

| key | value |
| --- | --- |
| `notice` | Banner across every page; **clear it when the site goes live** |
| `contact_email` | General league email shown in the footer and on Contact |
| `score_sheet_form_url` | The form's link (Send → link icon). Adds "Submit a completed score sheet" buttons |
| `photo_album_url` | Shared Google Photos album link |
| `show_score_sheet_links` | `yes` to show "View" links to uploaded score sheets |
| `rules_url` | When the rules change: link to the new rules (Google Doc or PDF). The Rules page then points there instead of the July 2024 text |
| `bca_rules_url`, `wpa_rules_url`, `upa_rules_url` | Links to those rule books |
| `player_names` | `initial` (default) shows "Michael R." on the website; `full` shows "Michael Rowley" |
| `player_min_games` | Games needed to appear in the player leaders table (default 30) |
| `site_url` | The website's address; used in the "New score sheet to read" emails |
| `reader_email` | Who gets a "New score sheet to read" email for each submission (comma-separated for several) |
| `alert_email` | Where the optional automatic reader sends "needs a look" emails |

## 10. Test, then bring Richard in

Until now only Michael has access. Keep the preview banner (Settings → `notice`) up, and test and
improve the site for as long as needed.

1. **End-to-end test:** submit a test score sheet, wait about 15 minutes, and check the division
   page and `/data-check/`. Then delete the test row from "Form Responses 1" and click **Update
   website now**.
2. **Show Richard the running site** along with the documents, and go through the questions in
   [PROJECT_PLAN.md](PROJECT_PLAN.md) ("Questions for Richard"). First make the Netlify site
   public (step 6), or he'll get an error page.
3. **Let him sign in to the league account** (step 1), signed in as the league account:
   - On his phone, he adds a passkey (Security & sign-in → Passkeys and security keys → Create a
     passkey).
   - Change the recovery phone to his mobile. Michael's email stays the recovery email, so either
     of them can recover the account alone.
   - 2-Step Verification → Authenticator → **Change authenticator app**, and scan the new QR code
     on both phones before finishing.
   - Give him a copy of the password (a shared password-manager entry or a sealed copy) and a
     printed set of the backup codes.
4. **Share with his own Google account:** the top-level **MA Senior Pool League** folder as
   **Editor** (that covers the League Data sheet and the website documents folder). Also add him
   as a collaborator on the **form**, share the form's **photo folder** with him (step 3), and
   invite him to the **Photos album**. Coordinators get Editor on the sheet only if they'll be
   updating it.
5. Give him [COMMISSIONER_GUIDE.md](COMMISSIONER_GUIDE.md) and have him bookmark the League Data
   sheet and `/data-check/`.

**Going live:** load the remaining divisions and rosters, clear the banner, and tell the
coordinators and captains.

## What still needs a developer

Changing the layout or design, adding new kinds of pages, or replacing the built-in rules text.
That last one can be avoided with `rules_url`. Everything else is in the Sheet.
