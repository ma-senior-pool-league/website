/**
 * League data layer.
 *
 * Every table is one tab of the league Google Sheet, synced to a CSV in
 * src/data/league/ (see scripts/sync-sheet.mjs and src/lib/schema.mjs).
 * People type names ("Walpole A", "Greater Boston"); ids and URLs are derived
 * from those names.
 *
 * The site is maintained by non-programmers, so bad data must never break the
 * build: a row with a problem is skipped and reported on /data-check/ (and in
 * the build log), and the rest of the site still publishes.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { TABLES, canonicalHeader, missingColumns, normalizeHeader, slugify } from './schema.mjs';

const DATA_DIR = path.resolve(process.cwd(), 'src/data/league');
const SYNC_STATUS_FILE = path.join(DATA_DIR, '.sync-status.json');
const SEASON_STATUSES = ['upcoming', 'in-progress', 'final'] as const;

export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export interface Problem {
  file: string;
  /** Spreadsheet row number (row 1 is the header). */
  row?: number;
  message: string;
}

export interface Division {
  id: string;
  name: string;
  order: number;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  mapUrl: string;
}

export interface Team {
  id: string;
  name: string;
  /** Current division. Past seasons use the division recorded on each match. */
  divisionId: string;
  locationId: string;
  captain: string;
  note: string;
}

export interface Match {
  seasonId: string;
  week: number;
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** 24h HH:MM, may be empty */
  time: string;
  divisionId: string;
  homeId: string;
  awayId: string;
  /** Games won by each side (tie-breaker games included). null until a result is entered. */
  homeScore: number | null;
  awayScore: number | null;
  /** Links to uploaded score sheets (Google Drive), if any. */
  scoreSheetUrls: string[];
  /** Individual games (from the Games tab), if the score sheet has been read. */
  games: Game[];
}

export interface Player {
  id: string;
  /** Roster team. */
  teamId: string;
  name: string;
  /** Other names people write on score sheets (first name, nickname). */
  aliases: string[];
  /** Not on the Players tab: created from a name written on a score sheet. */
  provisional: boolean;
}

export interface Game {
  match: Match;
  /** 1–4 for the regular rounds, 5 for tie-breakers; 0 if not given. */
  round: number;
  awayPlayerId: string;
  homePlayerId: string;
  winner: 'home' | 'away';
}

export interface PlayerStatRow {
  player: Player;
  /** Wins and losses by week number. */
  weeks: Map<number, { wins: number; losses: number }>;
  wins: number;
  losses: number;
  games: number;
  /** Wins / games, 0–1. */
  winPct: number;
}

export interface StandingRow {
  team: Team;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  /** Games won / games played, 0–1. */
  gameWinPct: number;
}

export interface PlayoffMatch {
  seasonId: string;
  round: string;
  /** ISO date or '' when not yet scheduled */
  date: string;
  time: string;
  team1Id: string;
  team2Id: string;
  /** Display text for where it's played ('' if unknown). */
  location: string;
  locationId: string;
  team1Score: number | null;
  team2Score: number | null;
  note: string;
}

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  matches: Match[];
  /** Divisions that have a schedule this season, in division order. */
  divisionIds: string[];
  standings: Map<string, StandingRow[]>;
  playoffs: PlayoffMatch[];
  /** Player standings per division, best win % first. Only divisions with game data. */
  playerStats: Map<string, PlayerStatRow[]>;
  /** Per division: how many played matches have their games on the Games tab. */
  gameCoverage: Map<string, { withGames: number; played: number }>;
}

export interface NewsItem {
  id: string;
  date: string;
  title: string;
  paragraphs: string[];
  link: string;
}

export interface DocumentItem {
  title: string;
  description: string;
  url: string;
  status: string;
  order: number;
}

export interface Contact {
  role: string;
  name: string;
  divisionId: string;
  email: string;
  phone: string;
}

export interface Settings {
  notice: string;
  contactEmail: string;
  scoreSheetFormUrl: string;
  photoAlbumUrl: string;
  showScoreSheetLinks: boolean;
  /** If set, the Rules page links here instead of showing the built-in (July 2024) text. */
  rulesUrl: string;
  bcaRulesUrl: string;
  wpaRulesUrl: string;
  upaRulesUrl: string;
  /** How player names appear on the site: "Michael Rowley" (full) or "Michael R." (initial). */
  playerNames: 'full' | 'initial';
  /** Games a player needs to appear in the leaders table. */
  playerMinGames: number;
  /** Ask search engines not to list the site (for the preview, before it's announced). */
  hideFromSearch: boolean;
}

