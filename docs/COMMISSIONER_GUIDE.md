# Running the website: commissioner's guide

Everything on the website comes from one Google spreadsheet, **League Data**. Change the
spreadsheet, and the website updates itself, usually within 15 minutes. You never need to touch
the website directly.

**Two bookmarks to keep:**

- The **League Data** spreadsheet (shared with your Gmail).
- The website's **Data check** page (`/data-check/` on the website). It says when the website last
  updated and lists anything in the spreadsheet it couldn't understand, with the tab and row
  number.

## The spreadsheet tabs

| Tab | What it's for | How often |
| --- | --- | --- |
| Settings | Banner message, contact email, links to the form, photo album and rule books | Rarely |
| Seasons | One row per season, and which one is current | Twice a year |
| Divisions | The four divisions | Rarely |
| Locations | Playing locations and phone numbers | When something changes |
| Teams | Team name, division, home location | Each season |
| Players | Each team's roster: team, full name, and any nickname | Each season, and when someone joins |
| Schedule | One row per match | Each season |
| Games | One row per game, read from the score-sheet photos by a volunteer's AI agent | Filled in by the reader; fix only if flagged |
| Form Responses 1 | Score sheets sent in through the form (scores + photo links) | Fills itself in |
| Results | A copy of the scores for the website. **Don't type here**, it updates itself | Never |
| Playoffs | Playoff matches and results | Playoff time |
| News | Announcements | Whenever you like |
| Documents | The Forms page list (score sheet, rules, referee tips…) | When documents change |
| Contacts | People listed on the Contact page | When people change |

**Golden rule:** don't change the first row of any tab. Those are the column names the website
reads. Adding columns at the far right is fine.

Names must match across tabs. For example, a team on the Schedule tab must be spelled the same as
on the Teams tab. Capital letters and extra spaces don't matter.

## Every week: score sheets

**Captains** open the form from the website (**Forms → Open the score sheet form**), take a photo
of the sheet, type the games won for each team, and submit. The home team's captain should send it
in.

**Captain without a Google account?** They text or email you a photo of the score sheet. You open
the same form (you're signed in with your Gmail), fill it in for them, attach the photo, and put
their name under "Submitted on behalf of". Coordinators can do the same.

Games won **include tie-breaker games**. A match never ends tied.

**Player stats come from the photos.** A volunteer (Michael, to start) has their own AI agent
read each new score-sheet photo: who played and who won each game. It writes 16 rows per match to
the Games tab. The volunteer gets a "New score sheet to read" email for every submission. The
player standings on the website update from those rows, so you don't tally anything.

**If a reading doesn't add up**, for example the games total 8–8 but the captain entered 7–9, the
Data check page lists it. Open the Games tab, find that match's rows, and compare them with the
photo (the link is in the first row's **sheet** column). Fix the wrong row, then delete the note in
the **check** column. Data check also lists sheets still waiting to be read, and any name that
doesn't match a roster. For those, add the player to the Players tab, or fix the name on the Games
tab.

**Changing who reads score sheets:** put the new volunteer's email in Settings → `reader_email`,
and share the spreadsheet (Editor) and the photo folder (Viewer) with them. They point their own
AI agent at the instructions page on the website (`/score-sheet-agent/`). If nobody is reading
sheets for a while, nothing breaks: team standings still update, and player stats catch up later.

**Fixing a mistake:** open the **Form Responses 1** tab, correct the number in the row (or delete
the row), then choose **League website → Update website now** from the menu at the top of the
spreadsheet.

## Before each season

1. **Seasons tab:** add a row (name such as `Spring 2027`, start date, end date, status `Upcoming`).
   When it starts: set its status to `In progress`, put `yes` under **current**, and remove `yes`
   from the old season (set that one to `Final`).
2. **Teams tab:** add, remove or move teams between divisions.
3. **Players tab:** update each team's roster (team, full name). Add a nickname under
   **also_known_as** only if people write something other than the first name (for example "PC").
4. **Schedule tab:** one row per match: season, week, date, time, division, home team, away team.
   You can copy last season's rows and change them.
5. **Form:** update the Season and team lists in the score-sheet form's dropdowns.
6. Choose **League website → Update website now**, wait 15 minutes, then open **Data check**.

## Other updates

- **News:** add a row to the News tab: date, title, text (press Ctrl+Enter or Alt+Enter inside a
  cell for a new paragraph), and optionally a link.
- **Playoffs:** one row per playoff match: season, round (e.g. `Semifinal`), date, time, the two
  teams, location (a location or a team name), and the scores once played. Leave the date empty if
  it isn't set yet. It shows as "To be announced".
- **Documents** (Forms page): upload the PDF to the league's Google Drive "Website documents"
  folder. **Share → General access → Anyone with the link → Viewer**, then **Copy link**. Add a row
  to the Documents tab with a title, a short description, the link, and an order number.
  *Status* can say `Draft` or `Coming soon`.
- **Contacts:** add a row per person (role, name, division if any, email, phone). Put `yes` under
  **public** to show them on the Contact page. Only add details you're happy to be public: the tab
  itself can be read by anyone who has its link.
- **Banner:** Settings tab → `notice`. Clear it to remove the banner.
- **New rules:** put the new rules in a Google Doc or PDF, share it as "Anyone with the link", and
  paste the link into Settings → `rules_url`. Add the PDF to the Documents tab too.
- **Photos:** people add them to the shared Google Photos album. The link is in Settings →
  `photo_album_url`.

## If something looks wrong

1. Wait 15 minutes after a change, then refresh the website.
2. Open **Data check**. It names the tab and row of any problem and what's wrong, for example a
   misspelled team name or a tied score.
3. Fix it in the spreadsheet, then **League website → Update website now**.

Nothing you do in the spreadsheet can break the website. At worst, a row is skipped until it's
fixed.
