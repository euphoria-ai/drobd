/**
 * Date helpers for the week strip.
 *
 * Everything is handled in the device's local timezone and serialised as a
 * plain `YYYY-MM-DD` string, matching the `date` columns in Postgres. Using an
 * ISO timestamp here would shift the day across the date line for anyone east
 * of UTC, so "today" would highlight the wrong pill.
 */

export type IsoDate = string;

export function toIsoDate(date: Date): IsoDate {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromIsoDate(iso: IsoDate): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayIso(): IsoDate {
  return toIsoDate(new Date());
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date = new Date()): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay() is Sunday-based; shift so Monday is 0.
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export interface WeekDay {
  iso: IsoDate;
  /** Single letter for the strip: M T W T F S S. */
  initial: string;
  dayOfMonth: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
}

const INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function buildWeek(weekStart: Date = startOfWeek()): WeekDay[] {
  const today = todayIso();

  return INITIALS.map((initial, index) => {
    const date = addDays(weekStart, index);
    const iso = toIsoDate(date);
    return {
      iso,
      initial,
      dayOfMonth: date.getDate(),
      isToday: iso === today,
      isPast: iso < today,
      isFuture: iso > today,
    };
  });
}

export function daysAgo(days: number): IsoDate {
  return toIsoDate(addDays(new Date(), -days));
}

/** "Mon 12 Aug" -- used as the Daily Outfit header. */
export function formatLongDay(iso: IsoDate): string {
  return fromIsoDate(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
