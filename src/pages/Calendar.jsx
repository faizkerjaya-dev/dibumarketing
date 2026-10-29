// Kalendar content. Tiga cara menambah:
//   1. Klik mana-mana sel, taip tajuk, Enter. Baris baharu terus terbuka dalam hari yang sama.
//   2. Rancang sebulan: tempah slot kosong mengikut kekerapan posting.
//   3. Bank idea: tulis idea tanpa tarikh, seret ke kalendar bila nak jadualkan.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, CalendarRange, ListChecks, GripVertical } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { can, isCreatorOnly } from '../lib/permissions';
import { updateById, logActivity, quickAddContent, addIdea, scheduleIdea } from '../lib/db';
import { findStatus, statusForStage, isArchived } from '../lib/statuses';
import { platformShort } from '../lib/constants';
import { today, toISODate, addDays, startOfWeek, monthLabel, fmtDate, parseDate } from '../lib/dates';
import { PageHeader, Button, Segmented, Loading, Empty, useConfirm, IconButton, Card, Pill } from '../components/ui';
import { ContentStatusPill } from '../components/pills';
import ContentFilters, { EMPTY_FILTERS, applyFilters } from '../components/ContentFilters';
import BriefDrawer, { readLast } from '../components/BriefDrawer';
import { QuickPlanModal, BulkFillModal } from '../components/SlotPlanModal';

const WEEKDAYS = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Ahd'];

