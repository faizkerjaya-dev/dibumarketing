import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { stageOf } from '../lib/statuses';
import { can } from '../lib/permissions';
import { CAMPAIGN_STATUSES, DELIVERABLE_DONE, money } from '../lib/constants';
import { fmtDate } from '../lib/dates';
import { PageHeader, Card, Button, Select, SearchInput, Bar, Loading, Empty } from '../components/ui';
import { CampaignStatusPill } from '../components/pills';

// Dikongsi dengan halaman lain: kira bajet, perbelanjaan dan progres sesuatu kempen dari rekod sebenar.
export function campaignStats(c, { content, campaignCreators, deliverables }, config) {
  const items = content.filter((x) => x.campaignId === c.id && !x.archived && !x.isSlot);
  const assigns = campaignCreators.filter((a) => a.campaignId === c.id);
  const dels = deliverables.filter((d) => d.campaignId === c.id);
  const expenses = (c.expenses || []).reduce((n, e) => n + (Number(e.amount) || 0), 0);
  const paid = assigns.reduce((n, a) => n + (Number(a.paidAmount) || 0), 0);
  const committed = assigns.reduce((n, a) => n + (Number(a.fee) || 0), 0);
  return {
    items,
    assigns,
    dels,
    spend: paid + expenses,
    committed: committed + expenses,
    published: items.filter((x) => stageOf(config, x.status) === 'published').length,
    confirmed: assigns.filter((a) => ['signed'].includes(a.contractStatus)).length,
    delDone: dels.filter((d) => DELIVERABLE_DONE.includes(d.status)).length,
  };
}

export default function Campaigns() {
  const data = useData();
  const config = useConfig();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('start');

  const rows = useMemo(() => data.campaigns
    .filter((c) => (status ? c.status === status : c.status !== 'archived'))
    .filter((c) => `${c.name} ${c.code}`.toLowerCase().includes(q.toLowerCase()))
    .map((c) => ({ c, s: campaignStats(c, data, config) }))
    .sort((a, b) => (sort === 'budget' ? (b.c.budget || 0) - (a.c.budget || 0) : sort === 'name' ? a.c.name.localeCompare(b.c.name) : (b.c.startDate || '').localeCompare(a.c.startDate || ''))), [data, q, status, sort]);

  if (!data.ready) return <div className="page"><Loading /></div>;

  return (
    <div className="page">
      <PageHeader title="Kempen" actions={can(profile, 'campaign.manage') && <Button variant="primary" icon={Plus} onClick={() => navigate('/campaigns/new')}>Kempen baharu</Button>} />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Cari kempen" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} options={CAMPAIGN_STATUSES} placeholder="Semua kecuali arkib" />
        <Select value={sort} onChange={(e) => setSort(e.target.value)} options={[{ value: 'start', label: 'Sort: newest' }, { value: 'budget', label: 'Sort: budget' }, { value: 'name', label: 'Sort: name' }]} />
      </div>
      <Card>
        {!rows.length ? <Empty title="Tiada kempen" text="Cipta kempen pertama untuk mula." /> : (
          <div className="table-wrap"><table className="table" style={{ minWidth: 900 }}>
            <thead><tr><th>Kempen</th><th>Tempoh</th><th>Pengurus</th><th className="num">Budget</th><th className="num">Actual spend</th><th style={{ width: 140 }}>Content</th><th style={{ width: 140 }}>Creator deliverables</th><th>Status</th></tr></thead>
            <tbody>{rows.map(({ c, s }) => (
              <tr key={c.id} className="clickable" onClick={() => navigate(`/campaigns/${c.id}`)}>
                <td><strong>{c.name}</strong><div className="small muted">{c.code}</div></td>
                <td className="small">{fmtDate(c.startDate)} – {fmtDate(c.endDate, { year: 'numeric' })}</td>
                <td>{c.managerName || '—'}</td>
                <td className="num">{money(c.budget)}</td>
                <td className="num">{money(s.spend)}</td>
                <td><div className="small muted">{s.published}/{s.items.length} published</div><Bar pct={s.items.length ? (s.published / s.items.length) * 100 : 0} /></td>
                <td><div className="small muted">{s.delDone}/{s.dels.length} done</div><Bar pct={s.dels.length ? (s.delDone / s.dels.length) * 100 : 0} tone="teal" /></td>
                <td><CampaignStatusPill value={c.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
