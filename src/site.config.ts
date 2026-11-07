/**
 * Site settings that only change with a redesign. Everything the league updates
 * (banner, contact email, form and photo links, current season, content) lives
 * in the league Google Sheet. See src/data/league/README.md.
 */
export const site = {
  name: 'MA Senior Pool League',
  tagline: 'Team 8-ball for players 60 and over, at senior centers across Massachusetts.',

  /** IANA timezone used to decide which matches are "upcoming" at build time. */
  timezone: 'America/New_York',

  /** `requires` hides an item until that Settings value is filled in. */
  nav: [
    { href: '/standings/', label: 'Standings' },
    { href: '/schedule/', label: 'Schedules' },
    { href: '/playoffs/', label: 'Playoffs' },
    { href: '/locations/', label: 'Locations' },
    { href: '/rules/', label: 'Rules' },
    { href: '/forms/', label: 'Forms' },
    { href: '/photos/', label: 'Photos', requires: 'photoAlbumUrl' },
    { href: '/news/', label: 'News' },
    { href: '/contact/', label: 'Contact' },
  ] as { href: string; label: string; requires?: 'photoAlbumUrl' | 'scoreSheetFormUrl' }[],
};
