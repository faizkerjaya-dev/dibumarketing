// Papan kerja content. Seret kad ke lajur lain untuk tukar status.
// Lalai: mod Fokus (hari ini sahaja; bila semua terbit, auto tukar ke hari seterusnya).
// Lajur mengikut status dalam Tetapan, jadi pasukan boleh ubah sendiri.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Clock } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { can } from '../lib/permissions';
import { statusList, stageOf, isArchived, findStatus, statusForStage } from '../lib/statuses';
import { TASK_ROLES, findOpt } from '../lib/constants';
import { today, fmtDate, addDays, startOfWeek } from '../lib/dates';
import { staffWorkload } from '../lib/workload';
import { PageHeader, Button, Avatar, Loading, Select, IconButton, Segmented } from '../components/ui';
import { PriorityPill, ReviewPill } from '../components/pills';
import ContentFilters, { EMPTY_FILTERS, applyFilters } from '../components/ContentFilters';
import { useStatusChange } from '../components/StatusChangeModal';
import BriefDrawer from '../components/BriefDrawer';

const PRIO_RANK = { high: 0, medium: 1, low: 2 };

export default function Pipeline() {
  const { content, tasks, staff, ready } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const [params] = useSearchParams();
  const [moveTo, moveEl] = useStatusChange();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState('deadline');
  const [showArchived, setShowArchived] = useState(false);
  const [showSlots, setShowSlots] = useState(false);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const canEdit = can(profile, 'content.edit');
  const stageFilter = params.get('stage');
  const t0 = today();
  const [scope, setScope] = useState(stageFilter ? 'all' : 'focus');
  const [withLate, setWithLate] = useState(false);

  const overloaded = useMemo(() => new Set(staff.filter((s) => staffWorkload(s, tasks).band === 'over').map((s) => s.id)), [staff, tasks]);
  const nextTask = useMemo(() => {
    const m = {};
    tasks.filter((t) => t.status !== 'done' && t.contentId && t.deadline).forEach((t) => {
      if (!m[t.contentId] || t.deadline < m[t.contentId].deadline) m[t.contentId] = t;
    });
    return m;
  }, [tasks]);

  const columns = statusList(config)
    .filter((s) => showArchived || s.stage !== 'archived')
    .filter((s) => !stageFilter || s.stage === stageFilter);

  // Mod Fokus: papar content hari ini sahaja. Bila semua content hari ini sudah terbit,
  // papan bertukar sendiri ke hari seterusnya yang masih ada kerja (biasanya esok).
  const isDone = (c) => ['published', 'archived'].includes(stageOf(config, c.status));
  const real = useMemo(() => content.filter((c) => !c.archived && !c.isSlot && !isArchived(config, c.status)), [content, config]);
  const focusDay = useMemo(() => {
    const pendingDays = [...new Set(real.filter((c) => c.publishDate >= t0 && !isDone(c)).map((c) => c.publishDate))].sort();
    return pendingDays[0] || addDays(t0, 1);
  }, [real, t0]); // eslint-disable-line react-hooks/exhaustive-deps
  const todayAll = real.filter((c) => c.publishDate === t0);
  const todayDone = todayAll.length > 0 && todayAll.every(isDone);
  const lateList = real.filter((c) => c.publishDate && c.publishDate < t0 && !isDone(c));
  const weekEnd = addDays(startOfWeek(t0), 6);
  const inScope = (c) => {
    if (scope === 'all') return true;
    if (withLate && c.publishDate && c.publishDate < t0 && !isDone(c)) return true;
    if (scope === 'focus') return c.publishDate === focusDay;
    if (scope === 'today') return c.publishDate === t0;
    if (scope === 'tomorrow') return c.publishDate === addDays(t0, 1);
    if (scope === 'week') return c.publishDate >= t0 && c.publishDate <= weekEnd;
    return true;
  };

  const list = useMemo(() => {
    const base = applyFilters(content.filter((c) => (showArchived || (!c.archived && !isArchived(config, c.status))) && (showSlots || !c.isSlot) && inScope(c)), filters);
    const due = (c) => nextTask[c.id]?.deadline || c.publishDate || '9999';
    return [...base].sort((a, b) => {
      if (sort === 'priority') return (PRIO_RANK[a.priority] ?? 3) - (PRIO_RANK[b.priority] ?? 3);
      if (sort === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sort === 'publish') return (a.publishDate || '9999').localeCompare(b.publishDate || '9999');
      return due(a).localeCompare(due(b));
    });
  }, [content, config, filters, sort, showArchived, showSlots, nextTask, scope, withLate, focusDay]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className="page"><Loading /></div>;

  // Status lama atau yang sudah dibuang dari Tetapan dipaparkan dalam lajur pertama peringkat yang sama.
  const columnOf = (c) => {
    const st = findStatus(config, c.status);
    return st.unknown ? statusForStage(config, st.stage) : st.key;
  };

  const onDrop = (statusKey) => {
    setOver(null);
    const c = content.find((x) => x.id === drag);
    setDrag(null);
    if (c) moveTo(c, statusKey);
  };

  return (
    <div className="page">
      <PageHeader title="Papan kerja" actions={can(profile, 'content.create') && <Button variant="primary" icon={Plus} onClick={() => setDrawer({ preset: { date: today() } })}>Tambah content</Button>} />
      <div className="toolbar">
        <Segmented value={scope} onChange={setScope} options={[
          { key: 'focus', label: 'Fokus' }, { key: 'today', label: 'Hari ini' }, { key: 'tomorrow', label: 'Esok' }, { key: 'week', label: 'Minggu ini' }, { key: 'all', label: 'Semua' },
        ]} />
        {scope === 'focus' && (
          <span className="small">
            {focusDay === t0
              ? <>Memaparkan content <strong>hari ini</strong>. Bila semuanya terbit, papan ini bertukar ke hari seterusnya.</>
              : <>{todayDone ? 'Semua content hari ini sudah terbit. ' : 'Tiada content yang belum siap hari ini. '}Memaparkan <strong>{fmtDate(focusDay, { weekday: 'long' })}</strong>.</>}
          </span>
        )}
      </div>
      {scope !== 'all' && lateList.length > 0 && (
        <div className="warnbox row" style={{ alignItems: 'center' }}>
          <div><strong>{lateList.length} content lewat</strong><span>Tarikh terbit sudah lepas tetapi belum terbit. Tidak dipaparkan di sini supaya papan tidak sesak.</span></div>
          <span className="grow" />
          <Button size="sm" onClick={() => setWithLate((v) => !v)}>{withLate ? 'Sorok yang lewat' : 'Tunjuk yang lewat'}</Button>
        </div>
      )}
      <ContentFilters value={filters} onChange={setFilters} hide={['status']} />
      <div className="toolbar">
        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Susun" options={[{ value: 'deadline', label: 'Susun: deadline terdekat' }, { value: 'publish', label: 'Susun: tarikh terbit' }, { value: 'priority', label: 'Susun: keutamaan' }, { value: 'title', label: 'Susun: tajuk' }]} />
        <label className="check"><input type="checkbox" checked={showSlots} onChange={(e) => setShowSlots(e.target.checked)} />Tunjuk slot kosong</label>
        <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Tunjuk arkib</label>
        {stageFilter && <Link to="/pipeline">Tunjuk semua peringkat</Link>}
        <span className="muted small">Seret kad untuk tukar status.</span>
      </div>
      <div className="board">
        <div className="board-inner">
          {columns.map((col) => {
            // findStatus memetakan status lama / tidak dikenali ke lajur yang betul, supaya tiada kad "hilang".
            const cards = list.filter((c) => columnOf(c) === col.key);
            return (
              <section
                key={col.key}
                className={`column${over === col.key ? ' drop' : ''}`}
                onDragOver={(e) => { if (drag && canEdit) { e.preventDefault(); setOver(col.key); } }}
                onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
                onDrop={(e) => { e.preventDefault(); onDrop(col.key); }}
              >
                <div className="column-head">
                  <span className={`dot dot-${col.tone}`} />
                  <h2 style={{ fontSize: 13 }}>{col.label}</h2>
                  <span className="muted small strong">{cards.length}</span>
                  {can(profile, 'content.create') && col.stage !== 'archived' && (
                    <IconButton icon={Plus} label={`Tambah ke ${col.label}`} onClick={() => setDrawer({ preset: { date: scope === 'focus' ? focusDay : today(), status: col.key } })} style={{ marginLeft: 'auto', width: 30, height: 30 }} />
                  )}
                </div>
                {cards.map((c) => {
                  const nt = nextTask[c.id];
                  const published = stageOf(config, c.status) === 'published';
                  const late = !published && ((nt && nt.deadline < t0) || (c.publishDate && c.publishDate < t0));
                  const dueLabel = nt ? `${findOpt(TASK_ROLES, nt.role).label} ${fmtDate(nt.deadline)}` : c.publishDate ? `Terbit ${fmtDate(c.publishDate)}` : 'Tiada tarikh';
                  return (
                    <Link
                      key={c.id}
                      to={published ? `/content/${c.id}?tab=review` : `/content/${c.id}`}
                      className={`kcard${late ? ' late' : ''}`}
                      draggable={canEdit}
                      onDragStart={() => setDrag(c.id)}
                      onDragEnd={() => setDrag(null)}
                    >
                      <div className="row" style={{ justifyContent: 'space-between' }}><span className="small muted strong">{c.code}</span>{c.priority && <PriorityPill value={c.priority} />}</div>
                      <div className="strong" style={{ lineHeight: 1.35 }}>{c.title || <span className="muted">{c.slotLabel || 'Slot kosong'}</span>}</div>
                      <div className="row gap-xs wrap">{c.platform && <span className="tag">{c.platform}</span>}{c.campaignName && <span className="tag">{c.campaignName}</span>}</div>
                      {published && <div><ReviewPill review={c.review} showNone /></div>}
                      <div className="kcard-foot">
                        <span className={`row gap-xs small strong${late ? ' danger-text' : ' muted'}`}><Clock size={13} />{late ? 'Lewat · ' : ''}{dueLabel}</span>
                        <span className="avatars">
                          {[...new Set(c.assigneeStaffIds || [])].slice(0, 4).map((sid) => {
                            const st = staff.find((x) => x.id === sid);
                            return <Avatar key={sid} name={st?.name || '?'} size={24} warn={overloaded.has(sid)} />;
                          })}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
      <BriefDrawer open={!!drawer} onClose={() => setDrawer(null)} preset={drawer?.preset || {}} />
      {moveEl}
    </div>
  );
}
