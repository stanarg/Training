// Local-date helpers. Dates in the store are local YYYY-MM-DD strings.

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(start, -((start.getDay() + 6) % 7));
}

export function weekDates(date) {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatLong = (iso) => longDate.format(fromISO(iso));
export const formatShort = (iso) => shortDate.format(fromISO(iso));
export const formatDayMonth = (iso) => dayMonth.format(fromISO(iso));
export const formatDayMonthYear = (iso) => dayMonthYear.format(fromISO(iso));

/** "This week", "Last week" or "Week of 5 Oct" for the week starting `mondayISO`. */
export function weekLabel(mondayISO, todayISO) {
  const thisWeek = toISO(startOfWeek(fromISO(todayISO)));
  if (mondayISO === thisWeek) return 'This week';
  if (mondayISO === toISO(addDays(fromISO(thisWeek), -7))) return 'Last week';
  return `Week of ${formatDayMonth(mondayISO)}`;
}
