/**
 * MA Senior Pool League: website helper (required).
 *
 * Lives inside the League Data Google Sheet (Extensions > Apps Script). It:
 *   - asks the web host to rebuild the website a few minutes after a score sheet is
 *     submitted, whenever any tab changes (checked every 15 minutes), every morning,
 *     and when someone picks  League website > Update website now;
 *   - fills in the season and week of each submitted score sheet from the Schedule tab
 *     (the form doesn't ask for them);
 *   - emails the score-sheet reader(s) in Settings > reader_email about each new score
 *     sheet, so a volunteer's AI agent (or the volunteer) can read it into the Games tab.
 *     See docs/SCORE_SHEET_AGENT.md, also published on the website at /score-sheet-agent/;
 *   - once it's read, emails the captain who sent it what was read, so they can check it
 *     (Settings > captain_emails = no turns this off).
 *
 * score-sheet-reader.gs is optional: a fully automatic reader that needs a paid Anthropic
 * API key. Without it (or without the key) everything here still works.
 *
 * One-time setup (docs/GOOGLE_SETUP.md, step 7):
 *   1. Project Settings (gear icon) > Script properties > Add property:
 *        DEPLOY_HOOK_URL = the "deploy hook" / "build hook" link from the web host
 *   2. Choose the setUp function in the toolbar, click Run, and approve the permissions.
 *
 * Google takes up to 5 minutes to refresh a published tab after an edit, so a rebuild
 * runs about 6 minutes after the last change rather than immediately. Each new change
 * pushes a waiting rebuild back, so changes close together share one rebuild and none
 * of them is missed.
 */

const HOOK_PROPERTY = 'DEPLOY_HOOK_URL';
const DIGEST_PROPERTY = 'LAST_DATA_DIGEST';
const DELAY_MINUTES = 6;

// Shared with score-sheet-reader.gs.
const SHEETS = {
  responses: 'Form Responses 1',
  games: 'Games',
  players: 'Players',
  settings: 'Settings',
  schedule: 'Schedule',
};
const STATUS_HEADER = 'Reader status';
const NOTE_HEADER = 'Reader note';
const EMAILED_HEADER = 'Captain emailed';
// Form question titles for the visiting team; they used to say "Away team".
const VISITING_TEAM = ['Visiting team', 'Away team'];
const VISITING_SCORE = ['Visiting team games won', 'Away team games won'];

/** Adds the "League website" menu when the Sheet is opened. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('League website').addItem('Update website now', 'updateWebsiteNow').addToUi();
}

/** Menu item. */
function updateWebsiteNow() {
  const ui = SpreadsheetApp.getUi();
  if (!getHookUrl_()) {
    ui.alert('The website link (DEPLOY_HOOK_URL) has not been set up yet. Ask the site administrator.');
    return;
  }
  scheduleRebuild_();
  ui.alert(
    'Got it. The website will show your changes in about 10 to 15 minutes.\n\n' +
      'If something looks wrong after that, open the Data check page on the website.',
  );
}

/** Run once by hand (and again after adding score-sheet-reader.gs). Safe to run again. */
function setUp() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onScoreSheetSubmitted').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('runRebuild').timeBased().everyDays(1).atHour(5).create();
  ScriptApp.newTrigger('watchForChanges').timeBased().everyMinutes(15).create();

  const props = PropertiesService.getScriptProperties();
  const automatic = typeof readScoreSheets === 'function' && Boolean(props.getProperty('ANTHROPIC_API_KEY'));
  if (automatic) ScriptApp.newTrigger('readScoreSheets').timeBased().everyMinutes(10).create();

  const responses = ss.getSheetByName(SHEETS.responses);
  if (responses) ensureColumns_(responses, ['Season', 'Week', STATUS_HEADER, NOTE_HEADER, EMAILED_HEADER]);

  Logger.log(
    `Triggers installed. Deploy hook: ${getHookUrl_() ? 'yes' : 'NO, add DEPLOY_HOOK_URL'}. ` +
      `Reader emails go to: ${setting_(ss, 'reader_email') || '(nobody yet; set reader_email in Settings)'}. ` +
      `Captain emails: ${captainEmailsOn_(ss) ? 'on' : 'off'}. ` +
      `Automatic (paid) reader: ${automatic ? 'on' : 'off'}.`,
  );
}

/** Trigger: a score sheet was submitted through the form. */
function onScoreSheetSubmitted(e) {
  try {
    fillSeasonAndWeek_(e);
  } catch (err) {
    console.error(`Couldn't fill in the season and week: ${err}`);
  }
  scheduleRebuild_();
  try {
    notifyReaders_(e);
  } catch (err) {
    console.error(`Couldn't email the score-sheet reader: ${err}`);
  }
}