export interface League {
  divisions: Division[];
  divisionById: Map<string, Division>;
  locations: Location[];
  locationById: Map<string, Location>;
  teams: Team[];
  teamById: Map<string, Team>;
  players: Player[];
  playerById: Map<string, Player>;
  /** Newest first. */
  seasons: Season[];
  seasonById: Map<string, Season>;
  currentSeason: Season;
  /** Newest first. */
  news: NewsItem[];
  documents: DocumentItem[];
  /** Only contacts marked public. */
  contacts: Contact[];
  settings: Settings;
  problems: Problem[];
  /** Results waiting for someone to tick "Approved" (only if the results tab has that column). */
  pendingApproval: number;
}

// ---- parsing helpers -------------------------------------------------------

interface Row {
  n: number;
  v: Record<string, string>;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Accepts 2026-09-03, 9/3/2026 and 9/3/26 (US order, as Google Sheets exports). */
export function parseDate(value: string): string | null {
  const s = value.trim();
  let y: number, mo: number, d: number;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
    [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
  } else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** Accepts 11:00, 11:00 AM, 11:00:00 AM, 11 AM, 1:30 PM. Returns 24h HH:MM, '' for blank, null if invalid. */
export function parseTime(value: string): string | null {
  const s = value.trim().toUpperCase().replace(/\./g, '');
  if (!s) return '';
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === 'PM' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/**
 * A Google Form timestamp ("11/9/2026 8:45:05", "2026-11-09 8:45:05 AM", or a Sheets serial
 * number like 46335.36 if the column lost its date format) as a sortable
 * "YYYY-MM-DD HH:MM:SS", or '' if blank or unreadable.
 */
export function parseTimestamp(value: string): string {
  const s = value.trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(s) * 86400) * 1000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  const [datePart = '', ...rest] = s.split(/\s+/);
  const date = parseDate(datePart);
  if (!date) return '';
  const m = rest.join(' ').toUpperCase().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return `${date} 00:00:00`;
  let h = Number(m[1]);
  if (m[4]) h = (h % 12) + (m[4] === 'PM' ? 12 : 0);
  return `${date} ${pad(h)}:${m[2]}:${m[3] ?? '00'}`;
}

/**
 * Of several matches (same teams, same home side), the one played most recently by `day`
 * (YYYY-MM-DD, with a day's leeway for late-night submissions), or else the next one.
 */
function matchNear(matches: Match[], day: string): Match {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const limit = next.toISOString().slice(0, 10);
  const byDate = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  return byDate.filter((m) => m.date <= limit).at(-1) ?? byDate[0];
}

const parseBool = (v: string) => /^(yes|y|true|x|1|✓|✔)$/i.test(v.trim());
const parseCount = (v: string): number | null => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
const isLink = (v: string) => /^https?:\/\/\S+$/i.test(v) || /^\/\S*$/.test(v);
const isWebLink = (v: string) => /^https:\/\/\S+$/i.test(v);

function readTable(file: string, problems: Problem[]): Row[] {
  const def = TABLES[file]!;
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    if (!def.optionalFile) problems.push({ file, message: 'This tab is missing.' });
    return [];
  }
  const parsed = Papa.parse<Record<string, string>>(fs.readFileSync(full, 'utf8').replace(/^﻿/, ''), {
    header: true,
    delimiter: ',',
    skipEmptyLines: 'greedy',
    transformHeader: (h) => canonicalHeader(file, h),
    transform: (v) => v.trim(),
  });
  const missing = missingColumns(file, parsed.meta.fields ?? []);
  if (missing.length) {
    problems.push({ file, message: `Missing column(s): ${missing.join(', ')}. The whole tab was ignored.` });
    return [];
  }
  return parsed.data
    .map((v, i) => ({ n: i + 2, v }))
    .filter((r) => Object.values(r.v).some((x) => x !== '' && x !== undefined));
}

const get = (r: Row, col: string) => r.v[col] ?? '';

function computeStandings(matches: Match[], teamIds: string[], teamById: Map<string, Team>): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of teamIds) {
    rows.set(id, { team: teamById.get(id)!, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, gameWinPct: 0 });
  }
  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const home = rows.get(m.homeId)!;
    const away = rows.get(m.awayId)!;
    home.played++;
    away.played++;
    home.gamesWon += m.homeScore;
    home.gamesLost += m.awayScore;
    away.gamesWon += m.awayScore;
    away.gamesLost += m.homeScore;
    const [winner, loser] = m.homeScore > m.awayScore ? [home, away] : [away, home];
    winner.wins++;
    loser.losses++;
  }
  for (const row of rows.values()) {
    const total = row.gamesWon + row.gamesLost;
    row.gameWinPct = total ? row.gamesWon / total : 0;
  }
  // League standings: matches won, then total games won (as on the official standings sheet).
  return [...rows.values()].sort(
    (a, b) => b.wins - a.wins || b.gamesWon - a.gamesWon || a.team.name.localeCompare(b.team.name),
  );
}

