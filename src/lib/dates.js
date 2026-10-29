// Semua tarikh disimpan sebagai teks 'YYYY-MM-DD' (masa tempatan) supaya tiada isu timezone.
// Paparan guna format Bahasa Malaysia (contoh: 27 Okt, Isnin).
const LOCALE = 'ms-MY';
const pad = (n) => String(n).padStart(2, '0');

export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISODate(new Date());
export const nowIso = () => new Date().toISOString();

export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function startOfWeek(s) {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISODate(d);
}

export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
export const inRange = (s, from, to) => !!s && (!from || s >= from) && (!to || s <= to);
export const monthStart = (y, m) => toISODate(new Date(y, m, 1));
export const monthEnd = (y, m) => toISODate(new Date(y, m + 1, 0));

export function fmtDate(s, opts = {}) {
  if (!s) return '—';
  return parseDate(s).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...opts });
}
export const fmtDay = (s) => fmtDate(s, { weekday: 'short' });
export const monthLabel = (y, m) => new Date(y, m, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
export const monthShort = (s) => (s ? parseDate(s).toLocaleDateString(LOCALE, { month: 'short' }) : '');

export function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function relDue(s) {
  if (!s) return 'Tiada tarikh';
  const d = daysBetween(today(), s);
  if (d === 0) return 'Hari ini';
  if (d === 1) return 'Esok';
  if (d === -1) return 'Semalam';
  if (d < 0) return `Lewat ${-d} hari`;
  if (d < 7) return `Dalam ${d} hari`;
  return fmtDate(s);
}

export function tsIso(ts) {
  if (!ts) return '';
  if (typeof ts === 'string') return ts;
  if (ts.toDate) return ts.toDate().toISOString();
  return '';
}
