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
}

export interface League {
  divisions: Division[];
  divisionById: Map<string, Division>;
  locations: Location[];
  locationById: Map<string, Location>;
  teams: Team[];
  teamById: Map<string, Team>;
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
    };
    matchByKey.set(key, match);
    season!.matches.push(match);
  }

  // ---- results ------------------------------------------------------------
  let pendingApproval = 0;
  const resultRows = readTable('results.csv', problems);
  const hasApproval = resultRows.some((r) => 'approved' in r.v);
  const resultRowFor = new Map<Match, number>();
  for (const r of resultRows) {
    const f = 'results.csv';
    if (hasApproval && !parseBool(get(r, 'approved'))) {
      pendingApproval++;
      continue;
    }
    const season = lookup(seasonById, get(r, 'season'));
    const home = lookup(teamById, get(r, 'home'));
    const away = lookup(teamById, get(r, 'away'));
    const homeScore = parseCount(get(r, 'home_score'));
    const awayScore = parseCount(get(r, 'away_score'));
    const errs = [
      !season && `season "${get(r, 'season')}" isn't on the Seasons tab`,
      !home && `home team "${get(r, 'home')}" isn't on the Teams tab`,
      !away && `away team "${get(r, 'away')}" isn't on the Teams tab`,
      (homeScore === null || awayScore === null) &&
        `games won should be whole numbers (got "${get(r, 'home_score')}" and "${get(r, 'away_score')}")`,
      homeScore !== null && homeScore === awayScore && `the score is tied ${homeScore}–${awayScore}; include the tie-breaker games`,
    ].filter(Boolean);
    if (errs.length) {
      report(f, r.n, `Result skipped: ${errs.join('; ')}.`);
      continue;
    }
    // Find the scheduled match: by week if given, otherwise (or if the week is wrong) by the
    // home/away pairing when that pairing happens only once in the season.
    const week = Number(get(r, 'week'));
    let match = Number.isInteger(week) ? matchByKey.get(matchKey(season!.id, week, home!.id, away!.id)) : undefined;
    if (!match) {
      const candidates = season!.matches.filter((m) => m.homeId === home!.id && m.awayId === away!.id);
      if (candidates.length === 1) match = candidates[0];
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
    if (match.homeScore !== null) {
      if (match.homeScore === homeScore && match.awayScore === awayScore) {
        match.scoreSheetUrls.push(...urls); // same result submitted twice: keep both sheets
        continue;
      }
      report(
        f,
        r.n,
        `Two different results for week ${match.week}, ${away!.name} at ${home!.name} ` +
          `(row ${resultRowFor.get(match)} and row ${r.n}); using row ${r.n}. Delete the wrong one.`,
      );
      match.scoreSheetUrls = [];
    }
    match.homeScore = homeScore;
    match.awayScore = awayScore;
    match.scoreSheetUrls.push(...urls);
    resultRowFor.set(match, r.n);
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
