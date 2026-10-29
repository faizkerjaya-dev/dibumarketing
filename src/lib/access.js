// Akses halaman ikut role. Admin boleh ubah dalam Tetapan › Akses role (disimpan dalam settings/config.roleAccess).
//
// PENTING: ini mengawal MENU dan HALAMAN yang boleh dibuka. Perlindungan DATA tetap dalam firestore.rules
// (contohnya Content Creator hanya boleh baca content yang dia terlibat, walaupun Admin beri akses halaman lain).
// Butang tindakan (edit, luluskan, padam) pula dikawal oleh src/lib/permissions.js.

export const PAGES = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { key: 'mytasks', label: 'Hari ini / Tugasan saya', path: '/my-tasks' },
  { key: 'calendar', label: 'Kalendar', path: '/calendar' },
  { key: 'pipeline', label: 'Papan kerja', path: '/pipeline' },
  { key: 'approvals', label: 'Kelulusan', path: '/approvals' },
  { key: 'team', label: 'Pasukan', path: '/team' },
  { key: 'creators', label: 'Creator', path: '/creators' },
  { key: 'campaigns', label: 'Kempen', path: '/campaigns' },
  { key: 'deliverables', label: 'Deliverable', path: '/deliverables' },
  { key: 'library', label: 'Pustaka link', path: '/library' },
  { key: 'kpi', label: 'KPI', path: '/kpi' },
  { key: 'report_content', label: 'Laporan › Content', path: '/analytics?tab=content', report: 'content' },
  { key: 'report_followers', label: 'Laporan › Pengikut & trend', path: '/analytics?tab=followers', report: 'followers' },
  { key: 'report_engagement', label: 'Laporan › Analisa content', path: '/analytics?tab=engagement', report: 'engagement' },
  { key: 'report_campaigns', label: 'Laporan › Kempen', path: '/analytics?tab=campaigns', report: 'campaigns' },
  { key: 'report_creators', label: 'Laporan › Creator', path: '/analytics?tab=creators', report: 'creators' },
  { key: 'report_staff', label: 'Laporan › Staf', path: '/analytics?tab=staff', report: 'staff' },
  { key: 'settings', label: 'Tetapan › Semakan sistem', path: '/settings' },
];
export const REPORT_PAGES = PAGES.filter((p) => p.report);

const ALL = PAGES.map((p) => p.key);
const REPORTS = REPORT_PAGES.map((p) => p.key);

// Role yang boleh diubah. Admin sentiasa ada semua akses dan tidak disenaraikan di sini.
export const EDITABLE_ROLES = ['marketing_manager', 'content_manager', 'creator_manager', 'content_creator', 'viewer'];

export const DEFAULT_ROLE_ACCESS = {
  marketing_manager: ALL,
  content_manager: ['dashboard', 'mytasks', 'calendar', 'pipeline', 'team', 'campaigns', 'library', 'kpi', 'report_content', 'report_followers', 'report_engagement'],
  creator_manager: ['dashboard', 'mytasks', 'calendar', 'creators', 'campaigns', 'deliverables', 'library', 'kpi', 'report_campaigns', 'report_creators'],
  content_creator: ['mytasks', 'calendar', 'library'],
  viewer: ['dashboard', 'calendar', 'campaigns', 'kpi', ...REPORTS],
};

// Halaman yang tidak boleh dibuka langsung oleh role tertentu kerana firestore.rules menyekat datanya.
// Kotak ini dimatikan dalam Tetapan supaya Admin tidak beri akses yang akan berakhir dengan "Akses ditolak".
export const BLOCKED = {
  content_creator: ['dashboard', 'pipeline', 'approvals', 'team', 'creators', 'campaigns', 'deliverables', 'kpi', ...REPORTS, 'settings'],
};

export function roleAccess(config, role) {
  const saved = config?.roleAccess?.[role];
  const list = Array.isArray(saved) ? saved : DEFAULT_ROLE_ACCESS[role] || [];
  const blocked = BLOCKED[role] || [];
  return list.filter((k) => !blocked.includes(k));
}

// Gabungan akses semua role pengguna. Admin = semua.
export function allowedPages(profile, config) {
  const roles = profile?.roles || [];
  if (roles.includes('admin')) return new Set(ALL);
  const set = new Set();
  roles.forEach((r) => roleAccess(config, r).forEach((k) => set.add(k)));
  return set;
}

export const pageAllowed = (profile, config, key) => allowedPages(profile, config).has(key);

// Halaman pertama yang dibenarkan, untuk laluan utama "/".
export function homePath(profile, config) {
  const set = allowedPages(profile, config);
  if (set.has('mytasks') && !set.has('dashboard')) return '/my-tasks';
  const first = PAGES.find((p) => set.has(p.key) && !(p.key === 'mytasks' && !profile?.staffId));
  return first ? first.path.split('?')[0] : '/notifications';
}
