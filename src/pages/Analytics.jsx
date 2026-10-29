// Laporan: content, kempen, creator dan staf. Semua angka dari rekod sebenar; data tiada dipaparkan sebagai "—".
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection } from 'firebase/firestore';
import { Download } from 'lucide-react';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { stageOf } from '../lib/statuses';
import { useQuery } from '../hooks/useFirestore';
import { DELIVERABLE_DONE, REVIEW_OUTCOMES, findOpt, money, num } from '../lib/constants';
import { today, monthStart, monthEnd, inRange, fmtDate } from '../lib/dates';
import { latestByTarget, sumMetrics, engagement, engagementRate, pct } from '../lib/metrics';
import { downloadCsv } from '../lib/csv';
import { PageHeader, Card, Tabs, Button, Field, Input, Select, Stat, Loading, ErrorBox, Empty } from '../components/ui';
import { ReviewPill } from '../components/pills';
import { campaignStats } from './Campaigns';
import FollowersReport from './reports/FollowersReport';
import EngagementReport from './reports/EngagementReport';

export default function Analytics() {
  const data = useData();
  const { content, campaigns, creators, staff, tasks, deliverables, campaignCreators, ready } = data;
  const config = useConfig();
  const now = new Date();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'content';
  const setTab = (t) => setParams({ tab: t }, { replace: true });
  const statsQ = useQuery(useMemo(() => collection(db, 'accountStats'), []), []);
  const [f, setF] = useState({ from: monthStart(now.getFullYear(), now.getMonth()), to: monthEnd(now.getFullYear(), now.getMonth()), platform: '', campaignId: '', pillar: '', ownerStaffId: '', creatorId: '' });
  const mq = useMemo(() => collection(db, 'metrics'), []);
  const metrics = useQuery(mq, [mq]);
  const latest = useMemo(() => latestByTarget(metrics.data), [metrics.data]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const contentRows = useMemo(() => content
    .filter((c) => !c.isSlot && stageOf(config, c.status) === 'published' && inRange(c.publishedDate || c.publishDate, f.from, f.to))
    .filter((c) => (!f.platform || c.platform === f.platform) && (!f.campaignId || c.campaignId === f.campaignId) && (!f.pillar || c.pillar === f.pillar) && (!f.ownerStaffId || c.ownerStaffId === f.ownerStaffId))
    .map((c) => ({ c, m: latest[c.id] })), [content, f, latest, config]);
  const cTotals = sumMetrics(contentRows.map((r) => r.m));
  const reviewed = contentRows.filter((r) => r.c.review?.outcome);

  const campaignRows = useMemo(() => campaigns
    .filter((c) => c.status !== 'archived' && (!f.campaignId || c.id === f.campaignId))
    .map((c) => {
      const s = campaignStats(c, data, config);
      const targets = [...s.items.map((x) => x.id), ...s.dels.map((d) => d.id)];
      const t = sumMetrics(targets.map((id) => latest[id]));
      return { c, s, t };
    }), [campaigns, data, config, latest, f.campaignId]);

  const creatorRows = useMemo(() => creators
    .filter((cr) => !f.creatorId || cr.id === f.creatorId)
    .map((cr) => {
      const dels = deliverables.filter((d) => d.creatorId === cr.id && (!f.campaignId || d.campaignId === f.campaignId) && (!f.platform || d.platform === f.platform));
      const fee = campaignCreators.filter((a) => a.creatorId === cr.id && (!f.campaignId || a.campaignId === f.campaignId)).reduce((n, a) => n + (a.fee || 0), 0);
      const t = sumMetrics(dels.map((d) => latest[d.id]));
      return { cr, dels, done: dels.filter((d) => DELIVERABLE_DONE.includes(d.status)).length, fee, t };
    })
    .filter((r) => r.dels.length), [creators, deliverables, campaignCreators, latest, f]);

  const staffRows = useMemo(() => staff.map((s) => {
    const mine = tasks.filter((t) => t.staffId === s.id && inRange(t.deadline, f.from, f.to) && (!f.campaignId || t.campaignId === f.campaignId));
    const done = mine.filter((t) => t.status === 'done');
    return {
      s,
      assigned: mine.length,
      completed: done.length,
      overdue: mine.filter((t) => t.status !== 'done' && t.deadline < today()).length,
      onTime: done.filter((t) => t.completedAt && t.completedAt <= t.deadline).length,
      hours: mine.reduce((n, t) => n + (Number(t.estHours) || 0), 0),
      cap: Number(s.weeklyCapacity) || 0,
    };
  }).filter((r) => r.assigned), [staff, tasks, f]);

  if (!ready) return <div className="page"><Loading /></div>;

  const exportContent = () => downloadCsv(`content_${f.from}_${f.to}.csv`, [
    { label: 'Kod', value: (r) => r.c.code }, { label: 'Tajuk', value: (r) => r.c.title }, { label: 'Platform', value: (r) => r.c.platform }, { label: 'Kategori', value: (r) => r.c.pillar },
    { label: 'Pemilik', value: (r) => r.c.ownerName }, { label: 'Kempen', value: (r) => r.c.campaignName }, { label: 'Tarikh terbit', value: (r) => r.c.publishedDate || r.c.publishDate },
    { label: 'Tontonan', value: (r) => r.m?.views ?? '' }, { label: 'Suka', value: (r) => r.m?.likes ?? '' }, { label: 'Komen', value: (r) => r.m?.comments ?? '' },
    { label: 'Kongsi', value: (r) => r.m?.shares ?? '' }, { label: 'Simpan', value: (r) => r.m?.saves ?? '' }, { label: 'Kadar engagement %', value: (r) => (engagementRate(r.m) == null ? '' : engagementRate(r.m).toFixed(2)) },
    { label: 'Semakan', value: (r) => (r.c.review ? findOpt(REVIEW_OUTCOMES, r.c.review.outcome).label : '') }, { label: 'Tarikh data', value: (r) => r.m?.date || '' },
  ], contentRows);
  const exportCampaigns = () => downloadCsv('kempen.csv', [
    { label: 'Kempen', value: (r) => r.c.name }, { label: 'Bajet', value: (r) => r.c.budget || 0 }, { label: 'Belanja sebenar', value: (r) => r.s.spend }, { label: 'Baki', value: (r) => (r.c.budget || 0) - r.s.spend },
    { label: 'Content terbit', value: (r) => r.s.published }, { label: 'Jumlah content', value: (r) => r.s.items.length }, { label: 'Deliverable siap', value: (r) => r.s.delDone }, { label: 'Jumlah deliverable', value: (r) => r.s.dels.length },
    { label: 'Tontonan', value: (r) => r.t.views }, { label: 'Engagement', value: (r) => engagement(r.t) }, { label: 'Conversion', value: (r) => r.t.conversions },
  ], campaignRows);
  const exportCreators = () => downloadCsv('creator.csv', [
    { label: 'Creator', value: (r) => r.cr.name }, { label: 'Deliverable', value: (r) => r.dels.length }, { label: 'Siap', value: (r) => r.done }, { label: 'Fee', value: (r) => r.fee },
    { label: 'Tontonan', value: (r) => r.t.views }, { label: 'Engagement', value: (r) => engagement(r.t) }, { label: 'Kos setiap tontonan', value: (r) => (r.t.views ? (r.fee / r.t.views).toFixed(4) : '') },
    { label: 'Kos setiap engagement', value: (r) => (engagement(r.t) ? (r.fee / engagement(r.t)).toFixed(2) : '') }, { label: 'Conversion', value: (r) => r.t.conversions }, { label: 'Jualan (RM)', value: (r) => r.t.sales },
  ], creatorRows);
  const exportStaff = () => downloadCsv(`staf_${f.from}_${f.to}.csv`, [
    { label: 'Staf', value: (r) => r.s.name }, { label: 'Jawatan', value: (r) => r.s.jobTitle }, { label: 'Ditugaskan', value: (r) => r.assigned }, { label: 'Siap', value: (r) => r.completed },
    { label: 'Lewat', value: (r) => r.overdue }, { label: 'Siap tepat masa', value: (r) => r.onTime }, { label: 'Anggaran jam', value: (r) => r.hours },
  ], staffRows);

  return (
    <div className="page">
      <PageHeader title="Laporan" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'content', label: 'Content' }, { key: 'followers', label: 'Pengikut & trend' }, { key: 'engagement', label: 'Analisa content' }, { key: 'campaigns', label: 'Kempen' }, { key: 'creators', label: 'Creator' }, { key: 'staff', label: 'Staf' }]} />
      {tab === 'followers' && <FollowersReport stats={statsQ.data} metricsLatest={latest} error={statsQ.error} />}
      {tab === 'engagement' && <EngagementReport metrics={metrics.data} latest={latest} contentId={params.get('content')} onPick={(id) => setParams(id ? { tab: 'engagement', content: id } : { tab: 'engagement' }, { replace: true })} />}
      {!['followers', 'engagement'].includes(tab) && <Card>
        <div className="grid-3">
          <Field label="Dari"><Input type="date" value={f.from} onChange={set('from')} /></Field>
          <Field label="Hingga"><Input type="date" value={f.to} onChange={set('to')} /></Field>
          <Field label="Platform"><Select value={f.platform} onChange={set('platform')} options={config.platforms} placeholder="Semua" /></Field>
          <Field label="Kempen"><Select value={f.campaignId} onChange={set('campaignId')} options={campaigns.map((c) => ({ value: c.id, label: c.name }))} placeholder="Semua" /></Field>
          <Field label="Kategori content"><Select value={f.pillar} onChange={set('pillar')} options={config.pillars} placeholder="Semua" /></Field>
          <Field label="Pemilik content"><Select value={f.ownerStaffId} onChange={set('ownerStaffId')} options={staff.map((s) => ({ value: s.id, label: s.name }))} placeholder="Semua" /></Field>
          <Field label="Creator"><Select value={f.creatorId} onChange={set('creatorId')} options={creators.map((c) => ({ value: c.id, label: c.name }))} placeholder="Semua" /></Field>
        </div>
      </Card>}
      {metrics.loading && <Loading text="Memuatkan data prestasi…" />}
      <ErrorBox error={metrics.error} />

      {tab === 'content' && <>
        <div className="stats stats-4">
          <Stat label="Content terbit" value={contentRows.length} hint={`${fmtDate(f.from)} – ${fmtDate(f.to)} · ${cTotals.count} ada data prestasi`} />
          <Stat label="Jumlah tontonan" value={cTotals.count ? num(cTotals.views) : '—'} />
          <Stat label="Capaian" value={cTotals.reach ? num(cTotals.reach) : '—'} />
          <Stat label="Engagement" value={cTotals.count ? num(engagement(cTotals)) : '—'} />
          <Stat label="Kadar engagement" value={cTotals.views ? pct((engagement(cTotals) / cTotals.views) * 100) : '—'} />
          <Stat label="Kongsi / Simpan" value={cTotals.count ? `${num(cTotals.shares)} / ${num(cTotals.saves)}` : '—'} />
          <Stat label="Klik / Conversion" value={cTotals.count ? `${num(cTotals.clicks)} / ${num(cTotals.conversions)}` : '—'} />
          <Stat label="Kadar FYP" value={reviewed.length ? `${Math.round((reviewed.filter((r) => r.c.review.outcome === 'fyp').length / reviewed.length) * 100)}%` : '—'} hint={`${reviewed.length} disemak`} />
        </div>
        <Card title="Content yang terbit" actions={<Button size="sm" icon={Download} onClick={exportContent} disabled={!contentRows.length}>Eksport CSV</Button>}>
          {!contentRows.length ? <Empty title="Tiada content terbit dalam tempoh ini" /> : (
            <div className="table-wrap"><table className="table" style={{ minWidth: 820 }}>
              <thead><tr><th>Content</th><th>Platform</th><th>Terbit</th><th className="num">Tontonan</th><th className="num">Engagement</th><th className="num">Kadar eng.</th><th>Semakan</th></tr></thead>
              <tbody>{contentRows.map(({ c, m }) => (
                <tr key={c.id}><td><Link to={`/analytics?tab=engagement&content=${c.id}`} title="Analisa engagement">{c.title}</Link><div className="small muted">{c.code} · {c.ownerName}</div></td><td>{c.platform}</td><td>{fmtDate(c.publishedDate || c.publishDate)}</td>
                  <td className="num">{m ? num(m.views) : '—'}</td><td className="num">{m ? num(engagement(m)) : '—'}</td><td className="num">{pct(engagementRate(m))}</td><td><ReviewPill review={c.review} showNone /></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </>}

      {tab === 'campaigns' && (
        <Card title="Prestasi kempen" subtitle="Bajet dan perbelanjaan sepanjang kempen (tidak ditapis ikut tarikh)." actions={<Button size="sm" icon={Download} onClick={exportCampaigns} disabled={!campaignRows.length}>Eksport CSV</Button>}>
          {!campaignRows.length ? <Empty title="Tiada kempen" /> : (
            <div className="table-wrap"><table className="table" style={{ minWidth: 900 }}>
              <thead><tr><th>Kempen</th><th className="num">Bajet</th><th className="num">Belanja</th><th className="num">Baki</th><th className="num">Content</th><th className="num">Deliverable</th><th className="num">Tontonan</th><th className="num">Engagement</th><th className="num">Conversion</th></tr></thead>
              <tbody>{campaignRows.map(({ c, s, t }) => (
                <tr key={c.id}><td><Link to={`/campaigns/${c.id}`}>{c.name}</Link></td><td className="num">{money(c.budget)}</td><td className="num">{money(s.spend)}</td><td className={`num${(c.budget || 0) - s.spend < 0 ? ' danger-text' : ''}`}>{money((c.budget || 0) - s.spend)}</td>
                  <td className="num">{s.published}/{s.items.length}</td><td className="num">{s.delDone}/{s.dels.length}</td><td className="num">{t.count ? num(t.views) : '—'}</td><td className="num">{t.count ? num(engagement(t)) : '—'}</td><td className="num">{t.count ? num(t.conversions) : '—'}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === 'creators' && (
        <Card title="Prestasi creator" subtitle="Kos setiap tontonan = jumlah fee ÷ tontonan deliverable yang ada data." actions={<Button size="sm" icon={Download} onClick={exportCreators} disabled={!creatorRows.length}>Eksport CSV</Button>}>
          {!creatorRows.length ? <Empty title="Tiada deliverable" /> : (
            <div className="table-wrap"><table className="table" style={{ minWidth: 900 }}>
              <thead><tr><th>Creator</th><th className="num">Deliverable</th><th className="num">Fee</th><th className="num">Tontonan</th><th className="num">Kadar eng.</th><th className="num">Kos / tontonan</th><th className="num">Kos / engagement</th><th className="num">Conversion</th><th className="num">Jualan</th></tr></thead>
              <tbody>{creatorRows.map(({ cr, dels, done, fee, t }) => (
                <tr key={cr.id}><td><Link to={`/creators/${cr.id}`}>{cr.name}</Link></td><td className="num">{done}/{dels.length}</td><td className="num">{money(fee)}</td><td className="num">{t.count ? num(t.views) : '—'}</td>
                  <td className="num">{t.views ? pct((engagement(t) / t.views) * 100) : '—'}</td><td className="num">{t.views && fee ? `RM ${(fee / t.views).toFixed(3)}` : '—'}</td>
                  <td className="num">{engagement(t) && fee ? `RM ${(fee / engagement(t)).toFixed(2)}` : '—'}</td><td className="num">{t.count ? num(t.conversions) : '—'}</td><td className="num">{t.sales ? money(t.sales) : '—'}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === 'staff' && (
        <Card title="Operasi staf" subtitle="Tugasan dengan deadline dalam tempoh dipilih. Ini metrik operasi, bukan skor prestasi; kerumitan tugasan berbeza." actions={<Button size="sm" icon={Download} onClick={exportStaff} disabled={!staffRows.length}>Eksport CSV</Button>}>
          {!staffRows.length ? <Empty title="Tiada tugasan dalam tempoh ini" /> : (
            <div className="table-wrap"><table className="table" style={{ minWidth: 760 }}>
              <thead><tr><th>Staf</th><th className="num">Ditugaskan</th><th className="num">Siap</th><th className="num">Lewat</th><th className="num">Siap tepat masa</th><th className="num">Anggaran jam</th></tr></thead>
              <tbody>{staffRows.map((r) => (
                <tr key={r.s.id}><td><Link to={`/team/${r.s.id}`}>{r.s.name}</Link><div className="small muted">{r.s.jobTitle}</div></td><td className="num">{r.assigned}</td><td className="num">{r.completed}</td>
                  <td className={`num${r.overdue ? ' danger-text' : ''}`}>{r.overdue}</td><td className="num">{r.completed ? `${Math.round((r.onTime / r.completed) * 100)}%` : '—'}</td><td className="num">{r.hours} jam</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      )}
    </div>
  );
}