/** "home"/"away" (or visitor, a team name, or the winning player's name as written). */
function parseWinner(value: string, home: Team, away: Team, homePlayer: string, awayPlayer: string): 'home' | 'away' | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (['home', 'h'].includes(v) || slugify(v) === home.id || v === homePlayer.trim().toLowerCase()) return 'home';
  if (['away', 'a', 'visitor', 'visitors', 'visiting', 'v'].includes(v) || slugify(v) === away.id || v === awayPlayer.trim().toLowerCase()) {
    return 'away';
  }
  return null;
}

/** Player standings from individual games: best win %, then most wins. */
function computePlayerStats(matches: Match[], playerById: Map<string, Player>): PlayerStatRow[] {
  const rows = new Map<string, PlayerStatRow>();
  const tally = (playerId: string, week: number, won: boolean) => {
    let row = rows.get(playerId);
    if (!row) {
      row = { player: playerById.get(playerId)!, weeks: new Map(), wins: 0, losses: 0, games: 0, winPct: 0 };
      rows.set(playerId, row);
    }
    const wk = row.weeks.get(week) ?? { wins: 0, losses: 0 };
    if (won) {
      wk.wins++;
      row.wins++;
    } else {
      wk.losses++;
      row.losses++;
    }
    row.weeks.set(week, wk);
    row.games++;
  };
  for (const m of matches) {
    for (const g of m.games) {
      tally(g.awayPlayerId, m.week, g.winner === 'away');
      tally(g.homePlayerId, m.week, g.winner === 'home');
    }
  }
  for (const row of rows.values()) row.winPct = row.games ? row.wins / row.games : 0;
  return [...rows.values()].sort(
    (a, b) => b.winPct - a.winPct || b.wins - a.wins || a.player.name.localeCompare(b.player.name),
  );
}

