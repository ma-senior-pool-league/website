# Reading score sheets: instructions for a volunteer's AI agent

You are helping the MA Senior Pool League, a senior 8-ball travel league in Massachusetts. Your job
is to turn photos of completed score sheets into **one row per game** in the league's Google Sheet,
called "League Data". The league website builds the player standings from those rows and checks
them. A volunteer runs you with their own AI account; the league itself pays for nothing.

## What you need

- Editor access to the **League Data** Google Sheet, and access to the score-sheet photos in Google
  Drive. You get both through your volunteer's Google account; the commissioner shares them.
- The ability to look at images (photos, sometimes PDFs).

If you can read the photos but can't write to the Sheet, see
[If you can't write to the Sheet](#if-you-cant-write-to-the-sheet).

## When to run

- When an email titled **"New score sheet to read: …"** arrives. It names the match and gives the
  photo link and the row number. Or:
- On a schedule (for example every hour, or once a day): look for sheets that haven't been read.

## 1. Find sheets to read

Open the tab **Form Responses 1**. Each row is one match a captain sent in. A row needs reading when
it has a link under **Score sheet photo** and its **Reader status** cell is empty.

Columns you use: Season, Week, Home team, Away team, Home team games won, Away team games won, Score
sheet photo, Reader status, Reader note. Don't change any other column.

## 2. Read the score sheet

The printed sheet:

- **Header:** visiting team and captain on the left, the date in the middle, home team and captain
  on the right.
- **Four rounds of four games.** Each game is one row: the visiting player's name on the left, with
  a small box at the far left holding **W** or **L**; then the visitor's letter (A–D), a circle, the
  home player's number (1–4), and the home player's name, with a W/L box at the far right.
- **Printed pairings.** Round 1: A–2, B–1, C–4, D–3. Round 2: B–2, A–1, D–4, C–3. Round 3: A–3,
  B–4, C–1, D–2. Round 4: B–3, A–4, D–1, C–2.
- Under each round, **Wins** boxes hold each team's wins for that round; they're sometimes blank.
  An **Overtime** section holds tie-breaker games, used only when regulation ends 8–8. **Total
  Wins** boxes hold each team's total.
- At the bottom, a players list may give fuller names next to A–D and 1–4. Its W/L grid is usually
  blank; ignore that grid.

How to read it:

- For every game, record both players and who won. The **W/L boxes decide the winner**, and exactly
  one side wins each game. If a mark is crossed out or written over, use the final mark. Use the
  round's Wins boxes and the totals to settle a doubtful game.
- Number regular games by round, **1–4**. Tie-breaker games are round **5**.

## 3. Match names to the roster

Players usually write first names only. The **Players** tab lists each team's roster (team, name,
also_known_as). When a written name clearly fits one player on that team (a first name, a nickname
from also_known_as, or a misspelling), use the full roster name. If it fits nobody on that team,
write the name exactly as written. A substitute from another team may play; use their roster name
if they're on another team's roster.

## 4. Check before writing

- There are **16 regular games: 4 in each of rounds 1–4**.
- **Every game has exactly one winner.**
- **Visiting wins and home wins equal the captain's score** on the form ("Away team games won" and
  "Home team games won"), including any tie-breaker games. If the form's score is blank, compare
  with the sheet's Total Wins.

If something still doesn't add up after a careful second look, write the rows anyway and put a
short note in the **check** column of the match's first row, for example "Round 3, B vs 4: mark
unclear. Games total 8–8, form says 7–9." The website flags it for the commissioner. Flag doubts;
don't guess silently.

## 5. Write the rows

On the **Games** tab, add one row per game at the bottom, in round order. Keep the header row as it
is. The columns:

| Column | What goes in it |
| --- | --- |
| season | As on the form, e.g. `Fall 2026` |
| week | As on the form, e.g. `9` |
| away_team | The visiting team, as on the form |
| home_team | The home team, as on the form |
| round | `1`–`4`, or `5` for a tie-breaker game |
| away_player | The visiting player (full roster name when clear) |
| home_player | The home player (full roster name when clear) |
| winner | `away` or `home` |
| check | Empty, or a short note on the first row if anything is uncertain |
| sheet | The photo link (first row only) |
| read_by | Who read it, e.g. `Michael's agent, 2026-11-07` |

