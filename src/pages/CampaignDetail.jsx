// Butiran kempen: content dipautkan, pasukan dalaman, creator & deliverable, bajet, prestasi dan aktiviti.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { Pencil, Plus, Link2, Trash2, Unlink } from 'lucide-react';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useFirestore';
import { can } from '../lib/permissions';
import { updateById, logActivity } from '../lib/db';
import { CAMPAIGN_TEAM_ROLES, money, num, uid } from '../lib/constants';
import { fmtDate, fmtDateTime, today } from '../lib/dates';
import { latestByTarget, sumMetrics, engagement, pct } from '../lib/metrics';
import { PageHeader, Card, Tabs, Button, Stat, Bar, KeyVal, Modal, Field, Input, Select, Avatar, Loading, Empty, ErrorBox, useConfirm } from '../components/ui';
import { CampaignStatusPill, ContentStatusPill, DeliverableStatusPill, ContractPill, PaymentPill, CreatorStatusPill, ReviewPill } from '../components/pills';
import AssignmentModal from '../components/AssignmentModal';
import DeliverableModal from '../components/DeliverableModal';
import { campaignStats } from './Campaigns';

function AttachContentModal({ open, onClose, campaign }) {
  const { content, contentById } = useData();
  const { profile } = useAuth();
  const { run } = useToast();
  const [sel, setSel] = useState('');
  const options = content.filter((c) => !c.archived && !c.isSlot && c.campaignId !== campaign.id).map((c) => ({ value: c.id, label: `${c.code} · ${c.title}${c.campaignName ? ` (kini: ${c.campaignName})` : ''}` }));
  const save = async () => {
    const ok = await run(async () => {
      await updateById('content', sel, { campaignId: campaign.id, campaignName: campaign.name }, profile);
      await logActivity(profile, { type: 'content_attached', message: `${profile.name} lampirkan “${contentById[sel]?.title || 'content'}” ke ${campaign.name}`, refType: 'campaign', refId: campaign.id });
    }, 'Content dilampirkan');
    if (ok) { setSel(''); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Lampir content sedia ada" footer={<><Button onClick={onClose}>Batal</Button><Button variant="primary" disabled={!sel} onClick={save}>Lampir</Button></>}>
      <p className="muted small">Content hanya ada satu kempen utama. Jika content sudah dalam kempen lain, ia akan dipindahkan ke kempen ini. Tiada rekod berganda dicipta.</p>
      <Field label="Content"><Select value={sel} onChange={(e) => setSel(e.target.value)} options={options} placeholder="Pilih content" /></Field>
    </Modal>
  );
}

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const data = useData();
  const { campaignById, staff, staffById, creatorById, ready } = data;
  const { profile } = useAuth();
  const config = useConfig();
  const { run } = useToast();
  const [confirm, confirmEl] = useConfirm();
  const [tab, setTab] = useState('overview');
  const [attachOpen, setAttachOpen] = useState(false);
  const [assignModal, setAssignModal] = useState(null);
  const [delModal, setDelModal] = useState(null);
  const [member, setMember] = useState({ staffId: '', role: CAMPAIGN_TEAM_ROLES[1] });
  const [expense, setExpense] = useState({ label: '', amount: '', date: today() });

  const mq = useMemo(() => query(collection(db, 'metrics'), where('campaignId', '==', id)), [id]);
  const metrics = useQuery(mq, [mq]);
  const aq = useMemo(() => query(collection(db, 'activity'), where('refId', '==', id)), [id]);
  const activity = useQuery(aq, [aq]);

  const c = campaignById[id];
  if (!ready) return <div className="page"><Loading /></div>;
  if (!c) return <div className="page"><Empty title="Kempen tidak dijumpai" action={<Link to="/campaigns">Kembali</Link>} /></div>;

  const s = campaignStats(c, data, config);
  const canManage = can(profile, 'campaign.manage');
  const canCreators = can(profile, 'campaign.creators');
  const latest = latestByTarget(metrics.data);
  const totals = sumMetrics(Object.values(latest));
  const remaining = (c.budget || 0) - s.spend;

  const addMember = () => run(async () => {
    const st = staffById[member.staffId];
    if (!st) return;
    await updateById('campaigns', id, { team: [...(c.team || []), { id: uid(), staffId: st.id, staffName: st.name, role: member.role }] }, profile);
    setMember({ ...member, staffId: '' });
  }, 'Ahli pasukan ditambah');
  const removeMember = (mid) => run(() => updateById('campaigns', id, { team: (c.team || []).filter((m) => m.id !== mid) }, profile));
  const addExpense = () => run(async () => {
    if (!expense.label || !expense.amount) return;
    await updateById('campaigns', id, { expenses: [...(c.expenses || []), { id: uid(), label: expense.label, amount: Number(expense.amount), date: expense.date }] }, profile);
    setExpense({ label: '', amount: '', date: today() });
  }, 'Perbelanjaan ditambah');
  const removeExpense = async (eid) => {
    if (await confirm('Buang perbelanjaan ini?', { title: 'Buang perbelanjaan', okLabel: 'Buang', danger: true })) run(() => updateById('campaigns', id, { expenses: (c.expenses || []).filter((e) => e.id !== eid) }, profile));
  };
  const detach = async (item) => {
    if (await confirm(`Keluarkan “${item.title}” dari kempen ini? Content tidak dipadam.`, { title: 'Keluarkan dari kempen', okLabel: 'Keluarkan' })) run(() => updateById('content', item.id, { campaignId: '', campaignName: '' }, profile), 'Dikeluarkan');
  };

  return (
    <div className="page">
      <PageHeader crumb={<><Link to="/campaigns">Kempen</Link> / {c.code}</>} title={c.name} actions={<>
        {canManage && <Button icon={Pencil} onClick={() => navigate(`/campaigns/${id}/edit`)}>Edit</Button>}
        {canCreators && <Button variant="primary" icon={Plus} onClick={() => setAssignModal({})}>Tugaskan creator</Button>}
      </>}>
        <div className="row gap-sm wrap" style={{ marginTop: 8 }}>
          <CampaignStatusPill value={c.status} />
          <span className="muted small">{fmtDate(c.startDate)} – {fmtDate(c.endDate, { year: 'numeric' })} · Pengurus <strong>{c.managerName || '—'}</strong>{(c.platforms || []).length > 0 && ` · ${c.platforms.join(', ')}`}</span>
        </div>
      </PageHeader>
      <div className="stats">
        <Stat label="Bajet" value={money(c.budget)} />
        <Stat label="Belanja sebenar" value={money(s.spend)} hint={c.budget ? `${Math.round((s.spend / c.budget) * 100)}% daripada bajet` : undefined} />
        <Stat label="Baki bajet" value={money(remaining)} tone={remaining < 0 ? 'red' : undefined} hint={`${money(s.committed)} sudah komited`} />
        <Stat label="Content" value={`${s.published}/${s.items.length}`} hint="terbit / dirancang" />
        <Stat label="Creator disahkan" value={`${s.confirmed}/${s.assigns.length}`} hint="kontrak ditandatangan" />
        <Stat label="Deliverable belum siap" value={s.dels.length - s.delDone} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Ringkasan' }, { key: 'content', label: 'Content', count: s.items.length }, { key: 'team', label: 'Pasukan dalaman', count: (c.team || []).length },
        { key: 'creators', label: 'Creator dan deliverable', count: s.assigns.length }, { key: 'budget', label: 'Bajet' }, { key: 'performance', label: 'Prestasi' }, { key: 'activity', label: 'Aktiviti' },
      ]} />

      {tab === 'overview' && (
        <div className="split">
          <Card title="Brief kempen" className="main">
            <KeyVal items={[['Objektif', c.objective], ['Sasaran audiens', c.targetAudience], ['Produk', (c.products || []).join(', ')], ['Kategori content', (c.pillars || []).join(', ')]]} />
            {c.description && <p className="pre-line" style={{ marginTop: 12 }}>{c.description}</p>}
          </Card>
          <Card title="Kemajuan" className="side">
            <div className="col gap">
              <div><div className="row small" style={{ justifyContent: 'space-between' }}><span>Content terbit</span><strong>{s.published}/{s.items.length}</strong></div><Bar pct={s.items.length ? (s.published / s.items.length) * 100 : 0} /></div>
              <div><div className="row small" style={{ justifyContent: 'space-between' }}><span>Deliverable siap</span><strong>{s.delDone}/{s.dels.length}</strong></div><Bar pct={s.dels.length ? (s.delDone / s.dels.length) * 100 : 0} tone="teal" /></div>
              <div><div className="row small" style={{ justifyContent: 'space-between' }}><span>Bajet digunakan</span><strong>{money(s.spend)}</strong></div><Bar pct={c.budget ? (s.spend / c.budget) * 100 : 0} tone={remaining < 0 ? 'red' : 'brand'} /></div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'content' && (
        <Card title="Content kempen" actions={can(profile, 'content.edit') && <>
          <Button size="sm" icon={Link2} onClick={() => setAttachOpen(true)}>Lampir sedia ada</Button>
          {can(profile, 'content.create') && <Button size="sm" icon={Plus} onClick={() => navigate(`/calendar?add=1&campaign=${id}`)}>Content baharu</Button>}
        </>}>
          {!s.items.length && <Empty title="Belum ada content" text="Lampirkan content sedia ada atau cipta yang baharu." />}
          {s.items.map((x) => (
            <div key={x.id} className="list-row wrap">
              <span className="small muted strong" style={{ width: 80, flex: 'none' }}>{x.code}</span>
              <Link to={`/content/${x.id}`} className="grow min0" style={{ color: 'var(--text)', flexBasis: 200 }}>{x.title}</Link>
              <span className="small muted">{x.platform} · {x.publishDate ? fmtDate(x.publishDate) : 'Tiada tarikh'}</span>
              <ContentStatusPill value={x.status} /><ReviewPill review={x.review} />
              {can(profile, 'content.edit') && <button type="button" className="icon-btn" aria-label="Keluarkan dari kempen" title="Keluarkan dari kempen" onClick={() => detach(x)}><Unlink size={16} /></button>}
            </div>
          ))}
        </Card>
      )}

      {tab === 'team' && (
        <Card title="Pasukan dalaman">
          {c.managerName && <div className="list-row"><Avatar name={c.managerName} size={30} /><strong className="grow">{c.managerName}</strong><span className="muted small">Pengurus kempen</span></div>}
          {(c.team || []).map((m) => (
            <div key={m.id} className="list-row"><Avatar name={m.staffName} size={30} /><Link to={`/team/${m.staffId}`} className="grow" style={{ color: 'var(--text)' }}>{m.staffName}</Link><span className="muted small">{m.role}</span>
              {canManage && <button type="button" className="icon-btn" aria-label={`Buang ${m.staffName}`} onClick={() => removeMember(m.id)}><Trash2 size={16} /></button>}</div>
          ))}
          {canManage && (
            <div className="grid-3" style={{ marginTop: 12, alignItems: 'end' }}>
              <Field label="Staf"><Select value={member.staffId} onChange={(e) => setMember({ ...member, staffId: e.target.value })} options={staff.map((x) => ({ value: x.id, label: x.name }))} placeholder="Pilih" /></Field>
              <Field label="Peranan"><Select value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value })} options={CAMPAIGN_TEAM_ROLES} /></Field>
              <Button icon={Plus} onClick={addMember} disabled={!member.staffId}>Tambah ke pasukan</Button>
            </div>
          )}
        </Card>
      )}

      {tab === 'creators' && (
        <div className="col gap-lg">
          <p className="muted small">Status hubungan disimpan pada creator. Setiap deliverable ada deadline, revisi dan status sendiri.</p>
          {!s.assigns.length && <Card><Empty title="Belum ada creator" action={canCreators && <Button variant="primary" onClick={() => setAssignModal({})}>Tugaskan creator</Button>} /></Card>}
          {s.assigns.map((a) => {
            const dels = s.dels.filter((d) => d.assignmentId === a.id);
            const cr = creatorById[a.creatorId];
            return (
              <Card key={a.id} pad={false}>
                <div className="row gap wrap card-pad" style={{ background: 'var(--surface-2)', borderRadius: '12px 12px 0 0' }}>
                  <Avatar name={a.creatorName} size={36} />
                  <div className="grow min0" style={{ flexBasis: 200 }}>
                    <Link to={`/creators/${a.creatorId}`} style={{ color: 'var(--text)' }}>{a.creatorName}</Link>
                    <div className="small muted">Fee {money(a.fee)} · Dibayar {money(a.paidAmount)} · Pemilik {a.ownerName || '—'}{a.briefDate ? ` · Brief ${fmtDate(a.briefDate)}` : ''}</div>
                  </div>
                  {cr && <CreatorStatusPill value={cr.status} />}
                  <ContractPill value={a.contractStatus} /><PaymentPill value={a.paymentStatus} />
                  {canCreators && <><Button size="sm" onClick={() => setAssignModal({ assignment: a })}>Edit</Button><Button size="sm" icon={Plus} onClick={() => setDelModal({ assignmentId: a.id })}>Deliverable</Button></>}
                </div>
                <div className="table-wrap" style={{ padding: '0 20px 8px' }}>
                  {!dels.length ? <p className="muted small" style={{ padding: '12px 0' }}>Belum ada deliverable.</p> : (
                    <table className="table" style={{ minWidth: 620 }}>
                      <thead><tr><th>Deliverable</th><th>Draf siap</th><th>Terbit</th><th>Pembetulan</th><th>Status</th></tr></thead>
                      <tbody>{dels.map((d) => (
                        <tr key={d.id} className="clickable" onClick={() => setDelModal({ deliverable: d })}>
                          <td><strong>{d.type}</strong><div className="small muted">{d.platform} · {d.code}{d.description ? ` · ${d.description}` : ''}</div></td>
                          <td className={d.draftDue && d.draftDue < today() && ['brief_sent', 'in_production', 'revision'].includes(d.status) ? 'danger-text' : ''}>{fmtDate(d.draftDue)}</td>
                          <td>{fmtDate(d.publishDue)}</td>
                          <td>{d.revisionCount || 0}</td>
                          <td><DeliverableStatusPill value={d.status} /></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'budget' && (
        <div className="split">
          <Card title="Fee creator" className="main">
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Creator</th><th className="num">Fee dirunding</th><th className="num">Dibayar</th><th className="num">Baki</th><th>Bayaran</th></tr></thead>
              <tbody>{s.assigns.map((a) => <tr key={a.id}><td>{a.creatorName}</td><td className="num">{money(a.fee)}</td><td className="num">{money(a.paidAmount)}</td><td className="num">{money((a.fee || 0) - (a.paidAmount || 0))}</td><td><PaymentPill value={a.paymentStatus} /></td></tr>)}</tbody>
            </table></div>
            <p className="muted small" style={{ marginTop: 8 }}>Kemas kini bayaran melalui butang Edit dalam tab Creator dan deliverable.</p>
          </Card>
          <Card title="Perbelanjaan lain" subtitle="Produksi, ads boost, hadiah, dan lain-lain." className="side">
            {(c.expenses || []).map((e) => (
              <div key={e.id} className="list-row"><span className="grow">{e.label}<span className="small muted block">{fmtDate(e.date)}</span></span><strong>{money(e.amount)}</strong>
                {canManage && <button type="button" className="icon-btn" aria-label={`Buang ${e.label}`} onClick={() => removeExpense(e.id)}><Trash2 size={16} /></button>}</div>
            ))}
            {canManage && (
              <div className="col gap-sm" style={{ marginTop: 10 }}>
                <Field label="Item"><Input value={expense.label} onChange={(e) => setExpense({ ...expense, label: e.target.value })} placeholder="Ads boost" /></Field>
                <div className="grid-2"><Field label="Jumlah (RM)"><Input type="number" min="0" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} /></Field><Field label="Tarikh"><Input type="date" value={expense.date} onChange={(e) => setExpense({ ...expense, date: e.target.value })} /></Field></div>
                <Button icon={Plus} onClick={addExpense}>Tambah perbelanjaan</Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'performance' && (
        <Card title="Prestasi" subtitle="Jumlah angka terkini bagi setiap content dan deliverable dalam kempen ini. Diisi manual.">
          {metrics.loading && <Loading />}
          <ErrorBox error={metrics.error} />
          <div className="stats">
            <Stat label="Item ada data" value={totals.count} />
            <Stat label="Tontonan" value={num(totals.views)} />
            <Stat label="Engagement" value={num(engagement(totals))} />
            <Stat label="Kadar engagement" value={totals.views ? pct((engagement(totals) / totals.views) * 100) : '—'} />
            <Stat label="Conversion" value={num(totals.conversions)} />
            <Stat label="Kos setiap tontonan" value={totals.views && s.spend ? `RM ${(s.spend / totals.views).toFixed(3)}` : '—'} />
          </div>
          {!totals.count && <p className="muted small" style={{ marginTop: 10 }}>Belum ada data prestasi. Rekod melalui bahagian Semakan dan prestasi pada content, atau dalam deliverable.</p>}
        </Card>
      )}

      {tab === 'activity' && (
        <Card>
          {activity.loading && <Loading />}
          <ErrorBox error={activity.error} />
          {[...activity.data].sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || '')).map((a) => <div key={a.id} className="list-row"><Avatar name={a.actorName} size={28} /><span className="grow">{a.message}</span><span className="small muted">{fmtDateTime(a.createdAtIso)}</span></div>)}
          {!activity.loading && !activity.data.length && <p className="muted small">Tiada aktiviti.</p>}
        </Card>
      )}

      <AttachContentModal open={attachOpen} onClose={() => setAttachOpen(false)} campaign={c} />
      <AssignmentModal open={!!assignModal} onClose={() => setAssignModal(null)} campaignId={id} assignment={assignModal?.assignment} />
      <DeliverableModal open={!!delModal} onClose={() => setDelModal(null)} deliverable={delModal?.deliverable} assignmentId={delModal?.assignmentId} />
      {confirmEl}
    </div>
  );
}
