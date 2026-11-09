# League data: one file per Google Sheet tab

Each CSV here mirrors one tab of the **League Data** Google Sheet. When the tabs are linked in
`league-sheets.json`, `npm run build` downloads fresh copies first. Otherwise these files are used
as they are. They were seeded from Richard's documents: the Locations list (Oct 30, 2026), the
July 2024 rules, and the Greater Boston Fall 2026 schedule and final results.

**Rules for every tab:**

- Keep the first row (column names). Case, spaces and punctuation in headers don't matter;
  extra columns are ignored.
- Refer to things by **name** (team, division, location, season), spelled as on their own tab.
  Case and extra spaces don't matter.
- Dates: `9/3/2026`, `9/3/26` or `2026-09-03`. Times: `11:00 AM` or `11:00`.
- A bad row is skipped and listed on the website's `/data-check/` page; the rest still publishes.

| Tab (file) | Columns (**required**) | Notes |
| --- | --- | --- |
| Settings (`settings.csv`) | **key**, **value** | Keys: `notice`, `contact_email`, `score_sheet_form_url`, `photo_album_url`, `show_score_sheet_links`, `rules_url`, `bca_rules_url`, `wpa_rules_url`, `upa_rules_url`, `player_names`, `player_min_games`, `site_url`, `reader_email`, `alert_email` |
| Seasons (`seasons.csv`) | **name**, **start_date**, **status**, end_date, current | status: Upcoming / In progress / Final. Put `yes` under current on exactly one season |
| Divisions (`divisions.csv`) | **name**, order | order = display order |
| Locations (`locations.csv`) | **name**, **address**, **city**, phone, map_url | State is assumed MA; map link generated if blank |
| Teams (`teams.csv`) | **name**, **division**, **home_location**, captain, note | note shows on the team page |
| Players (`players.csv`) | **team**, **name**, also_known_as | Rosters. First names are matched automatically when unique on the team; list nicknames (e.g. "PC") under also_known_as |
| Schedule (`schedule.csv`) | **season**, **week**, **date**, **division**, **home**, **away**, time | One row per match. Division is stored per match, so past seasons keep their grouping |
| Results (`results.csv`) | **home**, **away**, **home_score**, **away_score**, season, week, score_sheet, approved, timestamp | Fed from the score-sheet form (question titles like "Home team games won" are understood). Scores = games won incl. tie-breakers. The form doesn't ask for season or week; the Sheet's script fills them in from the Schedule tab. If they're still blank, the season is the latest one started by the timestamp's date, and the week comes from the home/away pairing (the scheduled match nearest before that date if the pairing repeats). If an `approved` column exists, only ticked rows count. If a match gets two different results, the later `timestamp` wins (rows without one, typed or pasted in, count as oldest) |
| Games (`games.csv`) | **season**, **away_team**, **home_team**, **away_player**, **home_player**, **winner**, week, round, check, sheet, read_by | One row per game, written by the score-sheet reader. winner = home or away. Players may be first names. A note in check is listed on Data check until cleared. A match's games must add up to its result |
| Playoffs (`playoffs.csv`) | **season**, **team_1**, **team_2**, round, date, time, location, team_1_score, team_2_score, note | Blank date = "To be announced". location can be a location or a team name |
| News (`news.csv`) | **date**, **title**, **text**, link | Line breaks in text become paragraphs |
| Documents (`documents.csv`) | **title**, description, url, status, order | The Forms page list. url: Drive share link or `/documents/…` |
| Contacts (`contacts.csv`) | **role**, **name**, division, email, phone, public | Only rows with `yes` under public are shown. The published tab is readable by anyone with its link |