/** A player's name as shown on the site, per the player_names setting. */
export function playerName(player: Player, settings: Settings): string {
  if (settings.playerNames === 'full') return player.name;
  const parts = player.name.split(' ');
  if (parts.length < 2) return player.name;
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

// ---- loader ----------------------------------------------------------------

let cache: League | undefined;

export function getLeague(): League {
  if (cache) return cache;
  const problems: Problem[] = [];
  const report = (file: string, row: number, message: string) => problems.push({ file, row, message });

  /** Registers an entity by id (from the `id` column if present, else the name); returns false on clash. */
  function register<T>(map: Map<string, T>, file: string, r: Row, name: string, value: (id: string) => T): boolean {
    if (!name) return report(file, r.n, 'Name is blank.'), false;
    const id = slugify(get(r, 'id') || name);
    if (!id) return report(file, r.n, `"${name}" needs at least one letter or number.`), false;
    if (map.has(id)) return report(file, r.n, `"${name}" is listed twice.`), false;
    map.set(id, value(id));
    return true;
  }
  const lookup = <T,>(map: Map<string, T>, value: string): T | undefined => map.get(slugify(value));

  // ---- divisions ----------------------------------------------------------
  const divisionById = new Map<string, Division>();
  for (const r of readTable('divisions.csv', problems)) {
    const order = Number(get(r, 'order') || 999);
    register(divisionById, 'divisions.csv', r, get(r, 'name'), (id) => ({
      id,
      name: get(r, 'name'),
      order: Number.isFinite(order) ? order : 999,
    }));
  }
  const divisions = [...divisionById.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  // ---- locations ----------------------------------------------------------
  const locationById = new Map<string, Location>();
  for (const r of readTable('locations.csv', problems)) {
    const mapUrl = get(r, 'map_url');
    if (mapUrl && !isWebLink(mapUrl)) report('locations.csv', r.n, `Map link "${mapUrl}" isn't a web address; ignored.`);
    register(locationById, 'locations.csv', r, get(r, 'name'), (id) => ({
      id,
      name: get(r, 'name'),
      address: get(r, 'address'),
      city: get(r, 'city'),
      phone: get(r, 'phone'),
      mapUrl: isWebLink(mapUrl) ? mapUrl : '',
    }));
  }
  const locations = [...locationById.values()];

  // ---- teams --------------------------------------------------------------
  const teamById = new Map<string, Team>();
  for (const r of readTable('teams.csv', problems)) {
    const division = lookup(divisionById, get(r, 'division'));
    if (!division) {
      report('teams.csv', r.n, `Division "${get(r, 'division')}" isn't on the Divisions tab; team skipped.`);
      continue;
    }
    const location = lookup(locationById, get(r, 'home_location'));
    if (get(r, 'home_location') && !location) {
      report('teams.csv', r.n, `Home location "${get(r, 'home_location')}" isn't on the Locations tab.`);
    }
    register(teamById, 'teams.csv', r, get(r, 'name'), (id) => ({
      id,
      name: get(r, 'name'),
      divisionId: division.id,
      locationId: location?.id ?? '',
      captain: get(r, 'captain'),
      note: get(r, 'note'),
    }));
  }
  const teams = [...teamById.values()];

  // ---- seasons ------------------------------------------------------------
  const seasonById = new Map<string, Season>();
  const markedCurrent: string[] = [];
  for (const r of readTable('seasons.csv', problems)) {
    const start = parseDate(get(r, 'start_date'));
    if (!start) {
      report('seasons.csv', r.n, `Start date "${get(r, 'start_date')}" isn't a date (use 9/3/2026); season skipped.`);
      continue;
    }
    const endRaw = get(r, 'end_date');
    const end = endRaw ? parseDate(endRaw) : '';
    if (end === null) report('seasons.csv', r.n, `End date "${endRaw}" isn't a date; ignored.`);
    let status = slugify(get(r, 'status')) as SeasonStatus;
    if (!SEASON_STATUSES.includes(status)) {
      report('seasons.csv', r.n, `Status "${get(r, 'status')}" should be Upcoming, In progress or Final; using In progress.`);
      status = 'in-progress';
    }
    const ok = register(seasonById, 'seasons.csv', r, get(r, 'name'), (id) => ({
      id,
      name: get(r, 'name'),
      startDate: start,
      endDate: end ?? '',
      status,
      matches: [],
      divisionIds: [],
      standings: new Map(),
      playoffs: [],
      playerStats: new Map(),
      gameCoverage: new Map(),
    }));
    if (ok && parseBool(get(r, 'current'))) markedCurrent.push(slugify(get(r, 'id') || get(r, 'name')));
  }
  const seasons = [...seasonById.values()].sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (!seasons.length) {
    throw new Error('League data: the Seasons tab has no usable rows, so there is nothing to show.');
  }

  // ---- schedule -----------------------------------------------------------
  const matchKey = (season: string, week: number, home: string, away: string) => `${season}|${week}|${home}|${away}`;
  const matchByKey = new Map<string, Match>();
  for (const r of readTable('schedule.csv', problems)) {
    const f = 'schedule.csv';
    const season = lookup(seasonById, get(r, 'season'));
    const division = lookup(divisionById, get(r, 'division'));
    const home = lookup(teamById, get(r, 'home'));
    const away = lookup(teamById, get(r, 'away'));
    const week = Number(get(r, 'week'));
    const date = parseDate(get(r, 'date'));
    const time = parseTime(get(r, 'time'));
    const errs = [
      !season && `season "${get(r, 'season')}" isn't on the Seasons tab`,
      !division && `division "${get(r, 'division')}" isn't on the Divisions tab`,
      !home && `home team "${get(r, 'home')}" isn't on the Teams tab`,
      !away && `away team "${get(r, 'away')}" isn't on the Teams tab`,
      (!Number.isInteger(week) || week < 1) && `week "${get(r, 'week')}" should be a whole number`,
      !date && `date "${get(r, 'date')}" isn't a date (use 9/3/2026)`,
      time === null && `time "${get(r, 'time')}" isn't a time (use 11:00 AM)`,
      home && away && home.id === away.id && 'a team is playing itself',
    ].filter(Boolean);
    if (errs.length) {
      report(f, r.n, `Match skipped: ${errs.join('; ')}.`);
      continue;
    }
    const key = matchKey(season!.id, week, home!.id, away!.id);
    if (matchByKey.has(key)) {
      report(f, r.n, `Match skipped: week ${week}, ${away!.name} at ${home!.name} is listed twice.`);
      continue;
    }
    const match: Match = {
      seasonId: season!.id,
      week,
      date: date!,
      time: time!,
      divisionId: division!.id,
      homeId: home!.id,
      awayId: away!.id,
      homeScore: null,
      awayScore: null,
      scoreSheetUrls: [],
      games: [],
    };
    matchByKey.set(key, match);
    season!.matches.push(match);
  }

  // ---- results ------------------------------------------------------------
  let pendingApproval = 0;
  const resultRows = readTable('results.csv', problems);
  const hasApproval = resultRows.some((r) => 'approved' in r.v);
  // Which row each match's result came from, and when it was sent in ('' = typed or pasted in).
  const resultFrom = new Map<Match, { row: number; at: string }>();
  for (const r of resultRows) {
    const f = 'results.csv';
    if (hasApproval && !parseBool(get(r, 'approved'))) {
      pendingApproval++;
      continue;
    }
    const at = parseTimestamp(get(r, 'timestamp'));
    const sentOn = at.slice(0, 10);
    // The form doesn't ask for the season or week: the Sheet's script fills them in. If it
    // couldn't, use the latest season that had started by the day the sheet was sent in.
    const seasonName = get(r, 'season');
    const season = seasonName
      ? lookup(seasonById, seasonName)
      : sentOn
        ? seasons.find((s) => s.startDate <= sentOn)
        : undefined;
    const home = lookup(teamById, get(r, 'home'));
    const away = lookup(teamById, get(r, 'away'));
    const homeScore = parseCount(get(r, 'home_score'));
    const awayScore = parseCount(get(r, 'away_score'));
    const errs = [
      !season && (seasonName ? `season "${seasonName}" isn't on the Seasons tab` : 'the season is blank'),
      !home && `home team "${get(r, 'home')}" isn't on the Teams tab`,
      !away && `visiting team "${get(r, 'away')}" isn't on the Teams tab`,
      (homeScore === null || awayScore === null) &&
        `games won should be whole numbers (got "${get(r, 'home_score')}" and "${get(r, 'away_score')}")`,
      homeScore !== null && homeScore === awayScore && `the score is tied ${homeScore}–${awayScore}; include the tie-breaker games`,
    ].filter(Boolean);
    if (errs.length) {
      report(f, r.n, `Result skipped: ${errs.join('; ')}.`);
      continue;
    }
    // Find the scheduled match: by week if given, otherwise (or if the week is wrong) by the
    // home/away pairing: the only such match in the season, or the one nearest the day the
    // sheet was sent in.
    const week = Number(get(r, 'week'));
    let match = Number.isInteger(week) ? matchByKey.get(matchKey(season!.id, week, home!.id, away!.id)) : undefined;
    if (!match) {
      const candidates = season!.matches.filter((m) => m.homeId === home!.id && m.awayId === away!.id);
      if (candidates.length === 1) match = candidates[0];
      else if (candidates.length > 1 && sentOn) match = matchNear(candidates, sentOn);
    }
    if (!match) {
      report(
        f,
        r.n,
        `Result skipped: no ${season!.name} match on the Schedule tab for ${away!.name} at ${home!.name}` +
          (get(r, 'week') ? ` in week ${get(r, 'week')}` : '') +
          '. Check the week and which team was home.',
      );
      continue;
    }
    const urls = get(r, 'score_sheet')
      .split(/[\s,]+/)
      .filter((u) => isWebLink(u));
    const prev = resultFrom.get(match);
    if (match.homeScore !== null && prev) {
      if (match.homeScore === homeScore && match.awayScore === awayScore) {
        match.scoreSheetUrls.push(...urls); // same result submitted twice: keep both sheets
        continue;
      }
      // The later submission wins. Google Forms adds each response above any rows that were
      // pasted in, so row order alone can't tell; rows without a timestamp count as oldest.
      const newer = at >= prev.at;
      const used = newer ? r.n : prev.row;
      report(
        f,
        r.n,
        `Two different results for week ${match.week}, ${away!.name} at ${home!.name} ` +
          `(row ${Math.min(prev.row, r.n)} and row ${Math.max(prev.row, r.n)}); using row ${used}` +
          `${at || prev.at ? ', the one sent in later' : ''}. Delete the wrong one.`,
      );
      if (!newer) continue;
      match.scoreSheetUrls = [];
    }
    match.homeScore = homeScore;
    match.awayScore = awayScore;
    match.scoreSheetUrls.push(...urls);
    resultFrom.set(match, { row: r.n, at });
  }

  // ---- players (rosters) --------------------------------------------------
  const playerById = new Map<string, Player>();
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const firstWord = (s: string) => norm(s).split(' ')[0] ?? '';
  for (const r of readTable('players.csv', problems)) {
    const team = lookup(teamById, get(r, 'team'));
    const name = get(r, 'name').replace(/\s+/g, ' ');
    if (!team) {
      report('players.csv', r.n, `Team "${get(r, 'team')}" isn't on the Teams tab; player skipped.`);
      continue;
    }
    if (!name) {
      report('players.csv', r.n, 'Name is blank.');
      continue;
    }
    const id = slugify(`${team.id} ${name}`);
    if (playerById.has(id)) {
      report('players.csv', r.n, `${name} is listed twice for ${team.name}.`);
      continue;
    }
    const aliases = get(r, 'also_known_as')
      .split(/[,;]/)
      .map((a) => a.trim())
      .filter(Boolean);
    playerById.set(id, { id, teamId: team.id, name, aliases, provisional: false });
  }

  /**
   * Finds the player meant by a name written on a score sheet: the full name, a listed
   * nickname, or a first name that only one player on that team has. A full name from
   * another team's roster counts too (substitutes). Anything else becomes a new player.
   */
  const reportedNames = new Set<string>();
  function resolvePlayer(teamId: string, written: string, file: string, row: number): Player | undefined {
    const w = norm(written);
    if (!w) return undefined;
    const listed = [...playerById.values()].filter((p) => !p.provisional);
    const roster = listed.filter((p) => p.teamId === teamId);
    const exact = roster.find((p) => norm(p.name) === w) ?? roster.find((p) => p.aliases.some((a) => norm(a) === w));
    if (exact) return exact;
    const sameFirst = roster.filter(
      (p) => firstWord(p.name) === firstWord(w) || p.aliases.some((a) => norm(a) === firstWord(w)),
    );
    if (sameFirst.length === 1) return sameFirst[0];
    const elsewhere = listed.filter((p) => norm(p.name) === w);
    if (elsewhere.length === 1) return elsewhere[0];

    const team = teamById.get(teamId)!;
    const id = slugify(`${teamId} ${written}`);
    let player = playerById.get(id);
    if (!player) {
      player = { id, teamId, name: written.trim().replace(/\s+/g, ' '), aliases: [], provisional: true };
      playerById.set(id, player);
    }
    if (!reportedNames.has(id)) {
      reportedNames.add(id);
      report(
        file,
        row,
        sameFirst.length > 1
          ? `"${written}" could be more than one ${team.name} player (${sameFirst.map((p) => p.name).join(', ')}); ` +
              'counted separately for now. Write the full name in the Games tab.'
          : `"${written}" isn't on the Players tab for ${team.name}; counted as a new player. Add them to the Players tab.`,
      );
    }
    return player;
  }

  // ---- games (one row per game, written by the score-sheet reader) ---------
  for (const r of readTable('games.csv', problems)) {
    const f = 'games.csv';
    const season = lookup(seasonById, get(r, 'season'));
    const home = lookup(teamById, get(r, 'home_team'));
    const away = lookup(teamById, get(r, 'away_team'));
    const errs = [
      !season && `season "${get(r, 'season')}" isn't on the Seasons tab`,
      !home && `home team "${get(r, 'home_team')}" isn't on the Teams tab`,
      !away && `away team "${get(r, 'away_team')}" isn't on the Teams tab`,
    ].filter(Boolean);
    if (errs.length) {
      report(f, r.n, `Game skipped: ${errs.join('; ')}.`);
      continue;
    }
    const weekRaw = get(r, 'week');
    const week = Number(weekRaw);
    let match = weekRaw ? matchByKey.get(matchKey(season!.id, week, home!.id, away!.id)) : undefined;
    if (!match) {
      const candidates = season!.matches.filter((m) => m.homeId === home!.id && m.awayId === away!.id);
      if (candidates.length === 1) match = candidates[0];
    }
    if (!match) {
      report(
        f,
        r.n,
        `Game skipped: no ${season!.name} match on the Schedule tab for ${away!.name} at ${home!.name}` +
          (weekRaw ? ` in week ${weekRaw}` : '') +
          '.',
      );
      continue;
    }
    const winner = parseWinner(get(r, 'winner'), home!, away!, get(r, 'home_player'), get(r, 'away_player'));
    if (!get(r, 'away_player') || !get(r, 'home_player') || !winner) {
      report(
        f,
        r.n,
        `Game skipped: ${!winner ? `winner "${get(r, 'winner')}" should be home or away` : 'a player name is blank'}.`,
      );
      continue;
    }
    const awayPlayer = resolvePlayer(away!.id, get(r, 'away_player'), f, r.n)!;
    const homePlayer = resolvePlayer(home!.id, get(r, 'home_player'), f, r.n)!;
    const check = get(r, 'check');
    if (check) report(f, r.n, `Flagged by the score-sheet reader: ${check} Clear the check cell once it's right.`);
    const round = Number(get(r, 'round'));
    match.games.push({
      match,
      round: Number.isInteger(round) && round > 0 ? round : 0,
      awayPlayerId: awayPlayer.id,
      homePlayerId: homePlayer.id,
      winner,
    });
  }

  // Each match's games must add up to its result.
  for (const season of seasonById.values()) {
    for (const m of season.matches) {
      if (!m.games.length) continue;
      const awayWins = m.games.filter((g) => g.winner === 'away').length;
      const homeWins = m.games.length - awayWins;
      const regular = m.games.filter((g) => g.round >= 1 && g.round <= 4).length;
      const label = `${season.name} week ${m.week}, ${teamById.get(m.awayId)!.name} at ${teamById.get(m.homeId)!.name}`;
      if (m.homeScore !== null && (awayWins !== m.awayScore || homeWins !== m.homeScore)) {
        problems.push({
          file: 'games.csv',
          message:
            `${label}: the games add up to ${awayWins}–${homeWins}, but the result is ` +
            `${m.awayScore}–${m.homeScore}. Check this match's rows.`,
        });
      } else if (regular && regular !== 16) {
        problems.push({ file: 'games.csv', message: `${label}: ${regular} regular games are listed; a match has 16.` });
      }
    }
  }

  // ---- playoffs -----------------------------------------------------------
  for (const r of readTable('playoffs.csv', problems)) {
    const f = 'playoffs.csv';
    const season = lookup(seasonById, get(r, 'season'));
    const t1 = lookup(teamById, get(r, 'team_1'));
    const t2 = lookup(teamById, get(r, 'team_2'));
    const dateRaw = get(r, 'date');
    const date = dateRaw ? parseDate(dateRaw) : '';
    const time = parseTime(get(r, 'time'));
    const s1Raw = get(r, 'team_1_score');
    const s2Raw = get(r, 'team_2_score');
    const s1 = s1Raw ? parseCount(s1Raw) : null;
    const s2 = s2Raw ? parseCount(s2Raw) : null;
    const errs = [
      !season && `season "${get(r, 'season')}" isn't on the Seasons tab`,
      !t1 && `team "${get(r, 'team_1')}" isn't on the Teams tab`,
      !t2 && `team "${get(r, 'team_2')}" isn't on the Teams tab`,
      date === null && `date "${dateRaw}" isn't a date`,
      time === null && `time "${get(r, 'time')}" isn't a time`,
      ((s1Raw && s1 === null) || (s2Raw && s2 === null)) && 'scores should be whole numbers',
      (s1 === null) !== (s2 === null) && 'enter both scores or neither',
    ].filter(Boolean);
    if (errs.length) {
      report(f, r.n, `Playoff match skipped: ${errs.join('; ')}.`);
      continue;
    }
    // Location may name a location, or a team (meaning that team's home location).
    const locRaw = get(r, 'location');
    const loc = lookup(locationById, locRaw) ?? locationById.get(lookup(teamById, locRaw)?.locationId ?? '');
    season!.playoffs.push({
      seasonId: season!.id,
      round: get(r, 'round') || 'Playoffs',
      date: date ?? '',
      time: time ?? '',
      team1Id: t1!.id,
      team2Id: t2!.id,
      location: loc?.name ?? locRaw,
      locationId: loc?.id ?? '',
      team1Score: s1,
      team2Score: s2,
      note: get(r, 'note'),
    });
  }

  // ---- news ---------------------------------------------------------------
  const news: NewsItem[] = [];
  for (const r of readTable('news.csv', problems)) {
    const date = parseDate(get(r, 'date'));
    const title = get(r, 'title');
    const link = get(r, 'link');
    if (!date || !title) {
      report('news.csv', r.n, `News item skipped: ${!date ? `date "${get(r, 'date')}" isn't a date` : 'title is blank'}.`);
      continue;
    }
    if (link && !isLink(link)) report('news.csv', r.n, `Link "${link}" isn't a web address; ignored.`);
    news.push({
      id: slugify(`${date}-${title}`),
      date,
      title,
      paragraphs: get(r, 'text')
        .split(/\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean),
      link: isLink(link) ? link : '',
    });
  }
  news.sort((a, b) => b.date.localeCompare(a.date));

  // ---- documents ----------------------------------------------------------
  const documents: DocumentItem[] = [];
  for (const r of readTable('documents.csv', problems)) {
    const url = get(r, 'url');
    if (url && !isLink(url)) report('documents.csv', r.n, `Link "${url}" isn't a web address; shown without a link.`);
    const order = Number(get(r, 'order') || 999);
    documents.push({
      title: get(r, 'title'),
      description: get(r, 'description'),
      url: isLink(url) ? url : '',
      status: get(r, 'status'),
      order: Number.isFinite(order) ? order : 999,
    });
  }
  documents.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  // ---- contacts -----------------------------------------------------------
  const contacts: Contact[] = [];
  for (const r of readTable('contacts.csv', problems)) {
    if (!parseBool(get(r, 'public'))) continue;
    const divRaw = get(r, 'division');
    const division = divRaw ? lookup(divisionById, divRaw) : undefined;
    if (divRaw && !division) report('contacts.csv', r.n, `Division "${divRaw}" isn't on the Divisions tab.`);
    contacts.push({
      role: get(r, 'role'),
      name: get(r, 'name'),
      divisionId: division?.id ?? '',
      email: get(r, 'email'),
      phone: get(r, 'phone'),
    });
  }

  // ---- settings -----------------------------------------------------------
  const raw = new Map<string, string>();
  for (const r of readTable('settings.csv', problems)) raw.set(normalizeHeader(get(r, 'key')), get(r, 'value'));
  const webSetting = (key: string) => {
    const v = raw.get(key) ?? '';
    if (v && !isWebLink(v)) {
      problems.push({ file: 'settings.csv', message: `"${key}" should be a web address starting with https://; ignored.` });
      return '';
    }
    return v;
  };
  const settings: Settings = {
    notice: raw.get('notice') ?? '',
    contactEmail: raw.get('contact_email') ?? '',
    scoreSheetFormUrl: webSetting('score_sheet_form_url'),
    photoAlbumUrl: webSetting('photo_album_url'),
    showScoreSheetLinks: parseBool(raw.get('show_score_sheet_links') ?? ''),
    rulesUrl: webSetting('rules_url'),
    bcaRulesUrl: webSetting('bca_rules_url'),
    wpaRulesUrl: webSetting('wpa_rules_url'),
    upaRulesUrl: webSetting('upa_rules_url'),
    playerNames: norm(raw.get('player_names') ?? '') === 'full' ? 'full' : 'initial',
    playerMinGames: (() => {
      const n = Number(raw.get('player_min_games') || 30);
      return Number.isFinite(n) && n >= 0 ? n : 30;
    })(),
    hideFromSearch: parseBool(raw.get('hide_from_search') ?? ''),
  };

  // ---- current season -----------------------------------------------------
  let current: Season | undefined;
  if (markedCurrent.length === 1) current = seasonById.get(markedCurrent[0]!);
  else {
    const candidates = markedCurrent.length ? seasons.filter((s) => markedCurrent.includes(s.id)) : seasons;
    current = candidates.find((s) => s.status !== 'upcoming') ?? candidates[0]!;
    problems.push({
      file: 'seasons.csv',
      message: `${markedCurrent.length ? 'More than one' : 'No'} season is marked Current; showing ${current.name}.`,
    });
  }

  // ---- standings per season + division ------------------------------------
  for (const season of seasons) {
    season.matches.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.week - b.week);
    season.playoffs.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const present = new Set(season.matches.map((m) => m.divisionId));
    season.divisionIds = divisions.filter((d) => present.has(d.id)).map((d) => d.id);
    for (const divisionId of season.divisionIds) {
      const matches = season.matches.filter((m) => m.divisionId === divisionId);
      const teamIds = [...new Set(matches.flatMap((m) => [m.homeId, m.awayId]))];
      season.standings.set(divisionId, computeStandings(matches, teamIds, teamById));

      const played = matches.filter(isPlayed);
      season.gameCoverage.set(divisionId, {
        withGames: played.filter((m) => m.games.length).length,
        played: played.length,
      });
      const stats = computePlayerStats(matches, playerById);
      if (stats.length) season.playerStats.set(divisionId, stats);
    }
  }

  if (problems.length) {
    console.warn(
      `\n[league data] ${problems.length} problem(s), listed on /data-check/:\n` +
        problems.map((p) => `  - ${p.file}${p.row ? ` row ${p.row}` : ''}: ${p.message}`).join('\n') +
        '\n',
    );
  }

  cache = {
    divisions,
    divisionById,
    locations,
    locationById,
    teams,
    teamById,
    players: [...playerById.values()],
    playerById,
    seasons,
    seasonById,
    currentSeason: current!,
    news,
    documents,
    contacts,
    settings,
    problems,
    pendingApproval,
  };
  return cache;
}

export function isPlayed(m: Match): boolean {
  return m.homeScore !== null && m.awayScore !== null;
}

/** Matches on the next date (on or after `today`) that still has unplayed matches. */
export function nextMatches(matches: Match[], today: string): Match[] {
  const upcoming = matches.filter((m) => !isPlayed(m) && m.date >= today);
  if (!upcoming.length) return [];
  const nextDate = upcoming.reduce((min, m) => (m.date < min ? m.date : min), upcoming[0]!.date);
  return upcoming.filter((m) => m.date === nextDate);
}

/** Group a list of matches by week number, in week order. */
export function byWeek(matches: Match[]): [number, Match[]][] {
  const weeks = new Map<number, Match[]>();
  for (const m of matches) weeks.set(m.week, [...(weeks.get(m.week) ?? []), m]);
  return [...weeks.entries()].sort(([a], [b]) => a - b);
}

export interface SyncStatus {
  syncedAt: string;
  files: Record<string, string>;
}

/** Written by scripts/sync-sheet.mjs after each sync; absent when data comes only from the repo. */
export function readSyncStatus(): SyncStatus | undefined {
  try {
    return JSON.parse(fs.readFileSync(SYNC_STATUS_FILE, 'utf8')) as SyncStatus;
  } catch {
    return undefined;
  }
}

export const seasonStatusLabel: Record<SeasonStatus, string> = {
  upcoming: 'Upcoming',
  'in-progress': 'In progress',
  final: 'Final',
};
