/**
 * MA Senior Pool League: automatic score-sheet reader (OPTIONAL, needs a paid Anthropic API key).
 *
 * The league's default is a volunteer's own AI agent reading score sheets
 * (docs/SCORE_SHEET_AGENT.md). This file is the hands-off alternative, kept for the day
 * the league has a way to pay for it: every 10 minutes it sends new score-sheet photos on
 * "Form Responses 1" to Claude (Anthropic's AI) and writes one row per game to the Games
 * tab, the same rows a volunteer's agent would write.
 *
 * Checks before anything is trusted:
 *   - every round has 4 games and every game has exactly one winner;
 *   - the games add up to the score the captain typed into the form.
 * If a check fails, the rows are still written but the first one gets a note in its
 * "check" column, the website's Data check page lists it, and an email goes to
 * Settings > alert_email.
 *
 * Reader status (columns on "Form Responses 1"): (blank) new · "retry 1", "retry 2" ·
 * "read" · "check" needs a look · "failed" · "skipped" no photo. Clear it to re-read.
 *
 * To turn it on (docs/GOOGLE_SETUP.md, step 8B): add this file to the Apps Script project,
 * add Script property ANTHROPIC_API_KEY, add the Drive advanced service, and run setUp().
 * Uses SHEETS, STATUS_HEADER, NOTE_HEADER and the helpers from apps-script.gs.
 *
 * Claude has no Apps Script SDK, so this calls the Messages API over HTTP. Keep its
 * reading rules in step with docs/SCORE_SHEET_AGENT.md.
 */

const READER = {
  model: 'claude-opus-5-5',
  apiVersion: '2026-10-21',
  // Server-side fallback: if the model ever declines a request, the API retries on another model.
  fallbackBeta: 'server-side-fallback-2026-07-01',
  maxImagePx: 2400, // long edge sent to Claude; handwriting needs detail
  maxPerRun: 3, // sheets per 10-minute run (Apps Script runs are limited to 6 minutes)
  maxAttempts: 3,
};

const GAMES_HEADERS = [
  'season', 'week', 'away_team', 'home_team', 'round', 'away_player', 'home_player', 'winner', 'check', 'sheet', 'read_by',
];

const SYSTEM_PROMPT = `You read handwritten score sheets for the MA Senior Pool League, a senior 8-ball travel league in Massachusetts, and turn each sheet into data.

The printed sheet:
- Header: visiting team and captain on the left, the date in the middle, home team and captain on the right.
- Four rounds of four games. Each game is one row: the visiting player's name on the left, with a small box at the far left holding W or L; then the visitor's letter (A-D), a circle, the home player's number (1-4), and the home player's name, with a W/L box at the far right.
- Printed pairings. Round 1: A-2, B-1, C-4, D-3. Round 2: B-2, A-1, D-4, C-3. Round 3: A-3, B-4, C-1, D-2. Round 4: B-3, A-4, D-1, C-2.
- Under each round, "Wins" boxes hold each team's wins for that round (sometimes left blank). An "Overtime" section holds tie-breaker games, used only when regulation ends 8-8. "Total Wins" boxes hold each team's total.
- At the bottom, a players list may give fuller names next to A-D and 1-4. Its W/L grid is usually blank; ignore that grid.

How to read it:
- For every game, give both players and who won. The W/L boxes decide the winner, and exactly one side wins each game. If a mark is crossed out or written over, use the final mark. Use the round's Wins boxes and the totals to settle a doubtful game; if it still can't be settled, say "unclear".
- Players usually write first names only. Using the rosters provided, give each player's full roster name when a written name clearly fits one player on that team (a first name, nickname or misspelling). If it fits nobody on that team, give the name exactly as written. A substitute from another team may play; use their roster name if you recognize it.
- Number regular games by round, 1-4. Give tie-breaker games round 5.
- Copy the written totals and the date as they appear (empty string if blank).
- Put anything uncertain in notes: names you can't read, unclear marks, missing rounds. Leave notes empty if everything is clear.`;

