// Direktori creator luar (KOL, influencer, UGC, affiliate). Seorang creator boleh ada banyak tag.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { can } from '../lib/permissions';
import { CREATOR_STATUSES, money, num } from '../lib/constants';
import { PageHeader, Card, Button, Select, SearchInput, Avatar, Loading, Empty } from '../components/ui';
import { CreatorStatusPill } from '../components/pills';

const PAGE = 20;
const MAIN_TYPES = ['KOL', 'Influencer', 'UGC Creator', 'Affiliate'];

export function mainSocial(c) {
  return [...(c.socials || [])].sort((a, b) => (Number(b.followers) || 0) - (Number(a.followers) || 0))[0] || null;
}

export function rateLabel(c) {
  const r = c.rates || {};
  if (r.video) return `${money(r.video)} / video`;
  if (r.reel) return `${money(r.reel)} / reel`;
  if (r.ugc) return `${money(r.ugc)} / UGC`;
  if (r.affiliatePct) return `${r.affiliatePct}% commission`;
  return '—';
}

export default function Creators() {
  const { creators, campaignCreators, campaignById, ready } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const navigate = useNavigate();
  const [type, setType] = useState('');
  const [f, setF] = useState({ q: '', platform: '', niche: '', status: '' });
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(0);
  const [showArchived, setShowArchived] = useState(false);

  const activeCampaigns = useMemo(() => {
    const m = {};
    campaignCreators.forEach((a) => {
      const c = campaignById[a.campaignId];
      if (c && ['planning', 'active'].includes(c.status)) m[a.creatorId] = (m[a.creatorId] || 0) + 1;
    });
    return m;
  }, [campaignCreators, campaignById]);

  const list = useMemo(() => {
    const q = f.q.toLowerCase();
    return creators
      .filter((c) => showArchived || (!c.archived && c.status !== 'archived'))
      .filter((c) => !type || (c.tags || []).includes(type))
      .filter((c) => !q || `${c.name} ${c.displayName || ''} ${(c.socials || []).map((s) => s.username).join(' ')}`.toLowerCase().includes(q))
      .filter((c) => !f.platform || (c.socials || []).some((s) => s.platform === f.platform))
      .filter((c) => !f.niche || (c.tags || []).includes(f.niche))
      .filter((c) => !f.status || c.status === f.status)
      .sort((a, b) => {
        if (sort === 'followers') return (Number(mainSocial(b)?.followers) || 0) - (Number(mainSocial(a)?.followers) || 0);
        if (sort === 'er') return (Number(mainSocial(b)?.er) || 0) - (Number(mainSocial(a)?.er) || 0);
        return a.name.localeCompare(b.name);
      });
  }, [creators, type, f, sort, showArchived]);

  if (!ready) return <div className="page"><Loading /></div>;
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const rows = list.slice(page * PAGE, page * PAGE + PAGE);
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(0); };

  return (
    <div className="page">
      <PageHeader title="Creator" actions={can(profile, 'creator.manage') && <Button variant="primary" icon={Plus} onClick={() => navigate('/creators/new')}>Tambah creator</Button>} />
      <div className="chips">
        {['', ...MAIN_TYPES].map((t) => (
          <button key={t || 'all'} type="button" className={`chip${type === t ? ' on' : ''}`} onClick={() => { setType(t); setPage(0); }}>
            {t || 'All'} <span className="muted">{t ? creators.filter((c) => (c.tags || []).includes(t)).length : creators.length}</span>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <SearchInput value={f.q} onChange={(q) => { setF({ ...f, q }); setPage(0); }} placeholder="Cari nama atau username" />
        <Select value={f.platform} onChange={setFilter('platform')} options={config.platforms} placeholder="Semua platform" />
        <Select value={f.niche} onChange={setFilter('niche')} options={config.creatorTags.filter((t) => !MAIN_TYPES.includes(t))} placeholder="Semua niche" />
        <Select value={f.status} onChange={setFilter('status')} options={CREATOR_STATUSES} placeholder="Semua status" />
        <Select value={sort} onChange={(e) => setSort(e.target.value)} options={[{ value: 'name', label: 'Sort: name' }, { value: 'followers', label: 'Sort: followers' }, { value: 'er', label: 'Sort: engagement' }]} />
        <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Archived</label>
      </div>
      <Card>
        {!rows.length ? <Empty title="Tiada creator dijumpai" text="Tukar penapis atau tambah creator baru." /> : (
          <div className="table-wrap"><table className="table" style={{ minWidth: 860 }}>
            <thead><tr><th>Creator</th><th>Platform utama</th><th>Jenis</th><th className="num">Followers</th><th className="num">Eng. rate</th><th>Kadar</th><th>Status</th><th className="num">Active campaigns</th></tr></thead>
            <tbody>{rows.map((c) => {
              const m = mainSocial(c);
              return (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/creators/${c.id}`)}>
                  <td><span className="row gap-sm"><Avatar name={c.name} size={34} /><span><strong>{c.name}</strong><div className="small muted">{c.location || (c.tags || []).filter((t) => !MAIN_TYPES.includes(t)).join(', ')}</div></span></span></td>
                  <td>{m ? `${m.platform}${m.username ? ` · @${m.username.replace(/^@/, '')}` : ''}` : '—'}</td>
                  <td><span className="row gap-xs wrap">{(c.tags || []).filter((t) => MAIN_TYPES.includes(t)).map((t) => <span key={t} className="tag">{t}</span>)}</span></td>
                  <td className="num strong">{m?.followers ? num(m.followers) : '—'}</td>
                  <td className="num">{m?.er ? `${m.er}%` : '—'}</td>
                  <td>{rateLabel(c)}</td>
                  <td><CreatorStatusPill value={c.status} /></td>
                  <td className="num">{activeCampaigns[c.id] || 0}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <div className="row wrap gap-sm" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <span className="muted small">Showing {list.length ? page * PAGE + 1 : 0}–{Math.min((page + 1) * PAGE, list.length)} of {list.length}</span>
          <span className="row gap-sm"><Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelum</Button><Button size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Seterusnya</Button></span>
        </div>
      </Card>
    </div>
  );
}
