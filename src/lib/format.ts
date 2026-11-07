import { site } from '../site.config';

/** Today's date (YYYY-MM-DD) in the league's timezone. */
export function todayISO(): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: site.timezone }).format(new Date());
}

/** "2026-11-17" -> "Tue, Nov 17, 2026". Pure calendar math, no timezone drift. */
export function formatDate(iso: string, opts: { weekday?: 'short' | 'long'; year?: boolean } = {}): string {
  const { weekday = 'short', year = true } = opts;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday,
    month: 'short',
    day: 'numeric',
    ...(year ? { year: 'numeric' } : {}),
  });
}

/** A JS Date (as parsed from Markdown front matter) -> ISO date string. */
export function dateToISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "19:00" -> "7:00 PM". Empty stays empty. */
export function formatTime(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h! >= 12 ? 'PM' : 'AM';
  const hour12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}