/**
 * Emails Settings > reader_email (one or more addresses, comma-separated) about the new
 * score sheet. A volunteer's AI agent that watches that inbox can act on it; the email
 * also says where the instructions are.
 */
function notifyReaders_(e) {
  const ss = SpreadsheetApp.getActive();
  const to = setting_(ss, 'reader_email');
  if (!to || !e || !e.range) return;

  const sheet = e.range.getSheet();
  ensureColumns_(sheet, [STATUS_HEADER, NOTE_HEADER]);
  const header = headerOf_(sheet);
  const row = sheet.getRange(e.range.getRow(), 1, 1, header.length).getValues()[0];
  const value = (names) => {
    const i = findAnyColumn_(header, [].concat(names));
    return i < 0 ? '' : String(row[i]).trim();
  };
  const photos = value('Score sheet photo');
  if (!photos) return;

  const label = describeMatch_(value('Season'), value('Week'), value(VISITING_TEAM), value('Home team'));
  const site = setting_(ss, 'site_url').replace(/\/+$/, '');
  const body = [
    `A new score sheet was sent in: ${label}.`,
    `Score typed by the captain (visitors-home): ${value(VISITING_SCORE)}-${value('Home team games won')}`,
    `Photo: ${photos}`,
    `Spreadsheet: ${ss.getUrl()} (tab "${SHEETS.responses}", row ${e.range.getRow()})`,
    '',
    site
      ? `To read it into the Games tab, follow the instructions at ${site}/score-sheet-agent/`
      : 'To read it into the Games tab, follow the score-sheet agent instructions (docs/SCORE_SHEET_AGENT.md).',
  ].join('\n');
  MailApp.sendEmail(to, `New score sheet to read: ${label}`, body);
}

/**
 * Trigger (every 15 minutes): rebuilds the website if any tab changed since the last
 * check: the commissioner's edits, or rows a volunteer's agent added to the Games tab.
 */
function watchForChanges() {
  try {
    emailCaptains_();
  } catch (err) {
    console.error(`Couldn't email the captains: ${err}`);
  }
  const ss = SpreadsheetApp.getActive();
  const parts = ss
    .getSheets()
    .filter((s) => s.getName() !== SHEETS.responses) // its changes reach the site through the Results tab
    .map((s) => `${s.getName()}\u0001${JSON.stringify(s.getDataRange().getDisplayValues())}`);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, parts.join('\u0002'));
  const digest = Utilities.base64Encode(bytes);
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(DIGEST_PROPERTY) === digest) return;
  props.setProperty(DIGEST_PROPERTY, digest);
  scheduleRebuild_();
}

/** Trigger target: asks the host to rebuild, and clears any pending one-off trigger. */
function runRebuild() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'runScheduledRebuild') ScriptApp.deleteTrigger(t);
  });
  const url = getHookUrl_();
  if (!url) return;
  const res = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) {
    console.error(`Deploy hook returned HTTP ${res.getResponseCode()}: ${res.getContentText()}`);
  }
}

/** One-off trigger target (kept separate so pending ones can be found and de-duplicated). */
function runScheduledRebuild() {
  runRebuild();
}

/**
 * Schedules a rebuild DELAY_MINUTES from now, replacing any that's waiting. Keeping an
 * earlier one could rebuild before Google has refreshed the published copy of this change,
 * and nothing would rebuild again until the next change or the morning.
 */
function scheduleRebuild_() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'runScheduledRebuild') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runScheduledRebuild').timeBased().after(DELAY_MINUTES * 60 * 1000).create();
}

function getHookUrl_() {
  return PropertiesService.getScriptProperties().getProperty(HOOK_PROPERTY);
}

// ---- shared helpers (also used by score-sheet-reader.gs) -------------------

/** A value from the Settings tab (column A = key, column B = value). */
function setting_(ss, key) {
  const sheet = ss.getSheetByName(SHEETS.settings);
  if (!sheet) return '';
  const row = sheet
    .getDataRange()
    .getValues()
    .find((r) => normalize_(r[0]) === normalize_(key));
  return row ? String(row[1] || '').trim() : '';
}

/**
 * The form doesn't ask for the season and week. Works them out from the Schedule tab (the
 * scheduled match between these two teams, with this home team, nearest before the day the
 * sheet was sent in) and writes them into the response, so the website, the reader and the
 * emails all have them. Leaves them blank if no scheduled match fits; the website's Data
 * check page then says so.
 */
