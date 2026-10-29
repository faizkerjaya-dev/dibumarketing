import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { can } from '../lib/permissions';
import { staffWorkload, BANDS } from '../lib/workload';
import { TASK_ROLES, findOpt } from '../lib/constants';
import { today, startOfWeek, addDays, fmtDate, inRange } from '../lib/dates';
import { PageHeader, Card, Tabs, Button, Pill, Bar, KeyVal, Loading, Empty, Stat } from '../components/ui';
import { StaffStatusPill, TaskStatusPill, ContentStatusPill, CampaignStatusPill } from '../components/pills';
import TaskModal from '../components/TaskModal';
import StaffModal from '../components/StaffModal';

export default function StaffDetail() {
  const { id } = useParams();
  const { staffById, tasks, content, campaigns, ready } = useData();
  const { profile } = useAuth();
  const [tab, setTab] = useState('overview');
  const [taskModal, setTaskModal] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const s = staffById[id];

  if (!ready) return <div className="page"><Loading /></div>;
  if (!s) return <div className="page"><Empty title="Staf tidak dijumpai" action={<Link to="/team">Kembali ke pasukan</Link>} /></div>;

  const mine = tasks.filter((t) => t.staffId === id);
  const w = staffWorkload(s, tasks);
  const contentIds = new Set([...mine.map((t) => t.contentId).filter(Boolean), ...content.filter((c) => c.ownerStaffId === id).map((c) => c.id)]);
  const myContent = content.filter((c) => contentIds.has(c.id));
  const myCampaigns = campaigns.filter((c) => c.managerStaffId === id || (c.team || []).some((m) => m.staffId === id) || mine.some((t) => t.campaignId === c.id));
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(startOfWeek(today()), -7 * (7 - i)));
  const history = weeks.map((wk) => {
    const end = addDays(wk, 6);
    const due = mine.filter((t) => inRange(t.deadline, wk, end));
    return { wk, due: due.length, hours: due.reduce((n, t) => n + (Number(t.estHours) || 0), 0), done: due.filter((t) => t.status === 'done').length, onTime: due.filter((t) => t.status === 'done' && t.completedAt && t.completedAt <= t.deadline).length };
  });

  return (
    <div className="page">
      <PageHeader crumb={<Link to="/team">Pasukan</Link>} title={s.name} actions={<>
        {can(profile, 'staff.manage') && <Button icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Button>}
        {can(profile, 'task.assign') && <Button variant="primary" icon={Plus} onClick={() => setTaskModal({ presetStaffId: id })}>Beri tugasan</Button>}
      </>}>
        <div className="row gap-sm wrap" style={{ marginTop: 6 }}><span className="muted">{s.jobTitle}</span><StaffStatusPill value={s.status} /><Pill tone={BANDS[w.band].tone}>{BANDS[w.band].label}</Pill></div>
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Ringkasan' }, { key: 'tasks', label: 'Tugasan', count: mine.filter((t) => t.status !== 'done').length }, { key: 'content', label: 'Content', count: myContent.length }, { key: 'campaigns', label: 'Kempen', count: myCampaigns.length }, { key: 'history', label: 'Sejarah beban kerja' }]} />

      {tab === 'overview' && (
        <div className="split">
          <Card title="Profil" className="main">
            <KeyVal items={[['Email', s.email], ['Jabatan', s.department], ['Tarikh mula', s.startDate && fmtDate(s.startDate, { year: 'numeric' })], ['Kapasiti mingguan', `${s.weeklyCapacity || 0} jam`], ['Kapasiti bulanan', s.monthlyCapacity ? `${s.monthlyCapacity} jam` : ''], ['Akaun log masuk', s.userUid ? 'Sudah dipautkan' : 'Belum ada akaun'], ['Kemahiran', (s.skills || []).join(', ')], ['Tanggungjawab', s.responsibilities]]} />
            {(s.unavailable || []).length > 0 && <div style={{ marginTop: 12 }}><h3>Tidak available</h3>{s.unavailable.map((u, i) => <div key={i} className="small">{fmtDate(u.from)} – {fmtDate(u.to)} {u.note && `· ${u.note}`}</div>)}</div>}
            {s.notes && <p className="pre-line small" style={{ marginTop: 12 }}>{s.notes}</p>}
          </Card>
          <div className="side">
            <div className="stats">
              <Stat label="Minggu ini" value={w.hasHours ? `${w.pct}%` : `${w.counted} tugasan`} hint={w.hasHours ? `${w.hours} daripada ${w.cap} jam` : 'Tiada anggaran jam'} />
              <Stat label="Lewat" value={w.overdue} tone={w.overdue ? 'red' : undefined} />
            </div>
            <Bar pct={w.pct ?? 0} tone={BANDS[w.band].tone === 'gray' ? 'gray' : BANDS[w.band].tone} height={8} />
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <Card>
          {!mine.length && <Empty title="Tiada tugasan" />}
          {[...mine].sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.deadline || '9999').localeCompare(b.deadline || '9999')).map((t) => (
            <div key={t.id} className="list-row wrap">
              <span className="grow min0" style={{ flexBasis: 220 }}>
                {t.contentId ? <Link to={`/content/${t.contentId}`} style={{ color: 'var(--text)' }}>{t.contentTitle || t.contentCode}</Link> : <strong>{t.description || 'Tugasan umum'}</strong>}
                <span className="small muted block">{findOpt(TASK_ROLES, t.role).label}{t.campaignName ? ` · ${t.campaignName}` : ''}</span>
              </span>
              <span className={t.status !== 'done' && t.deadline < today() ? 'danger-text small' : 'small'}>{t.deadline ? fmtDate(t.deadline) : 'Tiada tarikh'}</span>
              <span className="small">{t.estHours ? `${t.estHours} jam` : '—'}</span>
              <TaskStatusPill value={t.status} />
              {can(profile, 'task.assign') && <Button size="sm" onClick={() => setTaskModal({ task: t })}>Edit</Button>}
            </div>
          ))}
        </Card>
      )}

      {tab === 'content' && (
        <Card>
          {!myContent.length && <Empty title="Tiada content" />}
          {myContent.map((c) => (
            <Link key={c.id} to={`/content/${c.id}`} className="list-row">
              <span className="small muted strong" style={{ width: 80 }}>{c.code}</span>
              <span className="grow min0 strong">{c.title || c.slotLabel || 'Slot kosong'}</span>
              <span className="small muted">{c.ownerStaffId === id ? 'Pemilik' : mine.filter((t) => t.contentId === c.id).map((t) => findOpt(TASK_ROLES, t.role).label).join(', ')}</span>
              <ContentStatusPill value={c.status} />
            </Link>
          ))}
        </Card>
      )}

      {tab === 'campaigns' && (
        <Card>
          {!myCampaigns.length && <Empty title="Tiada kempen" />}
          {myCampaigns.map((c) => (
            <Link key={c.id} to={`/campaigns/${c.id}`} className="list-row">
              <span className="grow strong">{c.name}</span>
              <span className="small muted">{c.managerStaffId === id ? 'Campaign Manager' : (c.team || []).filter((m) => m.staffId === id).map((m) => m.role).join(', ') || 'Ada tugasan'}</span>
              <CampaignStatusPill value={c.status} />
            </Link>
          ))}
        </Card>
      )}

      {tab === 'history' && (
        <Card title="8 minggu lepas" subtitle="Tugasan ikut deadline minggu tersebut. Ini rekod operasi, bukan skor prestasi staf.">
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Minggu</th><th className="num">Tugasan</th><th className="num">Anggaran jam</th><th className="num">Siap</th><th className="num">Tepat masa</th><th style={{ width: 200 }}>Beban</th></tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.wk}><td>{fmtDate(h.wk)}</td><td className="num">{h.due}</td><td className="num">{h.hours} jam</td><td className="num">{h.done}</td><td className="num">{h.onTime}</td><td><Bar pct={s.weeklyCapacity ? (h.hours / s.weeklyCapacity) * 100 : 0} /></td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}

      <TaskModal open={!!taskModal} onClose={() => setTaskModal(null)} task={taskModal?.task} presetStaffId={taskModal?.presetStaffId} />
      <StaffModal open={editOpen} onClose={() => setEditOpen(false)} staff={s} />
    </div>
  );
}
