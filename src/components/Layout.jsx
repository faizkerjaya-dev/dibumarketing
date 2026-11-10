// Rangka aplikasi: sidebar (desktop), bar atas + drawer (mobile), carian global, notifikasi dan menu Create.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { usePersistentState } from '../hooks/usePersistentState';
import {
  LayoutDashboard, CalendarDays, Columns3, Users, Star, Megaphone, Link2, BarChart3, Settings, ListChecks,
  PackageCheck, Bell, Plus, Menu, X, LogOut, ChevronsLeft, ChevronsRight, ChevronDown, BadgeCheck, Target, TrendingUp, Gauge, Send, ClipboardList,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { can, isCreatorOnly } from '../lib/permissions';
import { ROLES } from '../lib/constants';
import { postsOf, postState } from '../lib/social';
import { stageOf, isArchived } from '../lib/statuses';
import { allowedPages, REPORT_PAGES } from '../lib/access';
import { fmtDateTime, today, addDays } from '../lib/dates';
import { useNotifications } from '../hooks/useNotifications';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Avatar, SearchInput } from './ui';

// Menu sisi ikut akses halaman (Tetapan › Akses role). Laporan muncul jika mana-mana tab laporan dibenarkan.
// Kumpulan menu sisi. Kumpulan boleh disembunyikan (diingat dalam pelayar);
// kumpulan halaman semasa sentiasa terbuka.
const NAV_GROUPS = [
  { key: 'home', label: '' },
  { key: 'content', label: 'Content' },
  { key: 'team', label: 'Pasukan & kempen' },
  { key: 'report', label: 'Laporan & KPI' },
  { key: 'system', label: '', bottom: true },
];

