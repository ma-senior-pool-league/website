# The webmaster: what the role covers, and handing it over

The **webmaster** is the volunteer who looks after the parts of the website the spreadsheet doesn't
cover. Michael Rowley, who built the site, is the first.

The site doesn't need a webmaster to keep running. The commissioner runs everything routine from
the League Data sheet ([COMMISSIONER_GUIDE.md](COMMISSIONER_GUIDE.md)). The webmaster is needed
only to change how the site looks or works, and as a second person who can get into the league's
accounts.

For now the webmaster is also the **score-sheet reader**. That's a separate role, handed over on
its own (see the end of this guide).

## What the webmaster does

| When | What |
| --- | --- |
| Rarely | Change the site's design, or add a new kind of page (see "What still needs a developer" in [GOOGLE_SETUP.md](GOOGLE_SETUP.md)) |
| Rarely | Fix a problem the Data check page can't explain, or update the Apps Script in the sheet |
| Once a year | Check that the free plans still fit: Cloudflare Pages builds and the league account's Google storage (GOOGLE_SETUP steps 1 and 6) |
| When asked | Help the commissioner with anything beyond the spreadsheet |

A webmaster doesn't need to be a programmer. An AI coding assistant can make most changes; the
repository's `CLAUDE.md` briefs it on how the site works and what not to break. They need a
computer and a free GitHub account of their own.

## What the webmaster holds

| What | Where | How the webmaster gets in |
| --- | --- | --- |
| The site's code | GitHub organization [`ma-senior-pool-league`](https://github.com/ma-senior-pool-league), public repository `website` | Owner of the organization, from their own GitHub account |
| Sending code from a computer | Deploy keys on the `website` repository (**Settings → Deploy keys**), if they use one | A key file on their computer |
| The web host | Cloudflare Pages project `ma-senior-pool-league`, in the Cloudflare account under the league's email | Signs in with the league's email |
| The league Google account | Owns the Sheet, the form, the Drive folders, the photo album, the Apps Script, and the Cloudflare account | Their own passkey; their email is the account's recovery email |
| Everyday access | The **MA Senior Pool League** Drive folder (Editor), the form, and the form's photo folder | Shared with their own Google account |

Nothing that matters exists only on the webmaster's computer. The code is on GitHub, the Apps
Script lives in the sheet, and the deploy hook's address is in the Apps Script's **Script
properties** (`DEPLOY_HOOK_URL`) and in Cloudflare.

## Handing over to a new webmaster

Do these in order, so there's never a moment when nobody can get in. The commissioner can do the
Google steps; the GitHub invitation needs the old webmaster (or another owner of the organization).

1. **The code.** The new webmaster makes a free GitHub account, if they don't have one. Open
   [the organization's People page](https://github.com/orgs/ma-senior-pool-league/people) →
   **Invite member** → their username → role **Owner** → **Send invitation**. They accept the
   emailed invitation.
2. **The league Google account.** Follow "When someone hands over" in GOOGLE_SETUP step 1, signed
   in as the league account. The new webmaster adds a passkey on their phone. Remove the old
   webmaster's passkey and devices. Change the password, and make the new webmaster's email the
   recovery email. Under 2-Step Verification → Authenticator → **Change authenticator app**,
   scan the new code on the commissioner's and the new webmaster's phones. Print new backup codes.
3. **Everyday access.** Share the **MA Senior Pool League** Drive folder (Editor), the form
   (collaborator) and the form's photo folder with the new webmaster's own Google account. Then
   remove the old webmaster's own account from each.
4. **The web host.** Nothing moves: Cloudflare is under the league's email. The new webmaster
   signs in once and checks they can see the `ma-senior-pool-league` project and its latest
   build.
5. **Keys on the old webmaster's computer.** In the repository's
   [Settings → Deploy keys](https://github.com/ma-senior-pool-league/website/settings/keys), delete
   the old webmaster's keys. If the deploy hook's address might still be on their computer, delete
   the hook in Cloudflare (**Settings → Build → Deploy hooks**), create a new one, and paste its
   address into the Apps Script's `DEPLOY_HOOK_URL`.
6. **The old webmaster leaves the organization**, or stays on as a backup owner if both agree.
   An organization must always have at least one owner.
7. **Names.** Update the Contacts tab if the webmaster is listed there, and the line at the top
   of this guide.

### If the webmaster leaves without handing over

- The site keeps running and updating from the spreadsheet. Captains, score sheets and emails
  all carry on. Only changes to the code wait.
- The commissioner can still sign in to the league Google account with their own passkey, and so
  to Cloudflare and the Apps Script. Remove the old webmaster's passkey and recovery email there.
- The code is public, so it can't be lost. Without an owner of the GitHub organization, though, a
  new webmaster would have to copy the code into an organization of their own and connect the
  hosting to the copy. That's more work than an invitation and may change the site's address,
  so add a second owner early.

## Handing over score-sheet reading

Any volunteer with their own AI assistant can read score sheets, and several can share the job.
The commissioner can do all of this from the spreadsheet:

1. Settings tab → `reader_email`: add the new reader's email (several are allowed, separated by
   commas).
2. Share the League Data sheet (Editor) and the form's photo folder (Viewer) with the Google
   account their AI assistant will use. That may be a different address from the one that gets
   the emails.
3. They point their assistant at the instructions page on the website, `/score-sheet-agent/`
   (plain text at `/score-sheet-agent.md`).
4. Once the new reader is working, take the old reader's addresses out of `reader_email`, and
   remove the sharing from the account their assistant used.

If nobody reads for a while, nothing breaks. Team standings still update, the Data check page
lists the sheets waiting to be read, and player stats catch up once someone reads them.

## Tidying up (one-time)

- The first host, Netlify, is no longer used. Its site still exists in a Netlify account under the
  league's email and can be deleted.
