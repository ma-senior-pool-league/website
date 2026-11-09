# Project plan: MA Senior Pool League website

## Client and goal

**Richard DiBona**, the league commissioner, runs the league as of November 2026. The league is the
**"MA Senior Pool League"** (MA = Massachusetts), an independent organization, not affiliated with
any other group.

Goal (from Richard's email): *streamline access to relevant information for the four Division
Coordinators and the League Captains.* The primary audience is therefore coordinators and captains
(about 30 people), with the general membership second.

**Key constraint:** the volunteer who builds the site (Michael) won't be around long-term, and a
successor is unlikely to be comfortable with code. **Everything routine must be manageable from
Google** (Sheets, Forms, Drive, Photos) without touching code.

## League facts (from the documents Richard sent)

| Topic | Fact | Source |
| --- | --- | --- |
| Game | 8-ball; players must be 60+ at season start (50+ grandfathered if they played in 2023) | Rules, July 2024 |
| Divisions | Central Mass (7 teams), Metro West (6), North East (6), Greater Boston (6): 25 teams | Locations list, Oct 30 2026 |
| Locations | 19 senior centers / councils on aging; several towns field A and B teams | Locations list |
| Match format | 16-game match: 4 players a side (visitors A–D, home 1–4), 4 rounds of 4 games; tied matches go to a 2-out-of-3 tie-breaker | Score sheet, Rules |
| Score | Games won by each team, **including tie-breaker games** (e.g. Cambridge 10–8 Waltham = 8–8 plus TB 2–0) | Fall 2026 results |
| Standings | Ranked by matches won, then games won | Fall 2026 standings |
| Schedule | Greater Boston: Thursdays 11:00 AM, 10 weeks (Sep 3 – Nov 5, 2026) | Fall 2026 schedule |
| Playoffs | Division winners play a 2-matches-out-of-3 series; better regular-season record gets home advantage | Rules item I |

## Decision: Google-based (November 2026)

Chosen over a custom Cloudflare backend because no long-term technical maintainer is expected. See
[GOOGLE_SETUP.md](GOOGLE_SETUP.md) for the full setup.

- **The website** stays a static Astro site on a free host (Netlify or Cloudflare Pages), at the
  host's free address (e.g. `ma-senior-pool-league.netlify.app`). There's no custom domain, so
  nothing to renew. It
  rebuilds itself from the league Google Sheet: after each score-sheet submission, daily, and on
  demand from a menu in the Sheet. A small Apps Script does the triggering.
- **League Data Google Sheet** (owned by a dedicated league Google account): one tab each for
  Settings, Seasons, Divisions, Locations, Teams, Schedule, Results, Playoffs, News, Documents and
  Contacts. People type names, not codes.
- **Score sheets:** a Google Form with photo upload. Photos land in the league account's Drive.
  Scores feed the Results tab and the standings automatically. Captains without a Google account
  send the photo to Richard or a coordinator, who submits it for them.
- **"Logins":** Google accounts. Who can see completed score sheets is controlled by Drive sharing.
  Who can edit league data is controlled by Sheet sharing.
- **Photos:** a shared Google Photos album linked from the site.
- **Player stats (added at Michael's request):** each score-sheet photo is read into a Games tab,
  one row per game. The website computes player standings from it, replacing the end-of-season
  stats sheet the commissioner builds by hand. **The league pays for nothing:** a volunteer's own
  AI agent does the reading. Michael starts, and any later volunteer can use their own agent. The
  Apps Script emails the reader (`reader_email`) for each submission, and the agent follows
  public instructions at `/score-sheet-agent/` (`docs/SCORE_SHEET_AGENT.md`). The website checks
  every match (4 games per round, one winner each, totals equal to the captain's score) and lists
  problems and unread sheets on `/data-check/`. A fully automatic reader using Anthropic's API
  (`google/score-sheet-reader.gs`, about $15–25 a season) is built but off; it can be turned on
  if the league ever has a way to pay for it.
- **Short score-sheet form (Michael, Nov 2026):** captains pick the two teams, type both scores
  and add the photo. The season and week come from the Schedule tab. The score stays on the form
  so standings don't wait for the reading and the reading has something to be checked against.
  Once a sheet is read, the captain gets an email listing every game as read, and replies to fix
  anything.
- **Safety net:** the site never breaks on bad data. Bad rows are skipped and listed in plain
  language on a `/data-check/` page; unreadable tabs keep their last good copy.
- **Preview first, no sign-off on paper (Michael, Nov 2026):** Michael sets everything up under the
  league account with only his own access, runs the site at its real address with the preview
  banner up, and improves it until he's happy. Then he shows Richard the running site and the
  documents together. A working site is easier to judge than a description, nothing costs money,
  and anything can still be changed.

Trade-offs accepted: captains without Google accounts depend on Richard or a coordinator; uploaded
sheets are organized by a spreadsheet (and links on the division pages), not by Drive sub-folders;
the site updates about 10–15 minutes after a change, not instantly.

## Richard's requirements and where they stand

| # | Requirement | Status | Still needed |
| --- | --- | --- | --- |
| 1 | Blank score sheets | ✅ Forms page (Documents tab) | Final version incl. back page |
| 2 | Rules: league + BCA, WPA, UPA | ✅ League rules (web + PDF); BCA/WPA/UPA links via Settings | Which BCA/WPA/UPA documents |
| 3 | Referee tip sheet | 🟡 "Coming soon" on Forms page | PDF when finalized → Documents tab |
| 4 | Playing locations with contacts | ✅ Locations page | Confirm Newton (see issues) |
| 5 | Division schedules | ✅ Per season / division; Greater Boston loaded | Other divisions → Schedule tab |
| 6 | Submit and store score sheets, by season and division | 🟡 Built: Form → Drive + Results tab; optional "View" links on division pages | Google setup (GOOGLE_SETUP.md) |
| 7 | Results and standings, by season and division | ✅ Season archive → division pages; live from the Results tab | Other divisions' results |
| 8 | Photo gallery | 🟡 Photos page links a shared album | Create the album (setup step 5) |
| 9 | Playoff schedules and results | ✅ Playoffs tab → Playoffs page and season pages | Playoff format and dates |
| – | Log-in access for specific users | 🟡 Google accounts + sharing | Setup step 10 |
| – | Player standings and stats (Michael, Nov 2026) | 🟡 Built: Players and Games tabs, player pages, agent instructions, reader emails, waiting list on Data check. Week 9 Lexington–Bedford matches the commissioner's sheet for all 8 players | Rosters for all divisions; Michael's agent set up (setup step 8A) |

## Data issues found in the documents (to confirm with Richard)

1. **Newton's home location conflicts.** The Locations list (Oct 30, 2026) says *"Home games at
   Waltham Senior Ctr"*. The Fall 2026 schedule says *"Newton Senior Center pool room is now open –
   345 Walnut St (third floor)"*. **The site uses Waltham**, the newer document.
2. **Standings tie-break** is inferred from the Fall 2026 sheet: matches won, then games won.
3. **The score-sheet draft is one page.** It says instructions and rules are "on back of page", but
   that page isn't in the PDF.
4. **Rules item K** says to contact **Dick Carey** for replacement players. Still right?
5. **Naming:** the documents use "Mass Senior Pool League" / "Mass Senior 8-ball League". Per
   Richard the site uses **"MA Senior Pool League"**. The rules page keeps the document's own title.
6. **Cambridge location name:** "Cambridge Senior Center" (Locations list) vs "Cambridge Citywide
   Senior Center" (schedule). The site uses the Locations list name.

## Questions for Richard

*(Plain language, ready to paste into a reply. To go through when Richard first sees the running
site.)*

1. Could you send the Fall 2026 **schedules and results for Central Mass, Metro West and North
   East**? Do all divisions play Thursdays at 11:00 AM?
2. **Newton:** are home games at the Waltham Senior Center, or back at the Newton (Cooper Center)
   pool room at 345 Walnut St?
3. **Playoffs:** how does the playoff work with four division winners (who plays whom, rounds,
   dates, where)?
4. **Standings tie-breaker:** when two teams have the same number of match wins, is the order
   decided by total games won?
5. **BCA, WPA, UPA rules:** which documents or sections should we link to?
6. **Score sheet:** is there a final version, including the back page with instructions?
7. **Score sheets:** should the home captain send in the score sheet? Should results go live as soon
   as they're submitted, or after you (or a coordinator) approve them?
8. **Who should see completed score sheets?** Our suggestion: you and the four coordinators.
9. **Photos:** who may add photos, and do we need players' consent to post them?
10. **Contacts to publish:** how you'd like to be listed, and the four Division Coordinators' names
    and emails. What's OK to be public?
11. **Web address and accounts:** the site uses the host's free address (e.g.
    ma-senior-pool-league.netlify.app), so there's nothing to renew. It can still be renamed before
    it's announced: any preferred name? A league Google account owns everything, and you and
    Michael can both sign in to it (day to day you'd each use your own account). Should anyone else
    have access?
12. **Past seasons:** do you have earlier results and standings you'd like archived on the site?
13. **Rosters:** could you send each team's roster for all four divisions (the one you use for the
    player stats)?
14. **Player stats spreadsheet:** could you send the Fall 2026 player stats spreadsheet (the Excel
    file behind the PDF)? It would let the site show this season's full player history.
15. **Player names online:** OK to show players as "first name + last initial" (e.g. Michael R.)
    on the public site, or full names as in your emails?
16. **Substitutes:** when a player subs for another team, which team should their games count
    under?

## Roadmap

- **Phase 1: Public site (built).** Real locations, rules, Greater Boston Fall 2026 data, forms,
  playoffs, news, contacts; all routine content driven from Sheet-shaped data.
- **Phase 2: Google setup and preview (next).** League account, League Data sheet, score-sheet
  form, photo album, hosting with automatic rebuilds, all with only Michael's access. Follow
  [GOOGLE_SETUP.md](GOOGLE_SETUP.md) steps 1–9, then test with practice score sheets and improve
  the running site until Michael is happy with it.
- **Phase 3: Show Richard.** Walk him through the running site and the documents, including
  [COMMISSIONER_GUIDE.md](COMMISSIONER_GUIDE.md), go through the questions above, and give him
  access (setup step 10).
- **Phase 4: Go live.** Other divisions' data and rosters, the answers to the questions, clear the
  preview banner, tell the coordinators and captains, first live week with real submissions.
- **Later / optional:** sort uploaded score sheets into season/division Drive folders automatically
  (small Apps Script); past-season archive; printable schedule pages.

## Risks and notes

- Player stats depend on a volunteer running their own AI agent. If nobody does for a while, the
  site keeps working: team standings still update, Data check lists the unread sheets, and stats
  catch up when someone reads them. The optional paid reader's live API call hasn't been tested.
- Published tabs are readable by anyone with the link. Never publish "Form Responses 1" (it has
  emails). Only put public-OK details on Contacts.
- Google can take up to 5 minutes to refresh a published tab, so updates appear about 10–15 minutes
  after a change.
- Keep the Google and web host accounts in the league's name, with at least two people able to
  get in, so the site survives volunteer turnover. The code is the exception: GitHub allows one
  free personal account per person, so it lives in a free GitHub organization
  (`ma-senior-pool-league`) owned by Michael's own GitHub account. Add a second owner before he
  steps away.
- Accessibility for older users stays a hard requirement: large text, high contrast, big buttons,
  simple navigation.
