# One-time setup: Google + hosting

For the person setting the site up (Michael). Allow an afternoon. Once this is done, the league
runs everything from Google, and nobody needs to touch code for routine updates. Richard's
day-to-day instructions are in [COMMISSIONER_GUIDE.md](COMMISSIONER_GUIDE.md).

## How it fits together

```text
Captain's phone ──► Google Form (score sheet photo + score)
                        │  photo ──► league Google Drive (Form "File responses" folder)
                        ▼
              League Google Sheet  ◄── Richard edits schedules, teams, news, playoffs, settings
              (one tab per kind of data; tabs published as CSV)
                        │
   Apps Script in the Sheet asks the host to rebuild (after each form submit, daily, or on demand)
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

- Create a free Gmail account named for the league (pick any available name).
- **Recovery:** add Richard's mobile number and personal email as recovery options, and turn on
  2-Step Verification.
- **Password:** keep it in a password manager, or in a sealed envelope held by a second league
  officer. At least two people should be able to get in.
- **Create everything below while signed in as the league account** (Sheet, Form, Drive folders,
  Photos album, GitHub, host, domain), so the league owns all of it.
- Richard and the coordinators then work from **their own Gmail accounts**. Share things with them
  as Editors (step 9). Nobody needs to sign in to the league account day to day.
- **Storage:** the free 15 GB is shared by Gmail, Drive and Photos. Score-sheet photos are about
  2–4 MB each, roughly 0.5 GB a season. Photos will use the most. If it fills up, Google One
  100 GB is about $2/month.

## 2. Build the League Sheet from the starter data

The starter data is in this repository at `src/data/league/*.csv`. It includes the real locations,
teams, rules documents and Greater Boston Fall 2026 data.

1. In Google Sheets, create a blank spreadsheet named **League Data**.
2. For each CSV except `results.csv`: **File → Import → Upload → (choose the file) → Insert new
   sheet(s) → Import data**. Rename each tab to match: Settings, Seasons, Divisions, Locations,
   Teams, Schedule, Playoffs, News, Documents, Contacts. Delete the empty "Sheet1".
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

3. **Settings:** Responses → *Collect email addresses* = **Verified**. *Limit to 1 response* =
   **Off**, so the same person can submit many times (Richard submitting for several captains).
4. **Load the Fall 2026 results:** open `results.csv` and paste its rows (without the header) into
   "Form Responses 1" starting at **column C**. Its columns line up: Season, Week, Home team, Away
   team, Home games, Away games, Score sheet photo. Leave Timestamp and Email blank.
5. **Make a public-safe Results tab.** "Form Responses 1" contains submitters' email addresses, so
   it must never be published. Add a new tab named **Results** and put this in cell A1:

   ```text
   =QUERY('Form Responses 1'!A:K, "select C, D, E, F, G, H, I where C is not null", 1)
   ```

   This copies only Season through Score sheet photo, and updates itself as responses arrive.
6. *Optional, if Richard wants to approve results before they go live:* type `Approved` in the first
   empty header cell of "Form Responses 1" (column L), insert checkboxes below it, and change the
   formula to `select C, D, E, F, G, H, I, L`. Unticked results are held back and counted on
   `/data-check/`.
7. **Score-sheet photos** land in Drive in a folder named after the form ("… (File responses)").
   Keep its general access **Restricted**. Share it (Viewer) with the coordinators who should see
   completed sheets. In Settings, `show_score_sheet_links` = `yes` adds a "View" link next to each
   result on the website. Only people the folder is shared with can open it; others see "Request
   access", which emails the league account.

## 4. Publish the tabs

**File → Share → Publish to web.** For each tab below: choose the tab, choose **Comma-separated
values (.csv)**, click **Publish**, and copy the link into `league-sheets.json` next to its file
name. Leave "Automatically republish when changes are made" ticked.

| Tab | File in `league-sheets.json` |
| --- | --- |
| Settings | `settings.csv` |
| Seasons | `seasons.csv` |
| Divisions | `divisions.csv` |
| Locations | `locations.csv` |
| Teams | `teams.csv` |
| Schedule | `schedule.csv` |
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

In Google Photos (league account): create an album → **Share** → turn on **Collaborate** → copy the
link into Settings → `photo_album_url`. A **Photos** item then appears in the site menu.

## 6. Hosting (free)

1. Create a GitHub account with the league email, and push this repository to it, including the
   filled-in `league-sheets.json`. Those links are public anyway.
2. Create a free account on **Netlify** or **Cloudflare Pages** with the league email. Connect the
   GitHub repository with these settings:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variable: `NODE_VERSION` = `24`
3. In the host's settings, create a **build hook / deploy hook** and copy its URL (needed in
   step 7).
4. Domain: register one with the league email (about $10–20/year), connect it in the host, and set
   `site` in `astro.config.mjs`.

*Free-tier limits change, so check the host's current numbers. Expect roughly 100 builds a month
in season: one per batch of submissions, plus one daily.*

## 7. Automatic updates (Apps Script)

1. In the League Data sheet: **Extensions → Apps Script**. Replace the contents with
   [`google/apps-script.gs`](../google/apps-script.gs) and save.
2. **Project Settings** (gear icon) → **Script properties** → add `DEPLOY_HOOK_URL` = the hook URL
   from step 6.
3. Back in the editor, choose **setUp** in the toolbar and click **Run**. Approve the permissions
   (Google warns that the app is unverified: click *Advanced → Go to …*).
4. Reload the spreadsheet. A **League website** menu appears with **Update website now**.

The site now rebuilds about 6 minutes after each form submission, every morning at 5 AM, and when
anyone uses the menu. Google takes a few minutes to refresh published tabs, hence the delay.

## 8. Settings tab

| key | value |
| --- | --- |
| `notice` | Banner across every page; **clear it when the site goes live** |
| `contact_email` | General league email shown in the footer and on Contact |
| `score_sheet_form_url` | The form's link (Send → link icon). Adds "Submit a completed score sheet" buttons |
| `photo_album_url` | Shared Google Photos album link |
| `show_score_sheet_links` | `yes` to show "View" links to uploaded score sheets |
| `rules_url` | When the rules change: link to the new rules (Google Doc or PDF). The Rules page then points there instead of the July 2024 text |
| `bca_rules_url`, `wpa_rules_url`, `upa_rules_url` | Links to those rule books |

## 9. Hand over

- Share the **League Data** sheet, the **form** (as collaborator) and the **website documents**
  Drive folder with Richard's own Gmail as **Editor**. Coordinators get Editor on the sheet only if
  they'll be updating it.
- Give Richard [COMMISSIONER_GUIDE.md](COMMISSIONER_GUIDE.md) and have him bookmark
  `/data-check/`.
- **End-to-end test:** submit a test score sheet, wait about 15 minutes, and check the division
  page and `/data-check/`. Then delete the test row from "Form Responses 1" and click **Update
  website now**.

## What still needs a developer

Changing the layout or design, adding new kinds of pages, or replacing the built-in rules text.
That last one can be avoided with `rules_url`. Everything else is in the Sheet.