function navItems(profile, config, pendingApprovals, postsDue = 0) {
  const ok = allowedPages(profile, config);
  const creatorOnly = isCreatorOnly(profile);
  const items = [
    ok.has('control') && { group: 'home', to: '/control', label: 'Pusat kawalan', icon: Gauge },
    ok.has('dashboard') && { group: 'home', to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ok.has('mytasks') && (profile?.staffId || creatorOnly) && { group: 'home', to: '/my-tasks', label: creatorOnly ? 'Hari ini' : 'Tugasan saya', icon: ListChecks },
    ok.has('calendar') && { group: 'content', to: '/calendar', label: creatorOnly ? 'Kalendar saya' : 'Kalendar', icon: CalendarDays },
    ok.has('posting') && { group: 'content', to: '/posting', label: 'Jadual pos', icon: Send, badge: postsDue },
    ok.has('pipeline') && { group: 'content', to: '/pipeline', label: 'Papan kerja', icon: Columns3 },
    ok.has('approvals') && { group: 'content', to: '/approvals', label: 'Kelulusan', icon: BadgeCheck, badge: pendingApprovals },
    ok.has('team') && { group: 'team', to: '/team', label: 'Pasukan', icon: Users },
    ok.has('creators') && { group: 'team', to: '/creators', label: 'Creator', icon: Star },
    ok.has('campaigns') && { group: 'team', to: '/campaigns', label: 'Kempen', icon: Megaphone },
    ok.has('deliverables') && { group: 'team', to: '/deliverables', label: 'Deliverable', icon: PackageCheck },
    ok.has('library') && { group: 'content', to: '/library', label: 'Pustaka link', icon: Link2 },
    ok.has('kpi') && { group: 'report', to: '/kpi', label: 'KPI', icon: Target },
    ok.has('performance') && { group: 'report', to: '/performance', label: 'Prestasi content', icon: TrendingUp },
    ok.has('report_monthly') && { group: 'report', to: '/monthly', label: 'Laporan bulanan', icon: ClipboardList },
    REPORT_PAGES.some((r) => ok.has(r.key)) && { group: 'report', to: '/analytics', label: 'Laporan', icon: BarChart3 },
    ok.has('settings') && { group: 'system', to: '/settings', label: 'Tetapan', icon: Settings },
  ];
  return items.filter(Boolean);
}

function CreateMenu({ profile }) {
  const config = useConfig();
  const ok = allowedPages(profile, config);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const items = [
    can(profile, 'content.create') && ok.has('calendar') && ['Content baharu', '/calendar?add=1'],
    can(profile, 'content.create') && ok.has('calendar') && ['Import pelan Excel', '/import'],
    can(profile, 'library.add') && ok.has('library') && ['Link ke pustaka', '/library?add=1'],
    can(profile, 'campaign.manage') && ok.has('campaigns') && ['Kempen baharu', '/campaigns/new'],
    can(profile, 'creator.manage') && ok.has('creators') && ['Creator baharu', '/creators/new'],
    can(profile, 'task.assign') && ok.has('team') && ['Tugasan staf', '/team?newTask=1'],
    can(profile, 'campaign.creators') && ok.has('deliverables') && ['Tugaskan creator', '/deliverables?assign=1'],
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn btn-primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Plus size={16} /><span className="hide-sm">Tambah</span></button>
      {open && (
        <div className="menu menu-right">
          {items.map(([label, to]) => <button key={to} type="button" className="menu-item" onClick={() => { setOpen(false); navigate(to); }}>{label}</button>)}
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const { content, campaigns, creators, staff } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const ok = allowedPages(profile, config);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const m = (x) => x && String(x).toLowerCase().includes(s);
    return [
      ...content.filter((c) => m(c.title) || m(c.code)).slice(0, 6).map((c) => ({ key: `c${c.id}`, label: c.title, type: `Content · ${c.code}`, to: `/content/${c.id}` })),
      ...(ok.has('campaigns') ? campaigns : []).filter((c) => m(c.name) || m(c.code)).slice(0, 4).map((c) => ({ key: `p${c.id}`, label: c.name, type: 'Kempen', to: `/campaigns/${c.id}` })),
      ...(ok.has('creators') ? creators : []).filter((c) => m(c.name) || m(c.displayName)).slice(0, 4).map((c) => ({ key: `r${c.id}`, label: c.name, type: 'Creator', to: `/creators/${c.id}` })),
      ...(ok.has('team') ? staff : []).filter((c) => m(c.name)).slice(0, 4).map((c) => ({ key: `s${c.id}`, label: c.name, type: 'Staf', to: `/team/${c.id}` })),
    ];
  }, [q, content, campaigns, creators, staff, ok.size]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="menu-wrap global-search" onBlur={() => setTimeout(() => setOpen(false), 150)}>
      <SearchInput value={q} onChange={(v) => { setQ(v); setOpen(true); }} placeholder="Cari content, kempen, creator, staf" />
      {open && q.trim().length >= 2 && (
        <div className="menu menu-wide">
          {results.length ? results.map((r) => (
            <button key={r.key} type="button" className="menu-item" onMouseDown={() => { navigate(r.to); setQ(''); setOpen(false); }}>
              <span className="grow">{r.label}</span><span className="muted small">{r.type}</span>
            </button>
          )) : <div className="menu-empty">Tiada hasil</div>}
        </div>
      )}
    </div>
  );
}

function NotificationBell({ n: notif }) {
  const { items, unread, markRead, markAllRead } = notif;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="icon-btn bordered" aria-label={`Notifikasi, ${unread} belum dibaca`} onClick={() => setOpen((o) => !o)}>
        <Bell size={18} />{unread > 0 && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="menu menu-right menu-wide">
          <div className="menu-head"><strong>Notifikasi</strong>{unread > 0 && <button type="button" className="link-btn" onClick={markAllRead}>Tanda semua dibaca</button>}</div>
          {items.slice(0, 8).map((n) => (
            <button key={n.id} type="button" className={`menu-item notif${n.read ? '' : ' unread'}`} onClick={() => { markRead(n.id); setOpen(false); if (n.link) navigate(n.link); }}>
              <span className="grow"><strong>{n.title}</strong>{n.body && <span className="muted small block">{n.body}</span>}</span>
              <span className="muted small">{fmtDateTime(n.createdAtIso)}</span>
            </button>
          ))}
          {!items.length && <div className="menu-empty">Tiada notifikasi</div>}
          <Link to="/notifications" className="menu-foot" onClick={() => setOpen(false)}>Lihat semua</Link>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { profile, logout } = useAuth();
  const config = useConfig();
  const { errors, content } = useData();
  const notif = useNotifications();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('dibu_sidebar') === 'collapsed'; } catch { return false; }
  });
  const location = useLocation();
  const [closedGroups, setClosedGroups] = usePersistentState('nav_closed', []);
  const toggleGroup = (k) => setClosedGroups((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  // Lencana Kelulusan: video menunggu + idea yang dijadual dalam 14 hari akan datang (perlu lulus segera).
  const pendingApprovals = useMemo(() => {
    const soon = addDays(today(), 14);
    return content.filter((c) => {
      if (c.archived || c.isSlot) return false;
      const st = stageOf(config, c.status);
      return st === 'review' || (st === 'idea' && (c.publishDate || c.shootDate) && (c.shootDate || c.publishDate) <= soon);
    }).length;
  }, [content, config]);
  // Lencana Jadual pos: pos hari ini yang sedia tetapi belum dipos.
  const postsDue = useMemo(() => {
    if (!can(profile, 'content.post')) return 0;
    const t0 = today();
    return content.filter((c) => !c.archived && !isArchived(config, c.status))
      .flatMap((c) => postsOf(config, c))
      .filter((p) => (p.date === t0 && postState(config, p) === 'ready') || (p.posted && !p.url && !p.content.isSlot && p.date <= t0 && p.date >= addDays(t0, -30))).length;
  }, [content, config, profile]);
  const items = navItems(profile, config, can(profile, 'content.approve') ? pendingApprovals : 0, postsDue);
  const creatorOnly = isCreatorOnly(profile);
  const dataErrors = Object.entries(errors).filter(([, e]) => e);
  const denied = dataErrors.some(([, e]) => e?.code === 'permission-denied');
  // Semak sama ada Firestore rules terkini sudah dipublish (lihat meta/rules-v37 dalam firestore.rules).
  const [rulesOld, setRulesOld] = useState(false);
  useEffect(() => {
    getDoc(doc(db, 'meta', 'rules-v37')).then(() => setRulesOld(false)).catch((e) => setRulesOld(e?.code === 'permission-denied'));
  }, []);

  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    try { localStorage.setItem('dibu_sidebar', collapsed ? 'collapsed' : 'open'); } catch { /* mod privasi: abaikan */ }
  }, [collapsed]);

  const sidebar = (
    <>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">{(config.brandName || 'D').trim().charAt(0).toUpperCase()}</span>
        <span className="brand-text">
          <span className="brand-name">{config.brandName}</span>
          <span className="brand-sub">Ruang kerja content</span>
        </span>
      </div>
      <nav aria-label="Menu utama" className="nav">
        {NAV_GROUPS.map((g) => {
          const list = items.filter((x) => x.group === g.key);
          if (!list.length) return null;
          const active = list.some((x) => location.pathname === x.to || location.pathname.startsWith(`${x.to}/`));
          const open = !g.label || active || !closedGroups.includes(g.key);
          const badgeSum = list.reduce((n, x) => n + (x.badge || 0), 0);
          return (
            <div key={g.key} className={`nav-group${g.bottom ? ' nav-group-bottom' : ''}`}>
              {g.label && (
                <button type="button" className="nav-group-head" aria-expanded={open} onClick={() => toggleGroup(g.key)} disabled={active} title={active ? 'Halaman semasa dalam kumpulan ini' : open ? 'Sembunyikan' : 'Tunjuk'}>
                  <span className="nav-label">{g.label}</span>
                  {!open && badgeSum > 0 && <span className="nav-badge sm">{badgeSum}</span>}
                  <ChevronDown size={14} className={`nav-group-caret${open ? '' : ' closed'}`} />
                </button>
              )}
              {open && list.map(({ to, label, icon: Icon, badge }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title={badge ? `${label} (${badge})` : label}>
                  <Icon size={18} /><span className="nav-label">{label}</span>
                  {badge > 0 && <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="side-user">
        <Avatar name={profile?.name || profile?.email} size={34} />
        <div className="min0 nav-label">
          <div className="side-user-name">{profile?.name || profile?.email}</div>
          <div className="side-user-role">{profile?.roles?.map((r) => ROLES[r] || r).join(', ')}</div>
        </div>
        <button type="button" className="icon-btn side-logout" aria-label="Log keluar" title="Log keluar" onClick={logout}><LogOut size={16} /></button>
      </div>
    </>
  );

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        {sidebar}
        <button type="button" className="collapse-btn" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Kembangkan menu' : 'Kecilkan menu'} title={collapsed ? 'Kembangkan menu' : 'Kecilkan menu'}>
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </aside>
      {drawer && (
        <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <aside className="drawer">
            <button type="button" className="icon-btn drawer-close" aria-label="Tutup menu" onClick={() => setDrawer(false)}><X size={20} /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="main-col">
        <div className="mobilebar">
          <button type="button" className="icon-btn" aria-label="Buka menu" onClick={() => setDrawer(true)}><Menu size={22} /></button>
          <span className="grow brand-name">{config.brandName}</span>
          <NotificationBell n={notif} />
        </div>
        <header className={`topbar${creatorOnly ? ' only-bell' : ''}`}>
          {!creatorOnly && <GlobalSearch />}
          <div className="grow" />
          <div className="hide-mobile"><NotificationBell n={notif} /></div>
          {!creatorOnly && <CreateMenu profile={profile} />}
        </header>
        {(rulesOld || denied) && (
          <div className="data-warning">
            <strong>Akses data ditolak oleh Firestore rules.</strong>{' '}
            {rulesOld ? 'Rules dalam Firebase masih versi lama, jadi role baharu (contoh Social Media Manager) tidak dapat membaca data.' : 'Akaun ini tiada kebenaran untuk sebahagian data.'}{' '}
            {profile?.roles?.includes('admin')
              ? <>Admin: buka <a href="https://console.firebase.google.com/project/dibu-marketing/firestore/rules" target="_blank" rel="noreferrer">Firebase › Firestore › Rules</a>, tampal fail <a href="https://raw.githubusercontent.com/faizkerjaya-dev/dibumarketing/main/firestore.rules" target="_blank" rel="noreferrer">firestore.rules terkini</a>, tekan Publish, kemudian refresh.</>
              : 'Minta Admin publish semula Firestore rules terkini, kemudian refresh.'}
          </div>
        )}
        {dataErrors.length > 0 && !denied && (
          <div className="data-warning">
            Sebahagian data gagal dimuatkan ({dataErrors.map(([n, e]) => `${n}: ${e.code || e.message}`).join(', ')}). {can(profile, 'view.all') ? <Link to="/settings">Semak Tetapan › Semakan sistem</Link> : 'Hubungi Admin.'}
          </div>
        )}
        <main className="content-area"><Outlet /></main>
      </div>
    </div>
  );
}
