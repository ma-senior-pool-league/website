/**
 * Shape of every league data table (one CSV per tab of the league Google Sheet).
 * Shared by the site (src/lib/league.ts) and the sync script (scripts/sync-sheet.mjs).
 *
 * Column headers are matched loosely: case, spaces and punctuation are ignored
 * ("Home team" == "home_team"), and the aliases below let a Google Form's
 * question titles be used as-is.
 */

/** @typedef {{ required: string[], optional: string[], optionalFile: boolean, aliases?: Record<string, string> }} TableDef */

/** @type {Record<string, TableDef>} */
export const TABLES = {
  'divisions.csv': { required: ['name'], optional: ['order', 'id'], optionalFile: false },
  'locations.csv': { required: ['name', 'address', 'city'], optional: ['phone', 'map_url', 'id'], optionalFile: false },
  'teams.csv': {
    required: ['name', 'division', 'home_location'],
    optional: ['captain', 'note', 'id'],
    optionalFile: false,
    aliases: { location: 'home_location' },
  },
  'seasons.csv': {
    required: ['name', 'start_date', 'status'],
    optional: ['end_date', 'current', 'id'],
    optionalFile: false,
  },
  'schedule.csv': {
    required: ['season', 'week', 'date', 'division', 'home', 'away'],
    optional: ['time'],
    optionalFile: true,
    aliases: { home_team: 'home', away_team: 'away' },
  },
  'results.csv': {
    required: ['season', 'home', 'away', 'home_score', 'away_score'],
    optional: ['week', 'approved', 'score_sheet'],
    optionalFile: true,
    aliases: {
      home_team: 'home',
      away_team: 'away',
      visiting_team: 'away',
      home_team_games_won: 'home_score',
      away_team_games_won: 'away_score',
      visiting_team_games_won: 'away_score',
      home_games_won: 'home_score',
      away_games_won: 'away_score',
      score_sheet_photo: 'score_sheet',
      score_sheet_photos: 'score_sheet',
      completed_score_sheet: 'score_sheet',
    },
  },
  'playoffs.csv': {
    required: ['season', 'team_1', 'team_2'],
    optional: ['round', 'date', 'time', 'location', 'team_1_score', 'team_2_score', 'note'],
    optionalFile: true,
  },
  'news.csv': { required: ['date', 'title', 'text'], optional: ['link'], optionalFile: true },
  'documents.csv': { required: ['title'], optional: ['description', 'url', 'status', 'order'], optionalFile: true },
  'contacts.csv': {
    required: ['role', 'name'],
    optional: ['division', 'email', 'phone', 'public'],
    optionalFile: true,
  },
  'settings.csv': { required: ['key', 'value'], optional: [], optionalFile: true },
};

/** "Home Team (games won)" -> "home_team_games_won" */
export function normalizeHeader(header) {
  return String(header)
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Normalized header, then mapped through the table's aliases. */
export function canonicalHeader(file, header) {
  const h = normalizeHeader(header);
  return TABLES[file]?.aliases?.[h] ?? h;
}

/** Required columns missing from a list of raw headers. */
export function missingColumns(file, headers) {
  const have = new Set(headers.map((h) => canonicalHeader(file, h)));
  return (TABLES[file]?.required ?? []).filter((c) => !have.has(c));
}

/** "Walpole A" -> "walpole-a". Used for ids, URLs and matching names typed in the sheet. */
export function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
