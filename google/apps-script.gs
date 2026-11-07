/**
 * MA Senior Pool League: website helper (required).
 *
 * Lives inside the League Data Google Sheet (Extensions > Apps Script). It:
 *   - asks the web host to rebuild the website a few minutes after a score sheet is
 *     submitted, whenever any tab changes (checked every 15 minutes), every morning,
 *     and when someone picks  League website > Update website now;
 *   - emails the score-sheet reader(s) in Settings > reader_email about each new score
 *     sheet, so a volunteer's AI agent (or the volunteer) can read it into the Games tab.
 *     See docs/SCORE_SHEET_AGENT.md, also published on the website at /score-sheet-agent/.
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
 * is scheduled about 6 minutes out rather than run immediately. Changes close together
 * share one rebuild.
 */

const HOOK_PROPERTY = 'DEPLOY_HOOK_URL';
const DIGEST_PROPERTY = 'LAST_DATA_DIGEST';
const DELAY_MINUTES = 6;

// Shared with score-sheet-reader.gs.
const SHEETS = { responses: 'Form Responses 1', games: 'Games', players: 'Players', settings: 'Settings' };
const STATUS_HEADER = 'Reader status';
const NOTE_HEADER = 'Reader note';

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
  if (responses) ensureColumns_(responses, [STATUS_HEADER, NOTE_HEADER]);

  Logger.log(
    `Triggers installed. Deploy hook: ${getHookUrl_() ? 'yes' : 'NO, add DEPLOY_HOOK_URL'}. ` +
      `Reader emails go to: ${setting_(ss, 'reader_email') || '(nobody yet; set reader_email in Settings)'}. ` +
      `Automatic (paid) reader: ${automatic ? 'on' : 'off'}.`,
  );
}

/** Trigger: a score sheet was submitted through the form. */
function onScoreSheetSubmitted(e) {
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
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const row = sheet.getRange(e.range.getRow(), 1, 1, header.length).getValues()[0];
  const value = (name) => {
    const i = findColumn_(header, name);
    return i < 0 ? '' : String(row[i]).trim();
  };
  const photos = value('Score sheet photo');
  if (!photos) return;

  const label = describeMatch_(value('Season'), value('Week'), value('Away team'), value('Home team'));
  const site = setting_(ss, 'site_url').replace(/\/+$/, '');
  const body = [
    `A new score sheet was sent in: ${label}.`,
    `Score typed by the captain (visitors-home): ${value('Away team games won')}-${value('Home team games won')}`,
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

function scheduleRebuild_() {
  const pending = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'runScheduledRebuild');
  if (!pending) ScriptApp.newTrigger('runScheduledRebuild').timeBased().after(DELAY_MINUTES * 60 * 1000).create();
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
