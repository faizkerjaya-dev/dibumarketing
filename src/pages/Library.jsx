// Content Library: semua link (Drive / Docs / post) yang dilampirkan pada content.
// Upload fail terus ditangguhkan; fail disimpan di Google Drive dan link ditampal di sini.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { fmtDate } from '../lib/dates';
import { PageHeader, Card, Select, SearchInput, Segmented, Loading, Empty } from '../components/ui';

export default function Library() {
  const { content, campaigns, ready } = useData();
  const config = useConfig();
  const [view, setView] = useState('grid');
  const [f, setF] = useState({ q: '', category: '', campaignId: '', platform: '', contentId: '' });

  const links = useMemo(() => {
    const all = [];
    content.forEach((c) => {
      (c.links || []).forEach((l) => all.push({ ...l, content: c }));
      if (c.publishUrl) all.push({ id: `pub-${c.id}`, label: `Published: ${c.title}`, url: c.publishUrl, category: 'Published content', addedAt: c.publishedDate, content: c });
    });
    const q = f.q.toLowerCase();
    return all
      .filter((l) => !f.category || l.category === f.category)
      .filter((l) => !f.campaignId || l.content.campaignId === f.campaignId)
      .filter((l) => !f.platform || l.content.platform === f.platform)
      .filter((l) => !f.contentId || l.content.id === f.contentId)
      .filter((l) => !q || `${l.label} ${l.content.title} ${l.content.code}`.toLowerCase().includes(q))
      .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  }, [content, f]);

  if (!ready) return <div className="page"><Loading /></div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="page">
      <PageHeader title="Pustaka link" actions={<Segmented value={view} onChange={setView} options={[{ key: 'grid', label: 'Grid' }, { key: 'list', label: 'List' }]} />}>
        <p className="muted small" style={{ marginTop: 4 }}>Semua link yang dilampirkan pada content. Untuk tambah link, buka content › tab Links.</p>
      </PageHeader>
      <div className="toolbar">
        <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Cari link" />
        <Select value={f.category} onChange={set('category')} options={[...config.linkCategories, 'Published content']} placeholder="Semua kategori" />
        <Select value={f.campaignId} onChange={set('campaignId')} options={campaigns.map((c) => ({ value: c.id, label: c.name }))} placeholder="Semua kempen" />
        <Select value={f.platform} onChange={set('platform')} options={config.platforms} placeholder="Semua platform" />
        <Select value={f.contentId} onChange={set('contentId')} options={content.map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` }))} placeholder="Semua content" />
      </div>
      {!links.length && <Card><Empty title="Belum ada link" text="Tampal link Google Drive dalam tab Links pada content." /></Card>}
      {view === 'grid' ? (
        <div className="lib-grid">
          {links.map((l) => (
            <div key={`${l.content.id}-${l.id}`} className="lib-card">
              <div className="row gap-sm"><span className="tag">{l.category || 'Link'}</span><span className="grow" /><span className="small muted">{l.addedAt ? fmtDate(l.addedAt.slice(0, 10)) : ''}</span></div>
              <a href={l.url} target="_blank" rel="noreferrer" className="row gap-sm"><ExternalLink size={16} /><span className="ellipsis">{l.label}</span></a>
              <Link to={`/content/${l.content.id}`} className="small muted" style={{ fontWeight: 500 }}>{l.content.code} · {l.content.title}</Link>
              {l.content.campaignName && <span className="small muted">{l.content.campaignName}</span>}
            </div>
          ))}
        </div>
      ) : links.length > 0 && (
        <Card>
          <div className="table-wrap"><table className="table" style={{ minWidth: 720 }}>
            <thead><tr><th>Link</th><th>Kategori</th><th>Content</th><th>Kempen</th><th>Ditambah</th></tr></thead>
            <tbody>{links.map((l) => (
              <tr key={`${l.content.id}-${l.id}`}>
                <td><a href={l.url} target="_blank" rel="noreferrer">{l.label}</a></td>
                <td>{l.category || '—'}</td>
                <td><Link to={`/content/${l.content.id}`}>{l.content.code}</Link> {l.content.title}</td>
                <td>{l.content.campaignName || '—'}</td>
                <td>{l.addedBy || ''} {l.addedAt ? fmtDate(l.addedAt.slice(0, 10)) : ''}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}
    </div>
  );
}
