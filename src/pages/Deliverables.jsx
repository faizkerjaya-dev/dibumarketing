// Semua deliverable creator merentas kempen. Klik baris untuk edit, revisi dan rekod prestasi.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, UserPlus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { can } from '../lib/permissions';
import { DELIVERABLE_STATUSES, DELIVERABLE_DONE } from '../lib/constants';
import { fmtDate, today, addDays } from '../lib/dates';
import { PageHeader, Card, Button, Select, SearchInput, Loading, Empty } from '../components/ui';
import { DeliverableStatusPill } from '../components/pills';
import DeliverableModal from '../components/DeliverableModal';
import AssignmentModal from '../components/AssignmentModal';

export default function Deliverables() {
  const { deliverables, campaigns, creators, ready } = useData();
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState({ q: '', campaignId: '', creatorId: '', status: 'open', due: '' });
  const [delModal, setDelModal] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const canEdit = can(profile, 'campaign.creators');
  const t0 = today();

  useEffect(() => {
    if (params.get('assign')) { setAssignOpen(true); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const rows = useMemo(() => deliverables
    .filter((d) => (f.status === 'open' ? !DELIVERABLE_DONE.includes(d.status) : !f.status || d.status === f.status))
    .filter((d) => !f.campaignId || d.campaignId === f.campaignId)
    .filter((d) => !f.creatorId || d.creatorId === f.creatorId)
    .filter((d) => !f.q || `${d.creatorName} ${d.type} ${d.code} ${d.description || ''}`.toLowerCase().includes(f.q.toLowerCase()))
    .filter((d) => {
      if (!f.due) return true;
      const due = d.draftDue || d.publishDue;
      if (f.due === 'overdue') return due && due < t0 && !DELIVERABLE_DONE.includes(d.status);
      return due && due >= t0 && due <= addDays(t0, Number(f.due));
    })
    .sort((a, b) => (a.draftDue || '9999').localeCompare(b.draftDue || '9999')), [deliverables, f, t0]);

  if (!ready) return <div className="page"><Loading /></div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="page">
      <PageHeader title="Deliverable creator" actions={canEdit && <>
        <Button icon={UserPlus} onClick={() => setAssignOpen(true)}>Tugaskan creator</Button>
        <Button variant="primary" icon={Plus} onClick={() => setDelModal({})}>Deliverable baharu</Button>
      </>} />
      <div className="toolbar">
        <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Cari creator atau jenis" />
        <Select value={f.campaignId} onChange={set('campaignId')} options={campaigns.map((c) => ({ value: c.id, label: c.name }))} placeholder="Semua kempen" />
        <Select value={f.creatorId} onChange={set('creatorId')} options={creators.map((c) => ({ value: c.id, label: c.name }))} placeholder="Semua creator" />
        <Select value={f.status} onChange={set('status')} options={[{ value: 'open', label: 'Belum siap' }, ...DELIVERABLE_STATUSES.map((s) => ({ value: s.key, label: s.label }))]} placeholder="Semua status" />
        <Select value={f.due} onChange={set('due')} options={[{ value: 'overdue', label: 'Lewat' }, { value: '7', label: 'Dalam 7 hari' }, { value: '30', label: 'Dalam 30 hari' }]} placeholder="Semua tarikh" />
      </div>
      <Card>
        {!rows.length ? <Empty title="Tiada deliverable" text="Tambah creator ke kempen, kemudian cipta deliverable." /> : (
          <div className="table-wrap"><table className="table" style={{ minWidth: 900 }}>
            <thead><tr><th>Deliverable</th><th>Creator</th><th>Kempen</th><th>Draf siap</th><th>Approval</th><th>Terbit</th><th className="num">Pembetulan</th><th>Status</th></tr></thead>
            <tbody>{rows.map((d) => {
              const late = d.draftDue && d.draftDue < t0 && ['brief_sent', 'in_production', 'revision'].includes(d.status);
              return (
                <tr key={d.id} className="clickable" onClick={() => setDelModal({ deliverable: d })}>
                  <td><strong>{d.type}</strong><div className="small muted">{d.code} · {d.platform}</div></td>
                  <td>{d.creatorName}</td>
                  <td>{d.campaignName}</td>
                  <td className={late ? 'danger-text' : ''}>{fmtDate(d.draftDue)}</td>
                  <td>{fmtDate(d.approvalDue)}</td>
                  <td>{fmtDate(d.publishDue)}</td>
                  <td className="num">{d.revisionCount || 0}</td>
                  <td><DeliverableStatusPill value={d.status} /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
      <DeliverableModal open={!!delModal} onClose={() => setDelModal(null)} deliverable={delModal?.deliverable} />
      <AssignmentModal open={assignOpen} onClose={() => setAssignOpen(false)} />
    </div>
  );
}