function fillSeasonAndWeek_(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  ensureColumns_(sheet, ['Season', 'Week']);
  const header = headerOf_(sheet);
  const r = e.range.getRow();
  const row = sheet.getRange(r, 1, 1, header.length).getValues()[0];
  const at = (names) => {
    const i = findAnyColumn_(header, [].concat(names));
    return i < 0 ? '' : row[i];
  };
  const seasonCol = findColumn_(header, 'Season');
  const weekCol = findColumn_(header, 'Week');
  const hasSeason = String(row[seasonCol]).trim() !== '';
  const hasWeek = String(row[weekCol]).trim() !== '';
  if (hasSeason && hasWeek) return;
  const sent = at('Timestamp');
  const game = findScheduledGame_(
    SpreadsheetApp.getActive(),
    at('Home team'),
    at(VISITING_TEAM),
    sent instanceof Date ? sent : new Date(),
  );
  if (!game) return;
  if (!hasSeason) sheet.getRange(r, seasonCol + 1).setValue(game.season);
  if (!hasWeek) sheet.getRange(r, weekCol + 1).setValue(game.week);
}

/**
 * The Schedule tab's match with this home and visiting team played most recently by `when`
 * (a day's leeway for late-night submissions), or else the next one. Null if none.
 */
function findScheduledGame_(ss, home, away, when) {
  const sheet = ss.getSheetByName(SHEETS.schedule);
  if (!sheet || !String(home).trim() || !String(away).trim()) return null;
  const data = sheet.getDataRange().getValues();
  const header = data[0].map(String);
  const c = {
    season: findColumn_(header, 'season'),
    week: findColumn_(header, 'week'),
    date: findColumn_(header, 'date'),
    home: findAnyColumn_(header, ['home', 'home_team']),
    away: findAnyColumn_(header, ['away', 'away_team', 'visiting_team']),
  };
  if (Object.keys(c).some((k) => c[k] < 0)) return null;
  const games = data
    .slice(1)
    .filter((r) => normalize_(r[c.home]) === normalize_(home) && normalize_(r[c.away]) === normalize_(away))
    .map((r) => ({ season: String(r[c.season]).trim(), week: r[c.week], day: dayNumber_(r[c.date]) }))
    .filter((g) => g.season && g.day !== null)
    .sort((a, b) => a.day - b.day);
  if (!games.length) return null;
  const before = games.filter((g) => g.day <= dayNumber_(when) + 1);
  return before.length ? before[before.length - 1] : games[0];
}

