import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { Pencil, Archive, ExternalLink } from 'lucide-react';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useFirestore';
import { can } from '../lib/permissions';
import { updateById } from '../lib/db';
import { money, num, DELIVERABLE_DONE } from '../lib/constants';
import { fmtDate, fmtDateTime, today, addDays } from '../lib/dates';
import { latestByTarget, sumMetrics, engagement, pct } from '../lib/metrics';
import { PageHeader, Card, Tabs, Button, KeyVal, Loading, Empty, ErrorBox, Avatar, Stat, useConfirm } from '../components/ui';
import { CreatorStatusPill, DeliverableStatusPill, ContractPill, PaymentPill } from '../components/pills';
import { rateLabel } from './Creators';

export default function CreatorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { creatorById, campaignCreators, deliverables, campaignById, ready } = useData();
  const { profile } = useAuth();
  const { run } = useToast();
  const [confirm, confirmEl] = useConfirm();
  const [tab, setTab] = useState('overview');
  const c = creatorById[id];

  const mq = useMemo(() => query(collection(db, 'metrics'), where('creatorId', '==', id)), [id]);
  const metrics = useQuery(mq, [mq]);
  const aq = useMemo(() => query(collection(db, 'activity'), where('refId', '==', id)), [id]);
  const activity = useQuery(aq, [aq]);

  if (!ready) return <div className="page"><Loading /></div>;
  if (!c) return <div className="page"><Empty title="Creator tidak dijumpai" action={<Link to="/creators">Kembali</Link>} /></div>;

  const assignments = campaignCreators.filter((a) => a.creatorId === id);
  const dels = deliverables.filter((d) => d.creatorId === id).sort((a, b) => (a.draftDue || '9999').localeCompare(b.draftDue || '9999'));
  const latest = latestByTarget(metrics.data);
  const totals = sumMetrics(Object.values(latest));
  const totalFee = assignments.reduce((n, a) => n + (a.fee || 0), 0);
  const upcoming = dels.filter((d) => !DELIVERABLE_DONE.includes(d.status) && d.draftDue && d.draftDue <= addDays(today(), 30));
  const canManage = can(profile, 'creator.manage');

  const archive = async () => {
    if (!(await confirm(`Archive ${c.name}? Sejarah kempen dan deliverable kekal.`, { title: 'Archive creator', okLabel: 'Archive' }))) return;
    await run(() => updateById('creators', id, { status: 'archived', archived: true }, profile), 'Diarkibkan');
  };

  return (
    <div className="page">
      <PageHeader crumb={<Link to="/creators">Creator Management</Link>} title={c.name} actions={canManage && <>
        <Button icon={Pencil} onClick={() => navigate(`/creators/${id}/edit`)}>Edit</Button>
        {!c.archived && <Button icon={Archive} onClick={archive}>Arkib</Button>}
      </>}>
        <div className="row gap-sm wrap" style={{ marginTop: 8 }}>
          <span className="muted small">{c.code}</span>
          <CreatorStatusPill value={c.status} />
          {(c.tags || []).map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Ringkasan' }, { key: 'social', label: 'Profil sosial', count: (c.socials || []).length },
        { key: 'campaigns', label: 'Kempen', count: assignments.length }, { key: 'deliverables', label: 'Deliverable', count: dels.length },
        { key: 'performance', label: 'Prestasi' }, { key: 'contracts', label: 'Kontrak dan bayaran' }, { key: 'activity', label: 'Aktiviti' },
      ]} />

      {tab === 'overview' && (
        <div className="split">
          <div className="main">
            <Card title="Profil">
              <KeyVal items={[['Display name', c.displayName], ['Email', c.email], ['Phone', c.phone], ['Contact person', c.contactPerson], ['Location', c.location], ['Language', c.language], ['Relationship owner', c.relationshipOwnerName], ['Rate card', rateLabel(c)], ['First contact', c.firstContact && fmtDate(c.firstContact, { year: 'numeric' })], ['Last contact', c.lastContact && fmtDate(c.lastContact, { year: 'numeric' })], ['Communication', c.communicationStatus]]} />
              {c.notes && <p className="pre-line small" style={{ marginTop: 12 }}>{c.notes}</p>}
            </Card>
            <Card title="Audiens" subtitle={`Source: ${c.audience?.source || 'not stated'} · not verified`}>
              <KeyVal items={[['Age', c.audience?.age], ['Gender', c.audience?.gender], ['Geography', c.audience?.geo], ['Niche', c.audience?.niche]]} />
            </Card>
          </div>
          <div className="side">
            <Card title="Deadline terdekat">
              {!upcoming.length && <p className="muted small">Tiada deliverable dalam 30 hari.</p>}
              {upcoming.map((d) => <div key={d.id} className="list-row"><span className="grow"><strong>{d.type}</strong><span className="small muted block">{d.campaignName}</span></span><span className="small">Draft {fmtDate(d.draftDue)}</span></div>)}
            </Card>
            <Card title="Kerjasama aktif">
              {assignments.filter((a) => ['planning', 'active'].includes(campaignById[a.campaignId]?.status)).map((a) => (
                <Link key={a.id} to={`/campaigns/${a.campaignId}`} className="list-row"><span className="grow strong">{a.campaignName}</span><span className="small muted">{money(a.fee)}</span></Link>
              ))}
              {!assignments.length && <p className="muted small">Belum ada kempen.</p>}
            </Card>
          </div>
        </div>
      )}

      {tab === 'social' && (
        <Card>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Platform</th><th>Username</th><th className="num">Followers</th><th className="num">Eng. rate</th><th /></tr></thead>
            <tbody>{(c.socials || []).map((s, i) => <tr key={s.id || i}><td>{s.platform}</td><td>{s.username}</td><td className="num">{num(s.followers)}</td><td className="num">{s.er != null ? `${s.er}%` : '—'}</td><td className="right">{s.url && <a href={s.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a>}</td></tr>)}</tbody>
          </table></div>
        </Card>
      )}

      {tab === 'campaigns' && (
        <Card>
          {!assignments.length && <Empty title="Belum ada kempen" />}
          {assignments.map((a) => {
            const ds = deliverables.filter((d) => d.assignmentId === a.id);
            return (
              <Link key={a.id} to={`/campaigns/${a.campaignId}`} className="list-row wrap">
                <span className="grow strong" style={{ flexBasis: 200 }}>{a.campaignName}</span>
                <span className="small">Fee {money(a.fee)}</span>
                <span className="small muted">{ds.filter((d) => DELIVERABLE_DONE.includes(d.status)).length}/{ds.length} delivered</span>
                <ContractPill value={a.contractStatus} /><PaymentPill value={a.paymentStatus} />
              </Link>
            );
          })}
        </Card>
      )}

      {tab === 'deliverables' && (
        <Card>
          {!dels.length && <Empty title="Tiada deliverable" />}
          {dels.map((d) => (
            <div key={d.id} className="list-row wrap">
              <span className="grow" style={{ flexBasis: 200 }}><strong>{d.type}</strong><span className="small muted block">{d.campaignName} · {d.platform}</span></span>
              <span className="small">Draft {fmtDate(d.draftDue)} · Publish {fmtDate(d.publishDue)}</span>
              {d.publishedUrl && <a href={d.publishedUrl} target="_blank" rel="noreferrer" className="small">Post</a>}
              <span className="small muted">{d.revisionCount || 0} rev</span>
              <DeliverableStatusPill value={d.status} />
            </div>
          ))}
        </Card>
      )}

      {tab === 'performance' && (
        <Card title="Prestasi" subtitle="Angka terkini setiap deliverable, diisi manual.">
          {metrics.loading && <Loading />}
          <ErrorBox error={metrics.error} />
          <div className="stats">
            <Stat label="Deliverables with data" value={totals.count} />
            <Stat label="Views" value={num(totals.views)} />
            <Stat label="Engagement rate" value={totals.views ? pct((engagement(totals) / totals.views) * 100) : '—'} />
            <Stat label="Cost per view" value={totals.views && totalFee ? `RM ${(totalFee / totals.views).toFixed(3)}` : '—'} hint="Total fee ÷ views" />
            <Stat label="Conversions" value={num(totals.conversions)} />
            <Stat label="Sales" value={totals.sales ? money(totals.sales) : '—'} />
          </div>
        </Card>
      )}

      {tab === 'contracts' && (
        <Card title="Kontrak dan bayaran">
          <KeyVal items={[['Contract status', <ContractPill key="c" value={c.contractStatus} />], ['Contract expiry', c.contractExpiry && fmtDate(c.contractExpiry, { year: 'numeric' })], ['Payment details', c.paymentDetailsStatus === 'on_file' ? 'On file' : 'Not received']]} />
          <div className="table-wrap" style={{ marginTop: 14 }}><table className="table">
            <thead><tr><th>Kempen</th><th className="num">Negotiated fee</th><th className="num">Paid</th><th>Kontrak</th><th>Bayaran</th></tr></thead>
            <tbody>{assignments.map((a) => <tr key={a.id}><td>{a.campaignName}</td><td className="num">{money(a.fee)}</td><td className="num">{money(a.paidAmount)}</td><td><ContractPill value={a.contractStatus} /></td><td><PaymentPill value={a.paymentStatus} /></td></tr>)}</tbody>
          </table></div>
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
      {confirmEl}
    </div>
  );
}
