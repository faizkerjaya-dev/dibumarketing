// Dashboard pengurus. Semua angka dikira dari rekod sebenar.
// Slot kosong (tiada tajuk) TIDAK dikira di mana-mana sini.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useQuery } from '../hooks/useFirestore';
import { stageOf, isArchived } from '../lib/statuses';
import { can } from '../lib/permissions';
import { DELIVERABLE_DONE, money, findOpt, TASK_ROLES } from '../lib/constants';
import { today, monthStart, monthEnd, monthLabel, monthShort, inRange, addDays, fmtDate, parseDate, relDue, fmtDateTime } from '../lib/dates';
import { staffWorkload, BANDS } from '../lib/workload';
import { PageHeader, Card, Stat, Bar, Pill, Avatar, Loading, Empty, ErrorBox } from '../components/ui';
import { CampaignStatusPill } from '../components/pills';

const STAGE_TONE = { idea: 'gray', production: 'blue', review: 'amber', ready: 'teal', published: 'green' };
const STAGE_NAME = { idea: 'Idea', production: 'Produksi', review: 'Semakan', ready: 'Sedia terbit', published: 'Terbit' };

export default function Dashboard() {
  const { profile } = useAuth();
  const config = useConfig();
  const d = useData();
  const t0 = today();
  const now = new Date();
  const [mFrom, mTo] = [monthStart(now.getFullYear(), now.getMonth()), monthEnd(now.getFullYear(), now.getMonth())];

  const actQ = useMemo(() => query(collection(db, 'activity'), orderBy('createdAt', 'desc'), limit(12)), []);
  const activity = useQuery(actQ, [actQ]);

  const s = useMemo(() => {
    const real = d.content.filter((c) => !c.archived && !c.isSlot && !isArchived(config, c.status));
    const month = real.filter((c) => inRange(c.publishDate, mFrom, mTo));
    const slots = d.content.filter((c) => c.isSlot && inRange(c.publishDate, mFrom, mTo));
    const at = (stage) => month.filter((c) => stageOf(config, c.status) === stage);
    const openTasks = d.tasks.filter((t) => t.status !== 'done');
    const overdueIds = new Set([
      ...real.filter((c) => stageOf(config, c.status) !== 'published' && c.publishDate && c.publishDate < t0).map((c) => c.id),
      ...openTasks.filter((t) => t.contentId && t.deadline && t.deadline < t0).map((t) => t.contentId),
    ]);
    const loads = d.staff.filter((x) => x.status !== 'inactive').map((x) => ({ staff: x, w: staffWorkload(x, d.tasks) }));
    const reviewed = month.filter((c) => stageOf(config, c.status) === 'published' && c.review?.outcome);
    return {
      month,
      slots: slots.length,
      published: at('published').length,
      production: at('production').length,
      review: at('review').length,
      reviewAll: real.filter((c) => stageOf(config, c.status) === 'review').length,
      overdue: overdueIds.size,
      campaigns: d.campaigns.filter((c) => c.status === 'active'),
      creatorsActive: d.creators.filter((c) => ['active', 'confirmed'].includes(c.status)).length,
      loads: loads.sort((x, y) => (y.w.pct ?? -1) - (x.w.pct ?? -1)),
      alerts: loads.filter((l) => ['over', 'near'].includes(l.w.band)).length,
      fyp: reviewed.filter((c) => c.review.outcome === 'fyp').length,
      reviewed: reviewed.length,
      byStage: ['idea', 'production', 'review', 'ready', 'published'].map((k) => [STAGE_NAME[k], at(k).length, STAGE_TONE[k], k]),
    };
  }, [d, config, mFrom, mTo, t0]);

  const deadlines = useMemo(() => {
    const until = addDays(t0, 14);
    const items = [];
    d.tasks.filter((t) => t.status !== 'done' && t.deadline && t.deadline <= until).forEach((t) => items.push({
      date: t.deadline, title: t.contentTitle || t.description || 'Tugasan', kind: findOpt(TASK_ROLES, t.role).label, who: t.staffName, to: t.contentId ? `/content/${t.contentId}` : `/team/${t.staffId}`,
    }));
    d.content.filter((c) => !c.archived && !c.isSlot && stageOf(config, c.status) !== 'published' && c.publishDate && c.publishDate <= until).forEach((c) => items.push({
      date: c.publishDate, title: c.title, kind: 'Terbit', who: c.ownerName, to: `/content/${c.id}`,
    }));
    d.deliverables.filter((x) => !DELIVERABLE_DONE.includes(x.status)).forEach((x) => {
      const due = ['approved', 'scheduled'].includes(x.status) ? x.publishDue : x.draftDue;
      if (due && due <= until) items.push({ date: due, title: `${x.creatorName} · ${x.type}`, kind: 'Deliverable creator', who: x.campaignName, to: '/deliverables' });
    });
    d.creators.filter((c) => c.contractExpiry && c.contractExpiry >= t0 && c.contractExpiry <= addDays(t0, 30)).forEach((c) => items.push({
      date: c.contractExpiry, title: `Kontrak ${c.name}`, kind: 'Kontrak tamat', who: c.relationshipOwnerName, to: `/creators/${c.id}`,
    }));
    d.campaignCreators.filter((x) => x.fee > 0 && x.paymentStatus !== 'paid').forEach((x) => items.push({
      date: x.deadline || null, title: `${x.creatorName}, ${money(x.fee - (x.paidAmount || 0))} belum bayar`, kind: 'Bayaran', who: x.campaignName, to: `/campaigns/${x.campaignId}`,
    }));
    return items.sort((x, y) => (x.date || '9999').localeCompare(y.date || '9999')).slice(0, 10);
  }, [d, config, t0]);

  if (!d.ready) return <div className="page"><Loading /></div>;
  const total = s.byStage.reduce((n, x) => n + x[1], 0);

  return (
    <div className="page">
      <PageHeader title={`Hai, ${(profile.name || '').split(' ')[0] || 'anda'}`} crumb={`Ringkasan ${monthLabel(now.getFullYear(), now.getMonth())}`} />
      {can(profile, 'content.approve') && s.reviewAll > 0 && (
        <div className="warnbox row" style={{ alignItems: 'center' }}>
          <div><strong>{s.reviewAll} content menunggu kelulusan anda</strong><span>Luluskan sekaligus ikut hari atau minggu.</span></div>
          <span className="grow" />
          <Link to="/approvals" className="btn btn-primary btn-sm">Buka Kelulusan</Link>
        </div>
      )}
      <div className="stats">
        <Stat label="Content dirancang" value={s.month.length} hint={s.slots ? `${s.slots} slot belum ada tajuk` : 'Tarikh terbit bulan ini'} />
        <Stat label="Sudah terbit" value={s.published} hint={s.month.length ? `${Math.round((s.published / s.month.length) * 100)}% daripada rancangan` : '—'} />
        <Stat label="Lewat" value={s.overdue} tone={s.overdue ? 'red' : undefined} hint="Terbit atau tugasan lewat" />
        <Stat label="Kempen aktif" value={s.campaigns.length} hint={`${s.creatorsActive} creator aktif`} />
        <Stat label="Amaran beban kerja" value={s.alerts} tone={s.alerts ? 'amber' : undefined} hint="Staf 90% ke atas" />
        <Stat label="Kadar FYP" value={s.reviewed ? `${Math.round((s.fyp / s.reviewed) * 100)}%` : '—'} hint={s.reviewed ? `${s.fyp} daripada ${s.reviewed} disemak` : 'Belum ada semakan'} />
      </div>

      <div className="split">
        <div className="main">
          <Card title="Content bulan ini" actions={<><Link to="/calendar">Buka kalendar</Link><Link to="/pipeline">Buka papan kerja</Link></>}>
            {total ? (
              <div className="stackbar">{s.byStage.filter((x) => x[1]).map(([l, n, tone]) => <div key={l} className={`fill-${tone}`} style={{ flex: n }} title={`${l}: ${n}`} />)}</div>
            ) : <p className="muted small">Tiada content dengan tarikh terbit bulan ini.</p>}
            <div className="stage-tiles">
              {s.byStage.map(([l, n, tone, stage]) => (
                <Link key={l} to={`/pipeline?stage=${stage}`} className="stat" title={`Buka ${l} dalam Papan kerja`}>
                  <span className="row gap-sm small muted"><span className={`dot dot-${tone}`} />{l}</span>
                  <span className="stat-value">{n}</span>
                </Link>
              ))}
            </div>
          </Card>
          <div className="split">
            <Card title="Beban kerja pasukan" subtitle="Anggaran jam minggu ini berbanding kapasiti" actions={<Link to="/team">Buka pasukan</Link>} className="main">
              {!s.loads.length && <Empty title="Belum ada staf" text="Tambah staf dalam Pasukan." />}
              {s.loads.slice(0, 6).map(({ staff, w }) => (
                <Link key={staff.id} to={`/team/${staff.id}`} className="list-row">
                  <Avatar name={staff.name} />
                  <div className="grow min0 col gap-xs">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="strong">{staff.name} <span className="muted" style={{ fontWeight: 400 }}>· {staff.jobTitle}</span></span>
                      <span className="muted small">{w.hasHours ? `${w.hours}/${w.cap}j · ${w.pct}%` : `${w.counted} tugasan`}</span>
                    </div>
                    <Bar pct={w.pct ?? 0} tone={BANDS[w.band].tone === 'gray' ? 'gray' : BANDS[w.band].tone} />
                  </div>
                  <span className="band-pill"><Pill tone={BANDS[w.band].tone}>{BANDS[w.band].label}</Pill></span>
                </Link>
              ))}
            </Card>
            <Card title="Kempen aktif" actions={<Link to="/campaigns">Semua kempen</Link>} className="side">
              {!s.campaigns.length && <p className="muted small">Tiada kempen aktif.</p>}
              {s.campaigns.map((c) => {
                const spend = d.campaignCreators.filter((x) => x.campaignId === c.id).reduce((n, x) => n + (x.paidAmount || 0), 0) + (c.expenses || []).reduce((n, e) => n + (Number(e.amount) || 0), 0);
                const list = d.content.filter((x) => x.campaignId === c.id && !x.archived && !x.isSlot);
                return (
                  <Link key={c.id} to={`/campaigns/${c.id}`} className="list-row col" style={{ alignItems: 'stretch' }}>
                    <div className="row gap-sm" style={{ justifyContent: 'space-between' }}><strong>{c.name}</strong><CampaignStatusPill value={c.status} /></div>
                    <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>Belanja {money(spend)} dari {money(c.budget)}</span><span>{list.filter((x) => stageOf(config, x.status) === 'published').length}/{list.length} terbit</span></div>
                    <Bar pct={c.budget ? (spend / c.budget) * 100 : 0} />
                  </Link>
                );
              })}
            </Card>
          </div>
        </div>
        <div className="side">
          <Card title="Deadline terdekat" subtitle="14 hari akan datang, termasuk yang lewat">
            {!deadlines.length && <p className="muted small">Tiada deadline dalam 14 hari.</p>}
            {deadlines.map((x, i) => {
              const late = x.date && x.date < t0;
              const tone = late ? 'red' : x.date === t0 ? 'amber' : 'gray';
              return (
                <Link key={i} to={x.to} className="list-row">
                  <div className={`datebox tone-${tone}`}>
                    <span>{x.date ? monthShort(x.date).toUpperCase() : '—'}</span>
                    <span>{x.date ? parseDate(x.date).getDate() : ''}</span>
                  </div>
                  <div className="grow min0"><div className="strong ellipsis">{x.title}</div><div className="small muted ellipsis">{x.kind}{x.who ? ` · ${x.who}` : ''}</div></div>
                  <span className={late ? 'danger-text small' : 'small muted'}>{x.date ? relDue(x.date) : 'Tiada tarikh'}</span>
                </Link>
              );
            })}
          </Card>
          <Card title="Aktiviti terkini">
            {activity.loading && <Loading />}
            <ErrorBox error={activity.error} />
            {!activity.loading && !activity.data.length && <p className="muted small">Belum ada aktiviti.</p>}
            <div className="col gap">
              {activity.data.map((x) => (
                <div key={x.id} className="row gap-sm" style={{ alignItems: 'flex-start' }}>
                  <span className="dot dot-brand" style={{ marginTop: 6 }} />
                  <div><div>{x.message}</div><div className="small muted">{fmtDateTime(x.createdAtIso)}</div></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <p className="muted small">Content tanpa tarikh terbit dan slot tanpa tajuk tidak dikira dalam angka bulanan. {fmtDate(mFrom)} – {fmtDate(mTo)}.</p>
    </div>
  );
}