const GAME_SCHEMA = {
  type: 'object',
  properties: {
    visiting_team: { type: 'string' },
    home_team: { type: 'string' },
    date: { type: 'string' },
    games: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          round: { type: 'integer' },
          visiting_player: { type: 'string' },
          home_player: { type: 'string' },
          winner: { type: 'string', enum: ['visiting', 'home', 'unclear'] },
        },
        required: ['round', 'visiting_player', 'home_player', 'winner'],
        additionalProperties: false,
      },
    },
    visiting_total: { type: 'string' },
    home_total: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['visiting_team', 'home_team', 'date', 'games', 'visiting_total', 'home_total', 'notes'],
  additionalProperties: false,
};

/** Trigger target (every 10 minutes): reads any new score sheets. */
function readScoreSheets() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // a previous run is still working
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!apiKey) return;
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(SHEETS.responses);
    if (!sheet || sheet.getLastRow() < 2) return;

    ensureColumns_(sheet, [STATUS_HEADER, NOTE_HEADER]);
    const data = sheet.getDataRange().getValues();
    const header = data[0].map(String);
    const c = {
      season: findColumn_(header, 'Season'),
      week: findColumn_(header, 'Week'),
      home: findColumn_(header, 'Home team'),
      away: findAnyColumn_(header, VISITING_TEAM),
      homeScore: findColumn_(header, 'Home team games won'),
      awayScore: findAnyColumn_(header, VISITING_SCORE),
      photo: findColumn_(header, 'Score sheet photo'),
      status: findColumn_(header, STATUS_HEADER),
      note: findColumn_(header, NOTE_HEADER),
    };
    if ([c.season, c.home, c.away, c.photo].some((i) => i < 0)) {
      throw new Error('Form Responses 1 is missing a Season, Home team, Visiting team or Score sheet photo column.');
    }

    let done = 0;
    let wroteGames = false;
    for (let i = 1; i < data.length && done < READER.maxPerRun; i++) {
      const row = data[i];
      const status = String(row[c.status] || '').trim();
      if (/^(read|check|failed|skipped)/i.test(status)) continue;
      if (!String(row[c.photo] || '').trim()) {
        setStatus_(sheet, i, c, 'skipped', 'No score sheet photo in this response.');
        continue;
      }
      done++;
      const label = describeMatch_(row[c.season], c.week >= 0 ? row[c.week] : '', row[c.away], row[c.home]);
      try {
        const result = readOne_(ss, row, c);
        setStatus_(sheet, i, c, result.status, result.note);
        wroteGames = true;
        if (result.status === 'check') alert_(ss, `Score sheet needs a look: ${label}`, result.note);
      } catch (err) {
        const attempts = Number((status.match(/retry (\d+)/) || [0, 0])[1]) + 1;
        const failed = attempts >= READER.maxAttempts;
        const message = String((err && err.message) || err);
        setStatus_(sheet, i, c, failed ? 'failed' : `retry ${attempts}`, message);
        if (failed) alert_(ss, `Score sheet couldn't be read: ${label}`, message);
      }
    }
    if (wroteGames && typeof scheduleRebuild_ === 'function') scheduleRebuild_();
  } finally {
    lock.releaseLock();
  }
}

