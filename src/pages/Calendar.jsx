// Kalendar content.
//   Bulan   : setiap hari papar JUMLAH content dan jalur warna sahaja. Klik hari → popup senarai penuh.
//   Minggu  : senarai kad bagi setiap hari (lebih ruang, untuk semakan terperinci).
//   Senarai : jadual sebulan.
// Warna boleh ditukar: ikut status, jenis content atau pemilik content.
// Cara menambah: klik hari → taip tajuk dalam popup; Rancang sebulan (slot); Bank idea (seret ke tarikh).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, CalendarRange, ListChecks, GripVertical, FileSpreadsheet } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { can, isCreatorOnly, hasRole } from '../lib/permissions';
import { updateById, logActivity, quickAddContent, addIdea, scheduleIdea } from '../lib/db';
import { findStatus, statusForStage, isArchived, statusList } from '../lib/statuses';
import { platformShort } from '../lib/constants';
import { typeColor, TONE_FILL, OTHER, PALETTE } from '../lib/colors';
import { today, toISODate, addDays, startOfWeek, monthLabel, fmtDate, parseDate } from '../lib/dates';
import { PageHeader, Button, Segmented, Loading, Empty, useConfirm, IconButton, Card, Pill, Avatar } from '../components/ui';
import { ContentStatusPill } from '../components/pills';
import ContentFilters, { EMPTY_FILTERS, applyFilters } from '../components/ContentFilters';
import BriefDrawer, { readLast } from '../components/BriefDrawer';
import { QuickPlanModal, BulkFillModal } from '../components/SlotPlanModal';
import DayModal, { colorFor } from '../components/DayModal';
import { ProgressDots } from '../components/Progress';
import { progressOf } from '../lib/progress';
import { expandCrossPosts, accountsOf, accountColor, accountLabel, rescheduleFields, platformOfItem, platformOrder, platformStyle } from '../lib/social';
import PlatformBadge from '../components/PlatformBadge';
import { stageOf } from '../lib/statuses';
import { usePersistentState } from '../hooks/usePersistentState';

const WEEKDAYS = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Ahd'];
const MODE_KEY = 'dibu_cal_color';
const DATE_KEY = 'dibu_cal_date';