If the match already has rows on the Games tab (it's being read again), delete those rows first so
each game appears only once.

## 6. Mark it done

Back on **Form Responses 1**, set the row's **Reader status** to:

- `read` when everything added up;
- `check` if you left a note in the check column;
- `failed` if you couldn't read the photo at all (no rows written).

Then put a one-line **Reader note**, e.g. "16 games, 7–9, matches the form."

## Rules

- Only add or replace rows on the **Games** tab, and fill **Reader status** and **Reader note**.
  Don't edit any other tab or what captains submitted.
- Keep the photos and players' names within the league's Google account and your volunteer. Don't
  post or share them anywhere else.

## Example

Fall 2026, week 9, Lexington (visiting) at Bedford. The captain's score is 7–9. These are the Games
rows, tab-separated, without the sheet and read_by columns:

```text
season	week	away_team	home_team	round	away_player	home_player	winner	check
Fall 2026	9	Lexington	Bedford	1	Michael Rowley	Joe Esposito	away
Fall 2026	9	Lexington	Bedford	1	Myles Kleper	Claude Despres	home
Fall 2026	9	Lexington	Bedford	1	Kun Liang	Bruno DiDuca	away
Fall 2026	9	Lexington	Bedford	1	Steve DelloRusso	Vinny Fraumeni	home
Fall 2026	9	Lexington	Bedford	2	Myles Kleper	Joe Esposito	home
Fall 2026	9	Lexington	Bedford	2	Michael Rowley	Claude Despres	away
Fall 2026	9	Lexington	Bedford	2	Steve DelloRusso	Bruno DiDuca	away
Fall 2026	9	Lexington	Bedford	2	Kun Liang	Vinny Fraumeni	away
Fall 2026	9	Lexington	Bedford	3	Michael Rowley	Vinny Fraumeni	home
Fall 2026	9	Lexington	Bedford	3	Myles Kleper	Bruno DiDuca	home
Fall 2026	9	Lexington	Bedford	3	Kun Liang	Claude Despres	home
Fall 2026	9	Lexington	Bedford	3	Steve DelloRusso	Joe Esposito	away
Fall 2026	9	Lexington	Bedford	4	Myles Kleper	Vinny Fraumeni	away
Fall 2026	9	Lexington	Bedford	4	Michael Rowley	Bruno DiDuca	home
Fall 2026	9	Lexington	Bedford	4	Steve DelloRusso	Claude Despres	home
Fall 2026	9	Lexington	Bedford	4	Kun Liang	Joe Esposito	home
```

Visiting wins 2 + 3 + 1 + 1 = 7 and home wins 2 + 1 + 3 + 3 = 9, which matches the form.

## If you can't write to the Sheet

Give your volunteer the rows as **tab-separated text** with the header line, as in the example,
including the sheet and read_by columns. They click the first empty cell in column A of the Games
tab and paste; Google Sheets splits tab-separated text into columns. Then they set the Reader status.

## For volunteers: setting up your agent

1. Ask the commissioner to share the **League Data** sheet (Editor) and the **score-sheet photos**
   folder (Viewer) with your Google account. Ask them to add your email to the Settings tab under
   **reader_email** too, so you get the "New score sheet to read" emails.
2. Connect your AI agent to your Google account, in whatever way your agent supports, and give it
   these instructions: this page's address, or the plain-text version at `/score-sheet-agent.md` on
   the league website.
3. Have it run when a "New score sheet to read" email arrives, or on a schedule.
4. For the first few weeks, compare its rows with the photos, and look at the website's **Data
   check** page, which lists anything that doesn't add up and any sheets still waiting to be read.
5. **Handing over:** stop your agent and ask the commissioner to swap your email in reader_email
   for the next volunteer's. They repeat steps 1–3. Nothing else changes.

Privacy: check your AI account's settings on whether your conversations can be used to train
models, and choose what you're comfortable with for players' names.