/** Reads one response row's score sheet(s) and writes its games. */
function readOne_(ss, row, c) {
  const season = String(row[c.season]).trim();
  const week = c.week >= 0 ? String(row[c.week]).trim() : '';
  const home = String(row[c.home]).trim();
  const away = String(row[c.away]).trim();
  const formScore = {
    home: c.homeScore >= 0 ? toCount_(row[c.homeScore]) : null,
    away: c.awayScore >= 0 ? toCount_(row[c.awayScore]) : null,
  };
  const links = String(row[c.photo]).split(/[\s,]+/).filter((s) => /^https:\/\//.test(s));
  const fileIds = links.map(fileIdFromUrl_).filter(Boolean);
  if (!fileIds.length) return { status: 'skipped', note: 'No score sheet file link found.' };

  const images = fileIds.map(fetchImage_);
  const rosters = rostersFor_(ss, [away, home]);

  // A quick read first; if it doesn't add up, read again more carefully and keep the better one.
  let reading = callClaude_(images, away, home, rosters, 'low');
  let problems = check_(reading, formScore);
  if (problems.length) {
    const second = callClaude_(images, away, home, rosters, 'medium');
    const secondProblems = check_(second, formScore);
    if (secondProblems.length <= problems.length) {
      reading = second;
      problems = secondProblems;
    }
  }

  const note = [problems.join(' '), reading.notes ? `Reader's notes: ${reading.notes}` : ''].filter(Boolean).join(' ');
  writeGames_(ss, { season, week, home, away }, reading.games, problems.join(' '), links.join(' '));
  return { status: problems.length ? 'check' : 'read', note: note || `Read ${reading.games.length} games.` };
}

/** Sends the sheet to Claude and returns the parsed reading. */
function callClaude_(images, away, home, rosters, effort) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  const content = images.map((img) =>
    img.mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: img.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.base64 } },
  );
  const rosterText = [away, home]
    .map((team) => `${team}: ${(rosters[team] || []).join('; ') || '(no roster on file)'}`)
    .join('\n');
  content.push({
    type: 'text',
    text: `Visiting team: ${away}\nHome team: ${home}\n\nRosters:\n${rosterText}\n\nRead every game on this score sheet.`,
  });

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': READER.apiVersion,
      'anthropic-beta': READER.fallbackBeta,
    },
    payload: JSON.stringify({
      model: READER.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      output_config: { effort, format: { type: 'json_schema', schema: GAME_SCHEMA } },
      fallbacks: 'default',
    }),
  });

  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code === 429 || code >= 500) throw new Error(`Claude is busy (HTTP ${code}); will try again.`);
  if (code !== 200) throw new Error(`Claude API error (HTTP ${code}): ${body.slice(0, 300)}`);
  const message = JSON.parse(body);
  if (message.stop_reason === 'refusal') throw new Error('Claude declined to read this sheet.');
  if (message.stop_reason === 'max_tokens') throw new Error('The reading was cut off before it finished.');
  const text = (message.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return JSON.parse(text);
}

/** Problems with a reading, in plain language. Empty when everything adds up. */
function check_(reading, formScore) {
  const problems = [];
  const games = reading.games || [];
  for (let round = 1; round <= 4; round++) {
    const n = games.filter((g) => g.round === round).length;
    if (n !== 4) problems.push(`Round ${round} has ${n} games instead of 4.`);
  }
  const unclear = games.filter((g) => g.winner === 'unclear').length;
  if (unclear) problems.push(`${unclear} game${unclear === 1 ? '' : 's'} with no clear winner.`);

  const visiting = games.filter((g) => g.winner === 'visiting').length;
  const home = games.filter((g) => g.winner === 'home').length;
  const expected =
    formScore.away !== null && formScore.home !== null
      ? { away: formScore.away, home: formScore.home, from: 'the form says' }
      : { away: toCount_(reading.visiting_total), home: toCount_(reading.home_total), from: 'the sheet totals say' };
  if (expected.away !== null && expected.home !== null && (visiting !== expected.away || home !== expected.home)) {
    problems.push(`The games add up to ${visiting}-${home} (visitors-home), but ${expected.from} ${expected.away}-${expected.home}.`);
  }
  return problems;
}

