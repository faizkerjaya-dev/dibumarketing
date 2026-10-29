// Pengurusan staf dalaman: beban kerja mingguan, papan agihan tugasan, dan direktori staf.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, UserPlus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { can } from '../lib/permissions';
import { staffWorkload, BANDS } from '../lib/workload';
import { TASK_ROLES, TASK_STATUSES, PRIORITIES, findOpt } from '../lib/constants';
import { today, startOfWeek, addDays, fmtDate, inRange } from '../lib/dates';
import { PageHeader, Card, Tabs, Button, Pill, Avatar, Bar, Select, SearchInput, Loading, Empty, Stat, IconButton } from '../components/ui';
import { StaffStatusPill, TaskStatusPill } from '../components/pills';
import TaskModal from '../components/TaskModal';
import StaffModal from '../components/StaffModal';

export default function Team() {
  const { staff, tasks, campaigns, ready } = useData();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('workload');
  const [week, setWeek] = useState(startOfWeek(today()));
  const [taskModal, setTaskModal] = useState(null);
  const [staffModal, setStaffModal] = useState(null);
  const [selected, setSelected] = useState('');
  const [af, setAf] = useState({ role: '', campaignId: '', status: 'open', priority: '', due: '' });
  const [q, setQ] = useState('');
  const canAssign = can(profile, 'task.assign');
  const canManage = can(profile, 'staff.manage');

  useEffect(() => {
    if (params.get('newTask')) { setTaskModal({}); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const rows = useMemo(() => staff
    .filter((s) => s.status !== 'inactive')
    .map((s) => ({ s, w: staffWorkload(s, tasks, week) }))
    .sort((a, b) => (b.w.pct ?? -1) - (a.w.pct ?? -1)), [staff, tasks, week]);

  const anyNoHours = rows.some((r) => r.w.counted > 0 && !r.w.hasHours);
  const sel = selected || rows[0]?.s.id || '';
  const weekEnd = addDays(week, 6);
  const allocTasks = tasks.filter((t) => t.staffId === sel)
    .filter((t) => (af.status === 'open' ? t.status !== 'done' : !af.status || t.status === af.status))
    .filter((t) => !af.role || t.role === af.role)
    .filter((t) => !af.campaignId || t.campaignId === af.campaignId)
    .filter((t) => !af.priority || t.priority === af.priority)
    .filter((t) => !af.due || (af.due === 'overdue' ? t.deadline && t.deadline < today() : inRange(t.deadline, week, weekEnd)))
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));

  if (!ready) return <div className="page"><Loading /></div>;

  return (
    <div className="page">
      <PageHeader title="Pasukan" actions={<>
        {canManage && <Button icon={UserPlus} onClick={() => setStaffModal({})}>Tambah staf</Button>}
        {canAssign && <Button variant="primary" icon={Plus} onClick={() => setTaskModal({})}>Tugasan staf baharu</Button>}
      </>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'workload', label: 'Beban kerja' }, { key: 'allocation', label: 'Papan agihan' }, { key: 'directory', label: 'Direktori staf', count: staff.length }]} />

      {tab === 'workload' && <>
        <div className="toolbar">
          <IconButton icon={ChevronLeft} label="Minggu sebelum" onClick={() => setWeek(addDays(week, -7))} />
          <IconButton icon={ChevronRight} label="Minggu seterusnya" onClick={() => setWeek(addDays(week, 7))} />
          <Button size="sm" onClick={() => setWeek(startOfWeek(today()))}>Minggu ini</Button>
          <strong>{fmtDate(week)} – {fmtDate(weekEnd)}</strong>
        </div>
        <div className="stats">
          <Stat label="Staf aktif" value={rows.filter((r) => r.s.status === 'active').length} />
          <Stat label="Melebihi kapasiti" value={rows.filter((r) => r.w.band === 'over').length} tone={rows.some((r) => r.w.band === 'over') ? 'red' : undefined} />
          <Stat label="Hampir penuh" value={rows.filter((r) => r.w.band === 'near').length} tone={rows.some((r) => r.w.band === 'near') ? 'amber' : undefined} />
          <Stat label="Bercuti" value={rows.filter((r) => r.w.band === 'leave').length} />
        </div>
        <Card title="Beban kerja" subtitle="Beban = jam anggaran tugasan belum siap (termasuk yang lewat) ÷ kapasiti mingguan.">
          {anyNoHours && <p className="small muted" style={{ marginBottom: 8 }}>Staf tanpa anggaran jam dipaparkan sebagai bilangan tugasan, bukan peratus.</p>}
          {!rows.length ? <Empty title="Belum ada staf" text="Tambah staf untuk mula agih tugasan." /> : (
            <div className="table-wrap"><table className="table" style={{ minWidth: 860 }}>
              <thead><tr><th>Staf</th><th>Tugasan aktif</th><th>Lewat</th><th>Minggu ini</th><th style={{ width: 240 }}>Anggaran beban</th><th>Kapasiti</th><th>Ketersediaan</th></tr></thead>
              <tbody>{rows.map(({ s, w }) => (
                <tr key={s.id} className="clickable" onClick={() => navigate(`/team/${s.id}`)}>
                  <td><span className="row gap-sm"><Avatar name={s.name} /><span><strong>{s.name}</strong><div className="small muted">{s.jobTitle}</div></span></span></td>
                  <td>{w.active}</td>
                  <td className={w.overdue ? 'danger-text' : ''}>{w.overdue}</td>
                  <td>{w.dueWeek}</td>
                  <td>{w.hasHours
                    ? <span className="row gap-sm"><span className="grow"><Bar pct={w.pct} height={8} tone={BANDS[w.band].tone === 'gray' ? 'gray' : BANDS[w.band].tone} /></span><strong style={{ width: 44, textAlign: 'right' }}>{w.pct}%</strong></span>
                    : <span className="muted">{w.counted} tugasan (tiada anggaran jam)</span>}</td>
                  <td>{w.hours} / {w.cap} jam</td>
                  <td><Pill tone={BANDS[w.band].tone}>{BANDS[w.band].label}</Pill></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </>}

      {tab === 'allocation' && (
        <div className="split">
          <Card title="Staf" className="side" pad>
            {!rows.length && <p className="muted small">Belum ada staf aktif.</p>}
            {rows.map(({ s, w }) => (
              <button key={s.id} type="button" aria-pressed={sel === s.id} className={`list-row menu-item${sel === s.id ? ' selected' : ''}`} onClick={() => setSelected(s.id)} style={{ width: '100%' }}>
                <Avatar name={s.name} size={30} />
                <span className="grow min0"><strong>{s.name}</strong><span className="small muted block">{s.jobTitle}</span></span>
                <Pill tone={BANDS[w.band].tone}>{w.pct != null ? `${w.pct}%` : `${w.counted}`}</Pill>
              </button>
            ))}
          </Card>
          <Card className="main" title={`Tugasan · ${staff.find((s) => s.id === sel)?.name || ''}`} actions={canAssign && sel && <Button size="sm" icon={Plus} onClick={() => setTaskModal({ presetStaffId: sel })}>Beri tugasan</Button>}>
            <div className="toolbar" style={{ marginBottom: 10 }}>
              <Select value={af.status} onChange={(e) => setAf({ ...af, status: e.target.value })} options={[{ value: 'open', label: 'Belum siap' }, ...TASK_STATUSES.map((s) => ({ value: s.key, label: s.label }))]} placeholder="Semua status" />
              <Select value={af.role} onChange={(e) => setAf({ ...af, role: e.target.value })} options={TASK_ROLES} placeholder="Semua jenis tugas" />
              <Select value={af.campaignId} onChange={(e) => setAf({ ...af, campaignId: e.target.value })} options={campaigns.map((c) => ({ value: c.id, label: c.name }))} placeholder="Semua kempen" />
              <Select value={af.priority} onChange={(e) => setAf({ ...af, priority: e.target.value })} options={PRIORITIES} placeholder="Semua keutamaan" />
              <Select value={af.due} onChange={(e) => setAf({ ...af, due: e.target.value })} options={[{ value: 'week', label: 'Deadline minggu dipilih' }, { value: 'overdue', label: 'Lewat' }]} placeholder="Semua deadline" />
            </div>
            {!allocTasks.length && <Empty title="Tiada tugasan" text="Tiada tugasan untuk penapis ini." />}
            {allocTasks.map((t) => {
              const late = t.status !== 'done' && t.deadline && t.deadline < today();
              return (
                <div key={t.id} className="list-row wrap">
                  <span className="small muted strong" style={{ width: 80 }}>{t.contentCode || 'Umum'}</span>
                  <span className="grow min0" style={{ flexBasis: 200 }}>
                    {t.contentId ? <Link to={`/content/${t.contentId}`} style={{ color: 'var(--text)' }}>{t.contentTitle}</Link> : <strong>{t.description || 'Tugasan'}</strong>}
                    <span className="small muted block">{findOpt(TASK_ROLES, t.role).label}{t.campaignName ? ` · ${t.campaignName}` : ''}</span>
                  </span>
                  <span className={late ? 'danger-text small' : 'small'} style={{ width: 120 }}>{t.deadline ? fmtDate(t.deadline) : 'Tiada tarikh'}{late ? ' · lewat' : ''}</span>
                  <span className="small" style={{ width: 56 }}>{t.estHours ? `${t.estHours} jam` : '—'}</span>
                  <TaskStatusPill value={t.status} />
                  {canAssign && <Button size="sm" onClick={() => setTaskModal({ task: t })}>Tukar staf</Button>}
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {tab === 'directory' && <>
        <div className="toolbar"><SearchInput value={q} onChange={setQ} placeholder="Cari staf" /></div>
        <div className="lib-grid">
          {staff.filter((s) => `${s.name} ${s.jobTitle} ${(s.skills || []).join(' ')}`.toLowerCase().includes(q.toLowerCase())).map((s) => (
            <div key={s.id} className="lib-card">
              <div className="row gap-sm"><Avatar name={s.name} size={40} /><div className="grow min0"><Link to={`/team/${s.id}`} style={{ color: 'var(--text)' }}>{s.name}</Link><div className="small muted">{s.jobTitle || '—'}</div></div><StaffStatusPill value={s.status} /></div>
              <div className="row gap-xs wrap">{(s.skills || []).map((k) => <span key={k} className="tag">{k}</span>)}</div>
              <div className="small muted">{s.weeklyCapacity || 0} jam / minggu{s.userUid ? ' · ada akaun' : ' · tiada akaun'}</div>
              {canManage && <Button size="sm" onClick={() => setStaffModal({ staff: s })}>Edit</Button>}
            </div>
          ))}
        </div>
        {!staff.length && <Empty title="Belum ada staf" action={canManage && <Button variant="primary" onClick={() => setStaffModal({})}>Tambah staf</Button>} />}
        {staff.length > 0 && q && !staff.some((s) => `${s.name} ${s.jobTitle} ${(s.skills || []).join(' ')}`.toLowerCase().includes(q.toLowerCase())) && <Empty title="Tiada staf sepadan" text="Cuba kata kunci lain." />}
      </>}

      <TaskModal open={!!taskModal} onClose={() => setTaskModal(null)} task={taskModal?.task} presetStaffId={taskModal?.presetStaffId} />
      <StaffModal open={!!staffModal} onClose={() => setStaffModal(null)} staff={staffModal?.staff} />
    </div>
  );
}