/** A date cell (a Date, "2026-09-03" or "9/3/2026") as a whole day number, or null. */
function dayNumber_(value) {
  let y, m, d;
  if (value instanceof Date) {
    [y, m, d] = [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  } else {
    const s = String(value == null ? '' : value).trim();
    let x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (x) [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
    else if ((x = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) {
      [m, d, y] = [Number(x[1]), Number(x[2]), Number(x[3])];
      if (y < 100) y += 2000;
    } else return null;
  }
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function captainEmailsOn_(ss) {
  return !/^(no|n|false|off|0)$/i.test(setting_(ss, 'captain_emails'));
}

/**
 * Emails each captain what the reader found on their score sheet, once its Reader status is
 * read, check or failed, so they can check it. Replies go to Settings > contact_email (or to
 * this account if that's blank). Runs with the 15-minute check; each response is emailed
 * once, and the date goes in its "Captain emailed" column. Settings > captain_emails = no
 * turns it off.
 */
function emailCaptains_() {
  const ss = SpreadsheetApp.getActive();
  if (!captainEmailsOn_(ss)) return;
  const sheet = ss.getSheetByName(SHEETS.responses);
  if (!sheet || sheet.getLastRow() < 2) return;
  ensureColumns_(sheet, [EMAILED_HEADER]);
  const data = sheet.getDataRange().getValues();
  const header = data[0].map(String);
  const col = (names) => findAnyColumn_(header, [].concat(names));
  const c = { email: col('Email Address'), status: col(STATUS_HEADER), emailed: col(EMAILED_HEADER) };
  if (c.email < 0 || c.status < 0 || c.emailed < 0) return;

  const replyTo = setting_(ss, 'contact_email');
  const site = setting_(ss, 'site_url').replace(/\/+$/, '');
  let games = null; // the Games tab, read only if someone is due an email
  let sent = 0;
  for (let i = 1; i < data.length && sent < 20; i++) {
    const row = data[i];
    const to = String(row[c.email] || '').trim();
    const status = String(row[c.status] || '').trim().toLowerCase();
    if (!/@/.test(to) || String(row[c.emailed]).trim() || !/^(read|check|failed)\b/.test(status)) continue;
    const value = (names) => {
      const j = col(names);
      return j < 0 ? '' : String(row[j]).trim();
    };
    if (!games) games = readGames_(ss);
    const message = captainMessage_(value, status, games, site);
    if (!message) continue; // the reader's rows aren't on the Games tab yet; try again next time
    const options = { name: 'MA Senior Pool League' };
    if (replyTo) options.replyTo = replyTo;
    MailApp.sendEmail(to, message.subject, message.body, options);
    sheet.getRange(i + 1, c.emailed + 1).setValue(new Date());
    sent++;
  }
}

/** The "here's what we read" email for one response, or null if its games aren't in yet. */
function captainMessage_(value, status, games, site) {
  const home = value('Home team');
  const away = value(VISITING_TEAM);
  const homeScore = value('Home team games won');
  const awayScore = value(VISITING_SCORE);
  const label = describeMatch_(value('Season'), value('Week'), away, home);
  const note = value(NOTE_HEADER);
  const lines = ['Hello,', '', `Thank you for sending in the score sheet for ${label}.`, ''];
  const ending = ['', 'If anything is wrong, just reply to this email and tell us what to fix.', '', 'MA Senior Pool League'];

  if (status === 'failed') {
    lines.push(
      `We weren't able to read the photo${note ? ` (${note})` : ''}. Please reply with a clearer photo, ` +
        'or send the form again with a new one.',
      '',
      `The score you entered still counts in the standings: ${away} ${awayScore}, ${home} ${homeScore}.`,
      '',
      'MA Senior Pool League',
    );
    return { subject: `We couldn't read your score sheet: ${label}`, body: lines.join('\n') };
  }

  const same = (a, b) => normalize_(a) === normalize_(b);
  const rows = games
    .filter(
      (g) =>
        same(g.season, value('Season')) &&
        Number(g.week) === Number(value('Week')) &&
        same(g.home_team, home) &&
        same(g.away_team, away),
    )
    .sort((a, b) => Number(a.round) - Number(b.round));
  if (!value('Season') || !value('Week') || !rows.length) return null;

  lines.push('This is what we read from the photo:');
  let round = '';
  rows.forEach((g) => {
    const name = Number(g.round) >= 5 ? 'Tie-breaker' : `Round ${g.round}`;
    if (name !== round) lines.push('', `${name}:`);
    round = name;
    const winner = g.winner === 'home' ? g.home_player : g.away_player;
    lines.push(`  ${g.away_player} vs ${g.home_player}: ${winner} won`);
  });
  const awayWins = rows.filter((g) => g.winner === 'away').length;
  const homeWins = rows.filter((g) => g.winner === 'home').length;
  lines.push('', `Games won: ${away} ${awayWins}, ${home} ${homeWins}.`);
  if (Number(awayScore) === awayWins && Number(homeScore) === homeWins) {
    lines.push('That matches the score you entered.');
  } else {
    lines.push(`You entered ${away} ${awayScore}, ${home} ${homeScore}. Please reply and tell us which is right.`);
  }
  const doubt = rows.map((g) => g.check).filter(Boolean)[0] || (status === 'check' ? note : '');
  if (doubt) lines.push('', `One thing needs a second look: ${doubt}`);
  if (site) lines.push('', `You can see it on the website: ${site}`);
  return {
    subject: `${status === 'check' ? 'Please check' : 'We read'} your score sheet: ${label}`,
    body: lines.concat(ending).join('\n'),
  };
}

/** The Games tab as a list of objects keyed by column name (season, week, away_team, …). */
function readGames_(ss) {
  const sheet = ss.getSheetByName(SHEETS.games);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const keys = data[0].map(normalize_);
  return data.slice(1).map((r) => {
    const g = {};
    keys.forEach((k, j) => (g[k] = String(r[j] == null ? '' : r[j]).trim()));
    return g;
  });
}

function headerOf_(sheet) {
  return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
}

/** The first of several possible column names that the header has, or -1. */
function findAnyColumn_(header, names) {
  for (const name of names) {
    const i = findColumn_(header, name);
    if (i >= 0) return i;
  }
  return -1;
}

/** Adds any missing header cells at the end of row 1. */
function ensureColumns_(sheet, names) {
  const header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
  names.forEach((name) => {
    if (findColumn_(header, name) < 0) {
      sheet.getRange(1, header.length + 1).setValue(name);
      header.push(name);
    }
  });
}

function describeMatch_(season, week, away, home) {
  return `${season} ${week ? `week ${week}, ` : ''}${away} at ${home}`;
}

function findColumn_(header, name) {
  return header.findIndex((h) => normalize_(h) === normalize_(name));
}

/** "Home Team (games won)" -> "home_team_games_won"; same rule the website uses. */
function normalize_(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