/** Replaces this match's previously read rows on the Games tab with the new reading. */
function writeGames_(ss, match, games, check, links) {
  let sheet = ss.getSheetByName(SHEETS.games);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.games);
    sheet.appendRow(GAMES_HEADERS);
  }
  const data = sheet.getDataRange().getValues();
  const header = data[0].map(String);
  const col = (name) => findColumn_(header, name);
  const same = (a, b) => normalize_(a) === normalize_(b);
  for (let i = data.length - 1; i >= 1; i--) {
    const r = data[i];
    if (
      same(r[col('season')], match.season) &&
      same(r[col('week')], match.week) &&
      same(r[col('home_team')], match.home) &&
      same(r[col('away_team')], match.away) &&
      /^claude/i.test(String(r[col('read_by')] || ''))
    ) {
      sheet.deleteRow(i + 1);
    }
  }
  const stamp = `Claude, ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')}`;
  const rows = games
    .slice()
    .sort((a, b) => a.round - b.round)
    .map((g, i) => {
      const values = {
        season: match.season,
        week: match.week,
        away_team: match.away,
        home_team: match.home,
        round: g.round,
        away_player: g.visiting_player,
        home_player: g.home_player,
        winner: g.winner === 'visiting' ? 'away' : g.winner === 'home' ? 'home' : '',
        check: i === 0 ? check : '',
        sheet: i === 0 ? links : '',
        read_by: stamp,
      };
      return header.map((h) => (normalize_(h) in values ? values[normalize_(h)] : ''));
    });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);
}

/**
 * Gets the photo as an image Claude accepts. Drive's preview service resizes it to
 * READER.maxImagePx and turns iPhone (HEIC) photos into JPEG.
 */
function fetchImage_(fileId) {
  const file = DriveApp.getFileById(fileId);
  const mime = file.getMimeType();
  if (mime === 'application/pdf') {
    if (file.getSize() > 20 * 1024 * 1024) throw new Error('The PDF is larger than 20 MB.');
    return { mimeType: mime, base64: Utilities.base64Encode(file.getBlob().getBytes()) };
  }
  const meta = Drive.Files.get(fileId, { fields: 'thumbnailLink' });
  if (meta.thumbnailLink) {
    const url = meta.thumbnailLink.replace(/=s\d+(-[a-z]+)?$/, `=s${READER.maxImagePx}`);
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) {
      const blob = res.getBlob();
      const type = /^image\/(jpeg|png|gif|webp)$/.test(blob.getContentType()) ? blob.getContentType() : 'image/jpeg';
      return { mimeType: type, base64: Utilities.base64Encode(blob.getBytes()) };
    }
  }
  if (/^image\/(jpeg|png|gif|webp)$/.test(mime) && file.getSize() <= 3.5 * 1024 * 1024) {
    return { mimeType: mime, base64: Utilities.base64Encode(file.getBlob().getBytes()) };
  }
  throw new Error("Google Drive hasn't finished processing the photo yet; will try again.");
}

/** Roster names (with any also-known-as names) for the given teams, from the Players tab. */
function rostersFor_(ss, teams) {
  const out = {};
  const sheet = ss.getSheetByName(SHEETS.players);
  if (!sheet) return out;
  const data = sheet.getDataRange().getValues();
  const header = data[0].map(String);
  const t = findColumn_(header, 'team');
  const n = findColumn_(header, 'name');
  const a = findColumn_(header, 'also_known_as');
  for (const team of teams) out[team] = [];
  for (let i = 1; i < data.length; i++) {
    const team = teams.find((x) => normalize_(x) === normalize_(data[i][t]));
    const name = String(data[i][n] || '').trim();
    if (!team || !name) continue;
    const aka = a >= 0 ? String(data[i][a] || '').trim() : '';
    out[team].push(aka ? `${name} (also written ${aka})` : name);
  }
  return out;
}

function alert_(ss, subject, body) {
  const to = setting_(ss, 'alert_email');
  if (!to) return;
  MailApp.sendEmail(
    to,
    subject,
    `${body}\n\nOpen the League Data spreadsheet: ${ss.getUrl()}\n\n` +
      'Fix the rows for this match on the Games tab and clear the "check" cell. ' +
      'To have the sheet read again instead, clear its "Reader status" cell on the Form Responses 1 tab.',
  );
}

function setStatus_(sheet, rowIndex, c, status, note) {
  sheet.getRange(rowIndex + 1, c.status + 1).setValue(status);
  sheet.getRange(rowIndex + 1, c.note + 1).setValue(note);
}

function toCount_(value) {
  const s = String(value == null ? '' : value).trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

function fileIdFromUrl_(url) {
  const m = url.match(/[?&]id=([\w-]+)/) || url.match(/\/d\/([\w-]+)/);
  return m ? m[1] : '';
}