export default function CalendarPage() {
  const { content, staffById, ready } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const { run } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [confirm, confirmEl] = useConfirm();

  const [view, setView] = useState('month');
  const [anchor, setAnchor] = useState(today());
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [addCell, setAddCell] = useState(null);
  const [addTitle, setAddTitle] = useState('');
  const [addPlatform, setAddPlatform] = useState(() => readLast().platform || config.platforms[0] || '');
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState(null);
  const [dropDay, setDropDay] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [planOpen, setPlanOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [ideaText, setIdeaText] = useState('');
  const addRef = useRef(null);

  const canEdit = can(profile, 'content.edit');
  const canCreate = can(profile, 'content.create');
  const creatorOnly = isCreatorOnly(profile);

  const live = useMemo(() => content.filter((c) => !c.archived && !isArchived(config, c.status)), [content, config]);
  const items = useMemo(() => applyFilters(live, filters), [live, filters]);
  const byDay = useMemo(() => {
    const m = {};
    items.forEach((c) => { if (c.publishDate) (m[c.publishDate] = m[c.publishDate] || []).push(c); });
    Object.values(m).forEach((l) => l.sort((a, b) => Number(a.isSlot) - Number(b.isSlot) || (a.publishTime || '').localeCompare(b.publishTime || '')));
    return m;
  }, [items]);
  const ideas = useMemo(() => items.filter((c) => !c.publishDate).sort((a, b) => (b.code || '').localeCompare(a.code || '')), [items]);

  const a = parseDate(anchor);
  let days = [];
  let title = '';
  if (view === 'week') {
    const s = startOfWeek(anchor);
    days = Array.from({ length: 7 }, (_, i) => addDays(s, i));
    title = `${fmtDate(days[0])} – ${fmtDate(days[6], { year: 'numeric' })}`;
  } else {
    const first = toISODate(new Date(a.getFullYear(), a.getMonth(), 1));
    const s = startOfWeek(first);
    const last = toISODate(new Date(a.getFullYear(), a.getMonth() + 1, 0));
    const weeks = Math.ceil((parseDate(last) - parseDate(s)) / 86400000 / 7 + 0.01);
    days = Array.from({ length: weeks * 7 }, (_, i) => addDays(s, i));
    title = monthLabel(a.getFullYear(), a.getMonth());
  }
  const month = a.getMonth();
  const monthFrom = toISODate(new Date(a.getFullYear(), a.getMonth(), 1));
  const monthTo = toISODate(new Date(a.getFullYear(), a.getMonth() + 1, 0));
  const monthSlots = useMemo(() => live.filter((c) => c.isSlot && c.publishDate >= monthFrom && c.publishDate <= monthTo).sort((x, y) => x.publishDate.localeCompare(y.publishDate)), [live, monthFrom, monthTo]);

  // ?add=1 (dari menu Tambah) buka panel content baharu. ?campaign=ID pra-pilih kempen.
  useEffect(() => {
    if (!params.get('add')) return;
    setDrawer({ preset: { date: today(), campaignId: params.get('campaign') || '' } });
    setParams({}, { replace: true });
  }, [params, setParams]);

  const shift = (dir) => {
    setAddCell(null);
    if (view === 'week') setAnchor(addDays(anchor, 7 * dir));
    else setAnchor(toISODate(new Date(a.getFullYear(), a.getMonth() + dir, 1)));
  };

  const openAdd = (day) => {
    if (!canCreate) return;
    setAddCell(day);
    setAddTitle('');
    setTimeout(() => addRef.current?.focus(), 30);
  };

  const submitAdd = async () => {
    const t = addTitle.trim();
    if (!t || saving) return;
    setSaving(true);
    await run(() => quickAddContent({
      title: t,
      platform: addPlatform,
      publishDate: addCell,
      ownerStaffId: readLast().ownerStaffId || profile.staffId || '',
      status: statusForStage(config, 'idea'),
    }, { profile, staffById }));
    setSaving(false);
    setAddTitle('');
    addRef.current?.focus();
  };

  const drop = async (day) => {
    setDropDay(null);
    const d = drag;
    setDrag(null);
    if (!d) return;
    const c = content.find((x) => x.id === d.id);
    if (!c || c.publishDate === day) return;
    if (!c.publishDate) {
      await run(() => scheduleIdea(c, day, profile), `Dijadualkan ${fmtDate(day)}`);
      return;
    }
    const ok = await confirm(`Pindah tarikh terbit “${c.title || c.slotLabel}” dari ${fmtDate(c.publishDate)} ke ${fmtDate(day)}?\n\nDeadline skrip, shooting, editing dan approval tidak berubah.`, { title: 'Pindah tarikh terbit', okLabel: 'Pindah' });
    if (!ok) return;
    await run(async () => {
      await updateById('content', c.id, { publishDate: day }, profile);
      await logActivity(profile, { type: 'publish_date_changed', message: `${profile.name} pindah tarikh terbit “${c.title || c.slotLabel || c.code}” ke ${fmtDate(day)}`, refType: 'content', refId: c.id });
    }, 'Tarikh terbit dikemas kini');
  };

  const submitIdea = async () => {
    const t = ideaText.trim();
    if (!t) return;
    const ok = await run(() => addIdea({ text: t, platform: addPlatform, statusKey: statusForStage(config, 'idea') }, { profile, staffById }), 'Idea disimpan');
    if (ok) setIdeaText('');
  };

  if (!ready) return <div className="page"><Loading /></div>;

  const card = (c) => {
    const tone = c.isSlot ? 'gray' : findStatus(config, c.status).tone;
    const late = !c.isSlot && c.publishDate < today() && findStatus(config, c.status).stage !== 'published';
    return (
      <button
        key={c.id}
        type="button"
        className={`cal-card${c.isSlot ? ' slot' : ` tone-${late ? 'red' : tone}`}`}
        draggable={canEdit}
        onDragStart={() => setDrag({ id: c.id })}
        onDragEnd={() => setDrag(null)}
        onClick={(e) => { e.stopPropagation(); if (c.isSlot) setDrawer({ content: c }); else navigate(`/content/${c.id}`); }}
        title={c.isSlot ? `${c.slotLabel || 'Slot kosong'} · klik untuk isi` : `${c.title} · ${findStatus(config, c.status).label}`}
      >
        {!c.isSlot && <span className={`dot dot-${late ? 'red' : tone}`} />}
        {c.isSlot && <Plus size={11} />}
        <span className="t">{c.isSlot ? (c.slotLabel || 'Slot kosong') : c.title}</span>
      </button>
    );
  };

  return (
    <div className="page">
      <PageHeader
        title={creatorOnly ? 'Kalendar saya' : 'Kalendar'}
        actions={!creatorOnly && <>
          {canCreate && <Button icon={CalendarRange} onClick={() => setPlanOpen(true)}>Rancang sebulan</Button>}
          {canCreate && monthSlots.length > 0 && <Button icon={ListChecks} onClick={() => setBulkOpen(true)}>Isi {monthSlots.length} slot</Button>}
          {canCreate && <Button variant="primary" icon={Plus} onClick={() => setDrawer({ preset: { date: today() } })}>Tambah content</Button>}
        </>}
      >
        <p className="muted small" style={{ marginTop: 4 }}>
          {items.filter((c) => c.publishDate >= monthFrom && c.publishDate <= monthTo && !c.isSlot).length} content bulan ini
          {monthSlots.length > 0 && ` · ${monthSlots.length} slot belum ada tajuk`}
        </p>
      </PageHeader>

      <div className="toolbar">
        <IconButton icon={ChevronLeft} label="Sebelum" onClick={() => shift(-1)} />
        <IconButton icon={ChevronRight} label="Seterusnya" onClick={() => shift(1)} />
        <Button size="sm" onClick={() => setAnchor(today())}>Hari ini</Button>
        <h2 style={{ margin: '0 6px', fontSize: 17 }}>{title}</h2>
        <div className="grow" />
        <Segmented value={view} onChange={(v) => { setView(v); setAddCell(null); }} options={[{ key: 'month', label: 'Bulan' }, { key: 'week', label: 'Minggu' }, { key: 'list', label: 'Senarai' }]} />
      </div>

      {!creatorOnly && <ContentFilters value={filters} onChange={setFilters} />}

      <div className="split">
        <div className="main" style={{ flex: '1 1 640px' }}>
          {view !== 'list' ? (
            <div className={`cal${view === 'week' ? ' cal-week' : ''}`}>
              <div className="cal-inner">
                <div className="cal-head">{WEEKDAYS.map((w, i) => <div key={w}>{view === 'week' ? `${w} ${parseDate(days[i]).getDate()}` : w}</div>)}</div>
                <div className="cal-grid">
                  {days.map((day) => {
                    const list = byDay[day] || [];
                    const out = view === 'month' && parseDate(day).getMonth() !== month;
                    const max = view === 'week' || expanded[day] ? 99 : 3;
                    return (
                      <div
                        key={day}
                        className={`cal-cell${out ? ' out' : ''}${dropDay === day ? ' drop' : ''}`}
                        onClick={() => addCell !== day && openAdd(day)}
                        onDragOver={(e) => { if (drag) { e.preventDefault(); setDropDay(day); } }}
                        onDragLeave={() => setDropDay((d) => (d === day ? null : d))}
                        onDrop={(e) => { e.preventDefault(); drop(day); }}
                      >
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <span className={`cal-num${day === today() ? ' today' : ''}`}>{parseDate(day).getDate()}</span>
                          {canCreate && <button type="button" className="cal-add" aria-label={`Tambah content pada ${fmtDate(day)}`} onClick={(e) => { e.stopPropagation(); openAdd(day); }}>+</button>}
                        </div>
                        {list.slice(0, max).map(card)}
                        {list.length > max && <button type="button" className="cal-more" onClick={(e) => { e.stopPropagation(); setExpanded((x) => ({ ...x, [day]: true })); }}>+{list.length - max} lagi</button>}
                        {addCell === day && (
                          <div className="quickadd" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={addRef}
                              value={addTitle}
                              onChange={(e) => setAddTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); submitAdd(); }
                                if (e.key === 'Escape') { setAddCell(null); setAddTitle(''); }
                              }}
                              placeholder="Tajuk content"
                              aria-label={`Tajuk content untuk ${fmtDate(day)}`}
                            />
                            <div className="quickadd-row">
                              {config.platforms.map((p) => (
                                <button key={p} type="button" title={p} aria-pressed={addPlatform === p} className={`qa-chip${addPlatform === p ? ' on' : ''}`} onClick={() => setAddPlatform(p)}>{platformShort(p)}</button>
                              ))}
                              <button type="button" className="qa-chip" style={{ marginLeft: 'auto' }} onClick={() => { setDrawer({ preset: { date: day, platform: addPlatform } }); setAddCell(null); }}>Brief</button>
                            </div>
                            <span className="qa-hint">Enter simpan · Esc tutup</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <Card>
              {(() => {
                const rows = items.filter((c) => c.publishDate >= monthFrom && c.publishDate <= monthTo).sort((x, y) => `${x.publishDate}${x.publishTime || ''}`.localeCompare(`${y.publishDate}${y.publishTime || ''}`));
                if (!rows.length) return <Empty title="Tiada content bulan ini" text="Tukar bulan atau kosongkan penapis." />;
                return (
                  <div className="table-wrap"><table className="table" style={{ minWidth: 680 }}>
                    <thead><tr><th>Terbit</th><th>Content</th><th>Platform</th><th>Pemilik</th><th>Status</th></tr></thead>
                    <tbody>{rows.map((c) => (
                      <tr key={c.id} className="clickable" onClick={() => (c.isSlot ? setDrawer({ content: c }) : navigate(`/content/${c.id}`))}>
                        <td>{fmtDate(c.publishDate, { weekday: 'short' })}{c.publishTime ? `, ${c.publishTime}` : ''}</td>
                        <td>{c.isSlot ? <span className="muted">{c.slotLabel || 'Slot kosong'}</span> : <><strong>{c.title}</strong><div className="small muted">{c.code}</div></>}</td>
                        <td>{c.platform || '—'}</td><td>{c.ownerName || '—'}</td>
                        <td>{c.isSlot ? <span className="tag">Slot</span> : <ContentStatusPill value={c.status} />}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                );
              })()}
            </Card>
          )}
        </div>

        {!creatorOnly && (
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

            <div className="legend">
              {['idea', 'production', 'review', 'ready', 'published'].map((stage) => {
                const s = findStatus(config, statusForStage(config, stage));
                return <span key={stage}><span className={`dot dot-${s.tone}`} />{s.label}</span>;
              })}
              <span><span className="dot dot-red" />Lewat</span>
            </div>
          </div>
        )}
      </div>

      {ideas.length > 0 && creatorOnly && <p className="muted small">{ideas.length} content belum ada tarikh terbit.</p>}

      <QuickPlanModal open={planOpen} onClose={() => setPlanOpen(false)} />
      <BulkFillModal open={bulkOpen} onClose={() => setBulkOpen(false)} slots={monthSlots} />
      <BriefDrawer open={!!drawer} onClose={() => setDrawer(null)} preset={drawer?.preset || {}} content={drawer?.content || null} />
      {confirmEl}
    </div>
  );
}