export default function CalendarPage() {
  const { content, staff, staffById, staffColor, ready } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const { run } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [confirm, confirmEl] = useConfirm();

  const [view, setView] = usePersistentState('cal_view', 'month');
  const [platTab, setPlatTab] = usePersistentState('cal_platform', '');
  // Social Media Manager: lalai ikut tarikh POS dan warna ikut AKAUN (jika belum pernah dipilih).
  const smm = hasRole(profile, 'social_media_manager');
  const [mode, setMode] = useState(() => { try { return localStorage.getItem(MODE_KEY) || (smm ? 'account' : 'status'); } catch { return 'status'; } });
  // Kalendar boleh disusun ikut tarikh POS (lalai) atau tarikh SHOOT.
  // Lalai: ikut tarikh SHOOT (pilihan diingat dalam browser).
  const [dk, setDk] = useState(() => { try { return localStorage.getItem(DATE_KEY) || (smm ? 'publishDate' : 'shootDate'); } catch { return 'shootDate'; } });
  const isShoot = dk === 'shootDate';
  useEffect(() => { try { localStorage.setItem(DATE_KEY, dk); } catch { /* abaikan */ } }, [dk]);
  const [anchor, setAnchor] = useState(today());
  const [filters, setFilters] = usePersistentState('cal_filters', EMPTY_FILTERS);
  const [openDay, setOpenDay] = useState(null);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState(null);
  const [dropDay, setDropDay] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [ideaText, setIdeaText] = useState('');

  const canEdit = can(profile, 'content.edit');
  const canCreate = can(profile, 'content.create');
  const creatorOnly = isCreatorOnly(profile);
  const ctx = { config, staffById, staffColor };

  useEffect(() => { try { localStorage.setItem(MODE_KEY, mode); } catch { /* abaikan */ } }, [mode]);

  // ?add=1 (dari menu Tambah) buka panel content baharu. ?campaign=ID pra-pilih kempen.
  useEffect(() => {
    if (!params.get('add')) return;
    setDrawer({ preset: { date: today(), campaignId: params.get('campaign') || '' } });
    setParams({}, { replace: true });
  }, [params, setParams]);

  const live = useMemo(() => content.filter((c) => !c.archived && !isArchived(config, c.status)), [content, config]);
  // Mod Pos: setiap pos silang (IG, FB, Threads…) dipaparkan sebagai item sendiri pada tarikhnya.
  const allItems = useMemo(() => applyFilters(isShoot ? live : expandCrossPosts(config, live), filters), [live, filters, isShoot, config]);
  // Tab platform: tunjuk satu platform sahaja (TikTok, Instagram…).
  const items = useMemo(() => (platTab ? allItems.filter((c) => platformOfItem(config, c) === platTab) : allItems), [allItems, platTab, config]);
  const byDay = useMemo(() => {
    const m = {};
    items.forEach((c) => { const d = isShoot ? c.shootDate || c.publishDate : c[dk]; if (d) (m[d] = m[d] || []).push(c); });
    Object.values(m).forEach((l) => l.sort((a, b) => Number(a.isSlot) - Number(b.isSlot) || (a.publishTime || '99').localeCompare(b.publishTime || '99')));
    return m;
  }, [items, dk, isShoot]);
  // Content yang perlu DIPOS setiap hari (untuk paparan dalam mod Shoot).
  const postByDay = useMemo(() => {
    const m = {};
    items.forEach((c) => { if (c.publishDate && !c.isSlot) (m[c.publishDate] = m[c.publishDate] || []).push(c); });
    Object.values(m).forEach((l) => l.sort((a, b) => (a.publishTime || '99').localeCompare(b.publishTime || '99') || (a.code || '').localeCompare(b.code || '')));
    return m;
  }, [items]);
  const ideas = useMemo(() => items.filter((c) => !c.publishDate && c._cross == null).sort((a, b) => (b.code || '').localeCompare(a.code || '')), [items]);

  const a = parseDate(anchor);
  const monthFrom = toISODate(new Date(a.getFullYear(), a.getMonth(), 1));
  const monthTo = toISODate(new Date(a.getFullYear(), a.getMonth() + 1, 0));
  const monthSlots = useMemo(() => live.filter((c) => c.isSlot && c.publishDate >= monthFrom && c.publishDate <= monthTo).sort((x, y) => x.publishDate.localeCompare(y.publishDate)), [live, monthFrom, monthTo]);

  let days = [];
  let title = '';
  if (view === 'week' || view === 'lanes') {
    const s = startOfWeek(anchor);
    days = Array.from({ length: 7 }, (_, i) => addDays(s, i));
    title = `${fmtDate(days[0])} – ${fmtDate(days[6], { year: 'numeric' })}`;
  } else {
    const s = startOfWeek(monthFrom);
    const weeks = Math.ceil((parseDate(monthTo) - parseDate(s)) / 86400000 / 7 + 0.01);
    days = Array.from({ length: weeks * 7 }, (_, i) => addDays(s, i));
    title = monthLabel(a.getFullYear(), a.getMonth());
  }
  const month = a.getMonth();
  const t0 = today();

  const shift = (dir) => {
    if (view === 'week' || view === 'lanes') setAnchor(addDays(anchor, 7 * dir));
    else setAnchor(toISODate(new Date(a.getFullYear(), a.getMonth() + dir, 1)));
  };

  const quickAdd = async (t, platform, type) => {
    setSaving(true);
    const ok = await run(() => quickAddContent({
      title: t,
      platform,
      type: type || '',
      ...(isShoot ? { shootDate: openDay } : { publishDate: openDay }),
      ownerStaffId: readLast().ownerStaffId || profile.staffId || '',
      status: statusForStage(config, 'idea'),
    }, { profile, staffById }), 'Content ditambah');
    setSaving(false);
    return ok;
  };

  const drop = async (day) => {
    setDropDay(null);
    const d = drag;
    setDrag(null);
    if (!d) return;
    const c = content.find((x) => x.id === d.id);
    if (!c || (isShoot ? (c.shootDate || c.publishDate) : c[dk]) === day) return;
    if (isShoot) {
      if (c.publishDate && day > c.publishDate) { run(async () => { throw Object.assign(new Error('Tarikh shoot mesti sebelum tarikh pos.'), { code: 'validation' }); }); return; }
      await run(() => updateById('content', c.id, { shootDate: day }, profile), `Tarikh shoot ditukar ke ${fmtDate(day)}`);
      return;
    }
    if (!c.publishDate) {
      await run(() => scheduleIdea(c, day, profile), `Dijadualkan ${fmtDate(day)}`);
      return;
    }
    const ok = await confirm(`Pindah tarikh pos “${c.title || c.slotLabel}” dari ${fmtDate(c.publishDate)} ke ${fmtDate(day)}?\n\nTarikh shoot dan deadline tugasan tidak berubah.`, { title: 'Pindah tarikh pos', okLabel: 'Pindah' });
    if (!ok) return;
    await run(async () => {
      await updateById('content', c.id, { publishDate: day, ...rescheduleFields(config, c, day) }, profile);
      await logActivity(profile, { type: 'publish_date_changed', message: `${profile.name} pindah tarikh terbit “${c.title || c.slotLabel || c.code}” ke ${fmtDate(day)}`, refType: 'content', refId: c.id });
    }, 'Tarikh pos dikemas kini');
  };

  const submitIdea = async () => {
    const t = ideaText.trim();
    if (!t) return;
    const ok = await run(() => addIdea({ text: t, platform: readLast().platform || '', statusKey: statusForStage(config, 'idea') }, { profile, staffById }), 'Idea disimpan');
    if (ok) setIdeaText('');
  };

  if (!ready) return <div className="page"><Loading /></div>;

  // Legenda mengikut mod warna.
  const legend = mode === 'account'
    ? accountsOf(config).map((x) => ({ key: x.id, label: accountLabel(x), color: accountColor(config, x.id) }))
    : mode === 'owner'
    ? staff.filter((s) => s.status !== 'inactive').map((s) => ({ key: s.id, label: s.name, color: staffColor[s.id] || OTHER }))
    : mode === 'type'
      ? [...(config.contentTypes || []).map((t) => ({ key: t, label: t, color: typeColor(config, t) })), { key: '-', label: 'Belum ditetapkan', color: OTHER }]
      : statusList(config).filter((s) => s.stage !== 'archived').map((s) => ({ key: s.key, label: s.label, color: TONE_FILL[s.tone] || OTHER }));

  const dropProps = (day) => ({
    onDragOver: (e) => { if (drag) { e.preventDefault(); setDropDay(day); } },
    onDragLeave: () => setDropDay((d) => (d === day ? null : d)),
    onDrop: (e) => { e.preventDefault(); drop(day); },
  });

  // Kiraan ikut platform bagi satu senarai content (untuk sel kalendar).
  const platRows = (list, day) => {
    const order = platformOrder(config);
    const m = new Map();
    list.forEach((c) => {
      const p = platformOfItem(config, c);
      const r = m.get(p) || { platform: p, n: 0, done: 0, late: 0 };
      const ok = progressOf(config, c)[isShoot ? 'shot' : 'posted'];
      r.n += 1; if (ok) r.done += 1;
      if (!ok && (c[dk] || day) < t0) r.late += 1;
      m.set(p, r);
    });
    return [...m.values()].sort((a, b) => (order.indexOf(a.platform) + 99 * (order.indexOf(a.platform) < 0)) - (order.indexOf(b.platform) + 99 * (order.indexOf(b.platform) < 0)));
  };

  const monthCell = (day) => {
    const list = byDay[day] || [];
    const real = list.filter((c) => !c.isSlot);
    const slots = list.length - real.length;
    const out = parseDate(day).getMonth() !== month;
    return (
      <button
        key={day}
        type="button"
        className={`cal-cell cal-sum${out ? ' out' : ''}${dropDay === day ? ' drop' : ''}${list.length ? ' has' : ''}`}
        onClick={() => setOpenDay(day)}
        aria-label={`${fmtDate(day, { weekday: 'long' })}: ${real.length} ${isShoot ? 'shoot' : 'content'}${slots ? `, ${slots} slot` : ''}${isShoot && postByDay[day]?.length ? `, ${postByDay[day].length} perlu dipos` : ''}`}
        {...dropProps(day)}
      >
        <span className="cal-top">
          <span className={`cal-num${day === t0 ? ' today' : ''}`}>{parseDate(day).getDate()}</span>
          {real.length > 0 && <span className="cal-total">{real.length} {isShoot ? 'shoot' : 'pos'}</span>}
        </span>
        {real.length > 0 && (
          <span className="cal-plats">
            {platRows(real).map((r) => (
              <span key={r.platform} className="cal-plat" style={{ background: platformStyle(r.platform).tint }} title={`${r.platform}: ${r.n} ${isShoot ? 'shoot' : 'pos'}${r.done ? `, ${r.done} siap` : ''}${r.late ? `, ${r.late} lewat` : ''}`}>
                <PlatformBadge platform={r.platform} size={18} />
                <strong>{r.n}</strong>
                {r.late > 0 ? <span className="st bad">{r.late} lewat</span> : r.done > 0 ? <span className="st ok">✓ {r.done}/{r.n}</span> : null}
              </span>
            ))}
          </span>
        )}
        {isShoot && (postByDay[day] || []).length > 0 && <span className="cal-postline">{postByDay[day].length} perlu dipos</span>}
        {slots > 0 && <span className="cal-flags"><span className="cal-flag slot">{slots} slot</span></span>}
        {canCreate && !list.length && <span className="cal-hint"><Plus size={12} />Tambah</span>}
      </button>
    );
  };

  const weekCard = (c) => {
    const ownerName = staffById[c.ownerStaffId]?.name || c.ownerName;
    return (
      <button
        key={c._key || c.id}
        type="button"
        className={`week-card${c.isSlot ? ' slot' : ''}`}
        style={{ '--bar': colorFor(mode, c, ctx) }}
        draggable={canEdit && c._cross == null}
        onDragStart={() => setDrag({ id: c.id })}
        onDragEnd={() => setDrag(null)}
        onClick={() => (c.isSlot ? setDrawer({ content: c }) : navigate(`/content/${c.id}`))}
      >
        <span className="week-title">{c.isSlot ? (c.slotLabel || 'Slot kosong') : c.title}</span>
        {!c.isSlot && (
          <span className="week-meta">
            {isShoot ? c.publishDate && <span className="week-post">Pos {fmtDate(c.publishDate)}</span> : c.publishTime && <span>{c.publishTime}</span>}
            {c.platform && <span className="tag" title={c.platform}>{platformShort(c.platform)}</span>}
            <ProgressDots content={c} />
            {ownerName && <span className="row gap-xs min0"><Avatar name={ownerName} size={18} /><span className="ellipsis">{ownerName.split(' ')[0]}</span></span>}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="page">
      <PageHeader
        title={creatorOnly ? 'Kalendar saya' : 'Kalendar'}
        actions={!creatorOnly && <>
          {canCreate && <Button icon={FileSpreadsheet} onClick={() => navigate('/import')}>Import Excel</Button>}
          {canCreate && <Button icon={CalendarRange} onClick={() => setPlanOpen(true)}>Rancang sebulan</Button>}
          {canCreate && monthSlots.length > 0 && <Button icon={ListChecks} onClick={() => setBulkOpen(true)}>Isi {monthSlots.length} slot</Button>}
          {canCreate && <Button variant="primary" icon={Plus} onClick={() => setDrawer({ preset: { date: today() } })}>Tambah content</Button>}
        </>}
      >
        <p className="muted small" style={{ marginTop: 4 }}>
          {items.filter((c) => c[dk] >= monthFrom && c[dk] <= monthTo && !c.isSlot).length} {isShoot ? 'content dishoot' : 'pos (semua akaun)'} bulan ini
          {monthSlots.length > 0 && ` · ${monthSlots.length} slot belum ada tajuk`}
        </p>
      </PageHeader>

      <div className="toolbar">
        <IconButton icon={ChevronLeft} label="Sebelum" onClick={() => shift(-1)} />
        <IconButton icon={ChevronRight} label="Seterusnya" onClick={() => shift(1)} />
        <Button size="sm" onClick={() => setAnchor(today())}>Hari ini</Button>
        <h2 style={{ margin: '0 6px', fontSize: 17 }}>{title}</h2>
        <div className="grow" />
        <span className="small muted">Ikut tarikh</span>
        <Segmented value={dk} onChange={setDk} options={[{ key: 'shootDate', label: 'Shoot' }, { key: 'publishDate', label: 'Pos' }]} />
        <span className="small muted">Warna ikut</span>
        <Segmented value={mode} onChange={setMode} options={[{ key: 'status', label: 'Status' }, { key: 'type', label: 'Jenis' }, { key: 'owner', label: 'Pemilik' }, { key: 'account', label: 'Akaun' }]} />
        <Segmented value={view} onChange={setView} options={[{ key: 'month', label: 'Bulan' }, { key: 'week', label: 'Minggu' }, { key: 'lanes', label: 'Minggu ikut platform' }, { key: 'list', label: 'Senarai' }]} />
      </div>

      {!creatorOnly && <ContentFilters value={filters} onChange={setFilters} />}

      <div className="plat-tabs" role="tablist" aria-label="Platform">
        {[{ key: '', label: 'Semua platform' }, ...platformOrder(config).map((p) => ({ key: p, label: p }))].map((t) => {
          const n = allItems.filter((c) => !c.isSlot && c[dk] >= monthFrom && c[dk] <= monthTo && (!t.key || platformOfItem(config, c) === t.key)).length;
          if (t.key && !n && platTab !== t.key) return null;
          return (
            <button key={t.key || 'all'} type="button" role="tab" aria-selected={platTab === t.key} className={`plat-tab${platTab === t.key ? ' on' : ''}`} onClick={() => setPlatTab(t.key)}>
              {t.key ? <PlatformBadge platform={t.key} size={22} /> : <span className="pbadge" style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--surface-3)', color: 'var(--text-2)', fontSize: 11 }}>∑</span>}
              {t.label}<span className="n">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="split">
        <div className="main" style={{ flex: '1 1 640px' }}>
          {view === 'month' && (
            <div className="cal">
              <div className="cal-inner">
                <div className="cal-head">{WEEKDAYS.map((w) => <div key={w}>{w}</div>)}</div>
                <div className="cal-grid">{days.map(monthCell)}</div>
              </div>
            </div>
          )}

          {view === 'week' && (
            <div className="cal cal-week">
              <div className="cal-inner">
                <div className="cal-head">{days.map((d, i) => <div key={d} className={d === t0 ? 'is-today' : ''}>{WEEKDAYS[i]} {parseDate(d).getDate()}</div>)}</div>
                <div className="cal-grid">
                  {days.map((day) => {
                    const list = byDay[day] || [];
                    return (
                      <div key={day} className={`cal-cell${dropDay === day ? ' drop' : ''}`} {...dropProps(day)}>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <span className="small muted strong">{list.filter((c) => !c.isSlot).length} content</span>
                          {canCreate && <button type="button" className="cal-add" aria-label={`Tambah content pada ${fmtDate(day)}`} onClick={() => setOpenDay(day)}>+</button>}
                        </div>
                        {list.map(weekCard)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {view === 'lanes' && (() => {
            const order = platformOrder(config);
            const inWeek = days.flatMap((d) => (byDay[d] || []).filter((c) => !c.isSlot));
            const lanes = order.filter((p) => inWeek.some((c) => platformOfItem(config, c) === p));
            inWeek.forEach((c) => { const p = platformOfItem(config, c); if (!lanes.includes(p)) lanes.push(p); });
            const statusOf = (c, day) => {
              const pr = progressOf(config, c);
              if (pr[isShoot ? 'shot' : 'posted']) return { t: isShoot ? '✓ Shoot' : '✓ Dipos', cls: 'ok-text', bar: 'var(--green-fill)' };
              if (day < t0) return { t: 'Lewat', cls: 'danger-text', bar: 'var(--red-fill)' };
              const st = stageOf(config, c.status);
              if (!isShoot && st === 'ready') return { t: 'Sedia', cls: 'strong', bar: 'var(--teal-fill)' };
              if (st === 'review') return { t: 'Tunggu lulus', cls: 'warn-text', bar: 'var(--amber-fill)' };
              return { t: st === 'idea' ? 'Idea' : 'Produksi', cls: 'muted', bar: 'var(--border-2)' };
            };
            if (!lanes.length) return <Card><Empty title="Tiada content minggu ini" text="Tukar minggu atau pilih Semua platform." /></Card>;
            return (
              <div className="lanes">
                <div className="lanes-grid">
                  <span className="lh">PLATFORM</span>
                  {days.map((d, i) => <span key={d} className={`lh${d === t0 ? ' is-today' : ''}`}>{WEEKDAYS[i]} {parseDate(d).getDate()}{d === t0 ? ' · Hari ini' : ''}</span>)}
                  {lanes.map((p) => {
                    const all = inWeek.filter((c) => platformOfItem(config, c) === p);
                    const done = all.filter((c) => progressOf(config, c)[isShoot ? 'shot' : 'posted']).length;
                    return [
                      <span key={`${p}-n`} className="lane-name" style={{ background: platformStyle(p).tint }}>
                        <PlatformBadge platform={p} size={26} />
                        <span><strong>{p}</strong><small>{all.length} {isShoot ? 'shoot' : 'pos'} · {done} siap</small></span>
                      </span>,
                      ...days.map((day) => (
                        <span key={`${p}-${day}`} className={`lane-cell${day === t0 ? ' today' : ''}${dropDay === day ? ' drop' : ''}`} {...dropProps(day)}>
                          {(byDay[day] || []).filter((c) => !c.isSlot && platformOfItem(config, c) === p).map((c) => {
                            const st = statusOf(c, day);
                            const ownerName = staffById[c.ownerStaffId]?.name || c.ownerName || '';
                            return (
                              <button key={c._key || c.id} type="button" className="lane-card" style={{ '--bar': st.bar }}
                                draggable={canEdit && c._cross == null} onDragStart={() => setDrag({ id: c.id })} onDragEnd={() => setDrag(null)}
                                onClick={() => navigate(`/content/${c.id}`)} title={c.title}>
                                <span className="top"><strong>{(isShoot ? '' : c.publishTime) || '—'}</strong><span className={st.cls}>{st.t}</span></span>
                                <span className="t">{c.title}</span>
                                <span className="m">{c.code}{ownerName ? ` · ${ownerName.split(' ')[0]}` : ''}{c._cross != null ? ' · silang' : ''}</span>
                              </button>
                            );
                          })}
                        </span>
                      )),
                    ];
                  })}
                </div>
              </div>
            );
          })()}

          {view === 'list' && (
            <Card>
              {(() => {
                const rows = items.filter((c) => c[dk] >= monthFrom && c[dk] <= monthTo).sort((x, y) => `${x[dk]}${x.publishTime || ''}`.localeCompare(`${y[dk]}${y.publishTime || ''}`));
                if (!rows.length) return <Empty title="Tiada content bulan ini" text="Tukar bulan atau kosongkan penapis." />;
                return (
                  <div className="table-wrap"><table className="table" style={{ minWidth: 760 }}>
                    <thead><tr><th>Pos</th><th>Shoot</th><th>Content</th><th>Jenis</th><th>Platform</th><th>Pemilik</th><th>Kemajuan</th><th>Status</th></tr></thead>
                    <tbody>{rows.map((c) => (
                      <tr key={c._key || c.id} className="clickable" onClick={() => (c.isSlot ? setDrawer({ content: c }) : navigate(`/content/${c.id}`))}>
                        <td className={isShoot ? '' : 'strong'}>{c.publishDate ? fmtDate(c.publishDate, { weekday: 'short' }) : '—'}{c.publishTime ? `, ${c.publishTime}` : ''}</td>
                        <td className={isShoot ? 'strong' : ''}>{c.shootDate ? fmtDate(c.shootDate, { weekday: 'short' }) : '—'}</td>
                        <td>{c.isSlot ? <span className="muted">{c.slotLabel || 'Slot kosong'}</span> : <><strong>{c.title}</strong><div className="small muted">{c.code}</div></>}</td>
                        <td><span className="meta-dot"><span className="dot" style={{ background: typeColor(config, c.type) }} />{c.type || '—'}</span></td>
                        <td>{c.platform || '—'}</td>
                        <td>{c.ownerName ? <span className="meta-dot"><span className="dot" style={{ background: staffColor[c.ownerStaffId] || OTHER }} />{c.ownerName}</span> : '—'}</td>
                        <td>{!c.isSlot && <ProgressDots content={c} showLabel />}</td>
                        <td>{c.isSlot ? <span className="tag">Slot</span> : <ContentStatusPill value={c.status} />}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                );
              })()}
            </Card>
          )}

          <div className="legend">
            <span className="muted">{mode === 'owner' ? 'Pemilik:' : mode === 'type' ? 'Jenis content:' : mode === 'account' ? 'Akaun:' : 'Status:'}</span>
            {legend.map((l) => <span key={l.key}><span className="dot" style={{ background: l.color }} />{l.label}</span>)}
            {mode === 'owner' && legend.length > PALETTE.length && <span className="muted">Staf ke-9 dan seterusnya berwarna kelabu.</span>}
          </div>
        </div>

        {!creatorOnly && view !== 'lanes' && (
          <div className="side" style={{ flex: '0 1 300px' }}>
            <Card title="Bank idea" subtitle="Tulis idea bila terlintas. Seret ke tarikh bila nak jadualkan." actions={<Pill>{ideas.length}</Pill>}>
              {canCreate && (
                <div className="row gap-sm" style={{ marginBottom: 10 }}>
                  <input
                    className="input"
                    style={{ minHeight: 36 }}
                    value={ideaText}
                    onChange={(e) => setIdeaText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitIdea(); } }}
                    placeholder="Tulis idea, tekan Enter"
                    aria-label="Idea baharu"
                  />
                </div>
              )}
              <div className="col gap-xs">
                {ideas.slice(0, 30).map((c) => (
                  <div
                    key={c.id}
                    className={`idea${drag?.id === c.id ? ' dragging' : ''}`}
                    draggable={canEdit}
                    onDragStart={() => setDrag({ id: c.id })}
                    onDragEnd={() => setDrag(null)}
                    onClick={() => navigate(`/content/${c.id}`)}
                  >
                    <GripVertical size={13} className="faint" />
                    <span className="grow min0 ellipsis small strong">{c.title}</span>
                    {c.platform && <span className="tag" title={c.platform}>{platformShort(c.platform)}</span>}
                  </div>
                ))}
                {!ideas.length && <p className="muted small">Belum ada idea tersimpan.</p>}
                {ideas.length > 30 && <p className="muted small">+{ideas.length - 30} idea lagi. Guna carian untuk cari idea tertentu.</p>}
              </div>
            </Card>

            {monthSlots.length > 0 && (
              <div className="warnbox">
                <div>
                  <strong>{monthSlots.length} slot belum ada tajuk</strong>
                  <span>Slot yang kosong tidak dikira dalam laporan.</span>
                  <button type="button" className="link-btn" onClick={() => setBulkOpen(true)}>Isi sekaligus</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {ideas.length > 0 && creatorOnly && <p className="muted small">{ideas.length} content belum ada tarikh terbit.</p>}

      <DayModal
        day={openDay}
        items={openDay ? byDay[openDay] || [] : []}
        mode={mode}
        dateKey={dk}
        postItems={openDay && isShoot ? postByDay[openDay] || [] : []}
        canCreate={canCreate}
        saving={saving}
        onClose={() => setOpenDay(null)}
        onQuickAdd={quickAdd}
        onOpenBrief={(day, platform) => { setOpenDay(null); setDrawer({ preset: isShoot ? { shootDate: day, platform } : { date: day, platform } }); }}
        onOpenSlot={(c) => { setOpenDay(null); setDrawer({ content: c }); }}
      />
      <QuickPlanModal open={planOpen} onClose={() => setPlanOpen(false)} />
      <BulkFillModal open={bulkOpen} onClose={() => setBulkOpen(false)} slots={monthSlots} />
      <BriefDrawer open={!!drawer} onClose={() => setDrawer(null)} preset={drawer?.preset || {}} content={drawer?.content || null} />
      {confirmEl}
    </div>
  );
}
