// Rangka aplikasi: sidebar (desktop), bar atas + drawer (mobile), carian global, notifikasi dan menu Create.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, Columns3, Users, Star, Megaphone, Link2, BarChart3, Settings, ListChecks,
  PackageCheck, Bell, Plus, Menu, X, LogOut, ChevronsLeft, ChevronsRight, BadgeCheck, Target,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { can, isCreatorOnly } from '../lib/permissions';
import { ROLES } from '../lib/constants';
import { stageOf } from '../lib/statuses';
import { fmtDateTime } from '../lib/dates';
import { useNotifications } from '../hooks/useNotifications';
import { Avatar, SearchInput } from './ui';

function navItems(profile, pendingApprovals) {
  if (isCreatorOnly(profile)) {
    return [
      { to: '/my-tasks', label: 'Hari ini', icon: ListChecks },
      { to: '/calendar', label: 'Kalendar saya', icon: CalendarDays },
    ];
  }
  const items = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/calendar', label: 'Kalendar', icon: CalendarDays },
    { to: '/pipeline', label: 'Papan kerja', icon: Columns3 },
    { to: '/approvals', label: 'Kelulusan', icon: BadgeCheck, badge: pendingApprovals },
    { to: '/team', label: 'Pasukan', icon: Users },
    { to: '/creators', label: 'Creator', icon: Star },
    { to: '/campaigns', label: 'Kempen', icon: Megaphone },
    { to: '/deliverables', label: 'Deliverable', icon: PackageCheck },
    { to: '/library', label: 'Pustaka link', icon: Link2 },
    { to: '/kpi', label: 'KPI', icon: Target },
    { to: '/analytics', label: 'Laporan', icon: BarChart3 },
  ];
  if (profile?.staffId) items.splice(1, 0, { to: '/my-tasks', label: 'Tugasan saya', icon: ListChecks });
  items.push({ to: '/settings', label: 'Tetapan', icon: Settings });
  return items;
}

function CreateMenu({ profile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const items = [
    can(profile, 'content.create') && ['Content baharu', '/calendar?add=1'],
    can(profile, 'library.add') && ['Link ke pustaka', '/library?add=1'],
    can(profile, 'campaign.manage') && ['Kempen baharu', '/campaigns/new'],
    can(profile, 'creator.manage') && ['Creator baharu', '/creators/new'],
    can(profile, 'task.assign') && ['Tugasan staf', '/team?newTask=1'],
    can(profile, 'campaign.creators') && ['Tugaskan creator', '/deliverables?assign=1'],
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
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const m = (x) => x && String(x).toLowerCase().includes(s);
    return [
      ...content.filter((c) => m(c.title) || m(c.code)).slice(0, 6).map((c) => ({ key: `c${c.id}`, label: c.title, type: `Content · ${c.code}`, to: `/content/${c.id}` })),
      ...campaigns.filter((c) => m(c.name) || m(c.code)).slice(0, 4).map((c) => ({ key: `p${c.id}`, label: c.name, type: 'Kempen', to: `/campaigns/${c.id}` })),
      ...creators.filter((c) => m(c.name) || m(c.displayName)).slice(0, 4).map((c) => ({ key: `r${c.id}`, label: c.name, type: 'Creator', to: `/creators/${c.id}` })),
      ...staff.filter((c) => m(c.name)).slice(0, 4).map((c) => ({ key: `s${c.id}`, label: c.name, type: 'Staf', to: `/team/${c.id}` })),
    ];
  }, [q, content, campaigns, creators, staff]);
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
  const pendingApprovals = useMemo(() => content.filter((c) => !c.archived && !c.isSlot && stageOf(config, c.status) === 'review').length, [content, config]);
  const items = navItems(profile, can(profile, 'content.approve') ? pendingApprovals : 0);
  const creatorOnly = isCreatorOnly(profile);
  const dataErrors = Object.entries(errors).filter(([, e]) => e);

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
        {items.map(({ to, label, icon: Icon, badge }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title={badge ? `${label} (${badge})` : label}>
            <Icon size={18} /><span className="nav-label">{label}</span>
            {badge > 0 && <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
          </NavLink>
        ))}
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
        {dataErrors.length > 0 && (
          <div className="data-warning">
            Sebahagian data gagal dimuatkan ({dataErrors.map(([n, e]) => `${n}: ${e.code || e.message}`).join(', ')}). {can(profile, 'view.all') ? <Link to="/settings">Semak Tetapan › Semakan sistem</Link> : 'Hubungi Admin.'}
          </div>
        )}
        <main className="content-area"><Outlet /></main>
      </div>
    </div>
  );
}
