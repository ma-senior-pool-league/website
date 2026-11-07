/**
 * MA Senior Pool League: website updater.
 *
 * Lives inside the league Google Sheet (Extensions > Apps Script). It asks the
 * web host to rebuild the website:
 *   - a few minutes after each score sheet is submitted through the form,
 *   - every morning (so "next matches" stays current),
 *   - whenever someone picks  League website > Update website now  in the Sheet.
 *
 * One-time setup (see docs/GOOGLE_SETUP.md, step 7):
 *   1. Project Settings (gear icon) > Script properties > Add property:
 *        DEPLOY_HOOK_URL = the "deploy hook" / "build hook" link from the web host
 *   2. Choose the setUp function in the toolbar, click Run, and approve the permissions.
 *
 * Google takes up to 5 minutes to refresh a published tab after an edit, so the
 * rebuild is scheduled about 6 minutes out rather than run immediately. Several
 * submissions close together share one rebuild.
 */

var HOOK_PROPERTY = 'DEPLOY_HOOK_URL';
var DELAY_MINUTES = 6;

/** Adds the "League website" menu when the Sheet is opened. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('League website')
    .addItem('Update website now', 'updateWebsiteNow')
    .addToUi();
}

/** Menu item. */
function updateWebsiteNow() {
  var ui = SpreadsheetApp.getUi();
  if (!getHookUrl_()) {
    ui.alert('The website link (DEPLOY_HOOK_URL) has not been set up yet. Ask the site administrator.');
    return;
  }
  scheduleRebuild_();
  ui.alert(
    'Got it. The website will show your changes in about 10 to 15 minutes.\n\n' +
      'If something looks wrong after that, open the Data check page on the website.'
  );
}

/** Run once by hand: installs the form-submit and daily triggers. Safe to run again. */
function setUp() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onScoreSheetSubmitted').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('runRebuild').timeBased().everyDays(1).atHour(5).create();
  Logger.log('Triggers installed. Hook configured: ' + (getHookUrl_() ? 'yes' : 'NO, add DEPLOY_HOOK_URL'));
}

/** Trigger: a score sheet was submitted. */
function onScoreSheetSubmitted() {
  scheduleRebuild_();
}

/** Trigger target: asks the host to rebuild, and clears any pending one-off trigger. */
function runRebuild() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runScheduledRebuild') ScriptApp.deleteTrigger(t);
  });
  var url = getHookUrl_();
  if (!url) return;
  var res = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) {
    console.error('Deploy hook returned HTTP ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}

/** One-off trigger target (kept separate so pending ones can be found and de-duplicated). */
function runScheduledRebuild() {
  runRebuild();
}

function scheduleRebuild_() {
  var pending = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'runScheduledRebuild';
  });
  if (!pending) {
    ScriptApp.newTrigger('runScheduledRebuild').timeBased().after(DELAY_MINUTES * 60 * 1000).create();
  }
}

function getHookUrl_() {
  return PropertiesService.getScriptProperties().getProperty(HOOK_PROPERTY);
}
