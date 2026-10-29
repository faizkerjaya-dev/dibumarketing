// Kiraan KPI. Semua angka dari rekod sebenar dalam bulan dipilih.
// Sasaran disimpan dalam koleksi kpiTargets, satu dokumen setiap bulan (ID: 'YYYY-MM').
import { stageOf } from './statuses';
import { inRange, parseDate, today, toISODate } from './dates';
import { latestByTarget, engagement } from './metrics';

export const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
export const monthRange = (key) => {
  const [y, m] = key.split('-').map(Number);
  return { from: toISODate(new Date(y, m - 1, 1)), to: toISODate(new Date(y, m, 0)), y, m: m - 1 };
};
export const shiftMonth = (key, n) => { const { y, m } = monthRange(key); return monthKey(new Date(y, m + n, 1).getFullYear(), new Date(y, m + n, 1).getMonth()); };

export const OVERALL_FIELDS = [
  { key: 'published', label: 'Content terbit', unit: '', kind: 'count', hint: 'Content yang terbit dalam bulan ini' },
  { key: 'views', label: 'Jumlah tontonan', unit: '', kind: 'count', hint: 'Angka terkini content yang terbit bulan ini' },
  { key: 'engagementRate', label: 'Kadar engagement', unit: '%', kind: 'rate', hint: '(suka + komen + kongsi + simpan) ÷ tontonan' },
  { key: 'fypRate', label: 'Kadar FYP', unit: '%', kind: 'rate', hint: 'Daripada content terbit yang sudah disemak' },
  { key: 'followerGrowth', label: 'Pengikut baharu', unit: '', kind: 'count', hint: 'Pertambahan pengikut semua akaun' },
  { key: 'onTimePct', label: 'Tugasan siap tepat masa', unit: '%', kind: 'rate', hint: 'Tugasan berdeadline bulan ini' },
];
export const STAFF_FIELDS = [
  { key: 'published', label: 'Content terbit', unit: '', kind: 'count' },
  { key: 'onTimePct', label: 'Siap tepat masa', unit: '%', kind: 'rate' },
];

// Kadar masa yang sudah berlalu dalam bulan (0..1). Bulan lepas = 1, bulan depan = 0.
export function monthPace(key) {
  const { from, to } = monthRange(key);
  const t = today();
  if (t > to) return 1;
  if (t < from) return 0;
  const days = parseDate(to).getDate();
  return parseDate(t).getDate() / days;
}

// Status pencapaian. Sasaran jenis "count" dibandingkan dengan kadar masa berlalu,
// supaya pertengahan bulan tidak nampak "gagal" hanya kerana bulan belum habis.
export function kpiStatus(actual, target, kind, pace) {
  if (target == null || target === '' || Number(target) <= 0 || actual == null) return { key: 'none', label: 'Tiada sasaran', tone: 'gray', ratio: null };
  const ratio = actual / Number(target);
  if (ratio >= 1) return { key: 'hit', label: 'Capai sasaran', tone: 'green', ratio };
  const expect = kind === 'count' ? Math.max(pace, 0.05) : 1;
  if (ratio >= expect * 0.95) return { key: 'track', label: 'Ikut landasan', tone: 'blue', ratio };
  if (ratio >= expect * 0.7) return { key: 'near', label: 'Perlu dikejar', tone: 'amber', ratio };
  return { key: 'behind', label: 'Jauh di belakang', tone: 'red', ratio };
}

const rate = (a, b) => (b ? (a / b) * 100 : null);

function contentStats(list, latest, config) {
  const published = list.filter((c) => stageOf(config, c.status) === 'published');
  const ms = published.map((c) => latest[c.id]).filter(Boolean);
  const views = ms.reduce((n, m) => n + (Number(m.views) || 0), 0);
  const eng = ms.reduce((n, m) => n + engagement(m), 0);
  const reviewed = published.filter((c) => c.review?.outcome);
  return {
    planned: list.length,
    published: published.length,
    views: ms.length ? views : null,
    engagementRate: views ? (eng / views) * 100 : null,
    fypRate: reviewed.length ? rate(reviewed.filter((c) => c.review.outcome === 'fyp').length, reviewed.length) : null,
    reviewed: reviewed.length,
    withData: ms.length,
  };
}

function taskStats(list) {
  const t = today();
  const done = list.filter((x) => x.status === 'done');
  const onTime = done.filter((x) => x.completedAt && x.deadline && x.completedAt <= x.deadline);
  return {
    assigned: list.length,
    done: done.length,
    overdue: list.filter((x) => x.status !== 'done' && x.deadline && x.deadline < t).length,
    onTimePct: done.length ? rate(onTime.length, done.length) : null,
  };
}

// Pertambahan pengikut: nilai terakhir dalam bulan − nilai terakhir sebelum bulan bermula
// (atau nilai pertama dalam bulan jika tiada rekod sebelumnya), dijumlah bagi setiap akaun.
export function followerGrowth(stats, from, to) {
  const byAcc = {};
  stats.forEach((s) => { const k = `${s.platform}|${s.account || ''}`; (byAcc[k] = byAcc[k] || []).push(s); });
  let total = 0; let any = false;
  Object.values(byAcc).forEach((rows) => {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const inside = sorted.filter((r) => inRange(r.date, from, to));
    if (!inside.length) return;
    const before = sorted.filter((r) => r.date < from).pop();
    const base = before || inside[0];
    total += (Number(inside[inside.length - 1].followers) || 0) - (Number(base.followers) || 0);
    any = true;
  });
  return any ? total : null;
}

export function computeKpi({ key, content, tasks, staff, metrics, accountStats, config }) {
  const { from, to } = monthRange(key);
  const latest = latestByTarget(metrics);
  const monthContent = content.filter((c) => !c.isSlot && !c.archived && inRange((stageOf(config, c.status) === 'published' && c.publishedDate) || c.publishDate, from, to));
  const monthTasks = tasks.filter((t) => inRange(t.deadline, from, to));
  const overall = {
    ...contentStats(monthContent, latest, config),
    ...taskStats(monthTasks),
    followerGrowth: followerGrowth(accountStats, from, to),
  };
  const perStaff = staff.filter((s) => s.status !== 'inactive').map((s) => {
    const own = monthContent.filter((c) => c.ownerStaffId === s.id);
    const mine = monthTasks.filter((t) => t.staffId === s.id);
    return { staff: s, ...contentStats(own, latest, config), ...taskStats(mine) };
  });
  return { from, to, overall, perStaff };
}

// Sasaran seorang staf: sasaran khusus jika ada, jika tidak guna sasaran lalai.
export const staffTarget = (targets, staffId, field) => {
  const own = targets?.staff?.[staffId]?.[field];
  if (own !== undefined && own !== null && own !== '') return Number(own);
  const def = targets?.staffDefault?.[field];
  return def !== undefined && def !== null && def !== '' ? Number(def) : null;
};

export const fmtKpi = (v, unit) => {
  if (v == null) return '—';
  if (unit === '%') return `${Number(v).toFixed(1)}%`;
  return Number(v).toLocaleString('ms-MY', { maximumFractionDigits: 0 });
};
