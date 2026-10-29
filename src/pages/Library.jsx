// Pustaka link: semua link (Google Drive, Docs, post) di satu tempat.
//   - Link yang dilampirkan pada content (disimpan dalam rekod content itu).
//   - Link umum yang tidak berkait dengan content tertentu (koleksi libraryLinks),
//     contohnya folder aset jenama, panduan logo, template Canva.
// Fail besar disimpan di Google Drive; sistem simpan link sahaja.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, doc, deleteDoc } from 'firebase/firestore';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useFirestore';
import { can } from '../lib/permissions';
import { addLibraryLink, removeLink } from '../lib/db';
import { fmtDate } from '../lib/dates';
import { PageHeader, Card, Select, SearchInput, Segmented, Loading, Empty, Button, Modal, Field, Input, Textarea, ErrorBox, useConfirm } from '../components/ui';

const EMPTY = { url: '', label: '', category: '', contentId: '', campaignId: '', notes: '' };

function AddLinkModal({ open, onClose }) {
  const { content, contentById, campaigns } = useData();
  const config = useConfig();
  const { profile } = useAuth();
  const { run } = useToast();
  const [f, setF] = useState(EMPTY);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const options = content
    .filter((c) => !c.isSlot && !c.archived && (!q || `${c.code} ${c.title}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || ''))
    .slice(0, 200)
    .map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` }));
  const save = async (again) => {
    setBusy(true);
    const ok = await run(() => addLibraryLink(f, { profile, contentById }), 'Link ditambah');
    setBusy(false);
    if (!ok) return;
    if (again) setF({ ...EMPTY, contentId: f.contentId, category: f.category, campaignId: f.campaignId });
    else { setF(EMPTY); setQ(''); onClose(); }
  };
  return (
    <Modal open onClose={onClose} title="Tambah link" footer={<>
      <Button onClick={onClose}>Batal</Button>
      <Button busy={busy} disabled={!f.url} onClick={() => save(true)}>Simpan dan tambah lagi</Button>
      <Button variant="primary" busy={busy} disabled={!f.url} onClick={() => save(false)}>Simpan</Button>
    </>}>
      <Field label="Link" required hint="Tampal link Google Drive, Docs, Canva atau post."><Input type="url" autoFocus value={f.url} onChange={set('url')} placeholder="https://drive.google.com/…" /></Field>
      <div className="grid-2">
        <Field label="Nama link"><Input value={f.label} onChange={set('label')} placeholder="Contoh: Raw footage shoot 28 Okt" /></Field>
        <Field label="Kategori"><Select value={f.category} onChange={set('category')} options={config.linkCategories} placeholder="Tiada kategori" /></Field>
      </div>
      <Field label="Pautkan ke content" hint="Pilihan. Kosongkan untuk link umum (contoh: folder aset jenama).">
        <div className="col gap-xs">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari tajuk atau kod content" aria-label="Cari content" />
          <Select value={f.contentId} onChange={set('contentId')} options={options} placeholder="Link umum (tiada content)" />
        </div>
      </Field>
      {!f.contentId && (
        <div className="grid-2">
          <Field label="Kempen"><Select value={f.campaignId} onChange={set('campaignId')} options={campaigns.map((c) => ({ value: c.id, label: c.name }))} placeholder="Tiada kempen" /></Field>
          <Field label="Nota"><Textarea rows={1} value={f.notes} onChange={set('notes')} /></Field>
        </div>
      )}
    </Modal>
  );
}

export default function Library() {
  const { content, campaigns, campaignById, ready } = useData();
  const config = useConfig();
  const { profile } = useAuth();
  const { run } = useToast();
  const [confirm, confirmEl] = useConfirm();
  const [view, setView] = useState('grid');
  const [addOpen, setAddOpen] = useState(false);
  const [f, setF] = useState({ q: '', category: '', campaignId: '', platform: '', contentId: '', kind: '' });
  const generalQ = useQuery(useMemo(() => collection(db, 'libraryLinks'), []), []);
  const canAdd = can(profile, 'library.add');
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('add')) { setAddOpen(true); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const links = useMemo(() => {
    const all = [];
    content.forEach((c) => {
      (c.links || []).forEach((l) => all.push({ ...l, key: `${c.id}-${l.id}`, content: c, campaignId: c.campaignId, campaignName: c.campaignName }));
      if (c.publishUrl) all.push({ id: `pub-${c.id}`, key: `pub-${c.id}`, label: `Post terbit: ${c.title}`, url: c.publishUrl, category: 'Post terbit', addedAt: c.publishedDate, content: c, campaignId: c.campaignId, campaignName: c.campaignName, readonly: true });
    });
    generalQ.data.forEach((l) => all.push({ ...l, key: `g-${l.id}`, general: true, campaignName: campaignById[l.campaignId]?.name || '' }));
    const q = f.q.toLowerCase();
    return all
      .filter((l) => !f.kind || (f.kind === 'general' ? l.general : !l.general))
      .filter((l) => !f.category || l.category === f.category)
      .filter((l) => !f.campaignId || l.campaignId === f.campaignId)
      .filter((l) => !f.platform || l.content?.platform === f.platform)
      .filter((l) => !f.contentId || l.content?.id === f.contentId)
      .filter((l) => !q || `${l.label} ${l.content?.title || ''} ${l.content?.code || ''} ${l.notes || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  }, [content, f, generalQ.data, campaignById]);

  if (!ready) return <div className="page"><Loading /></div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const canRemove = (l) => !l.readonly && (can(profile, 'settings.manage') || l.authorUid === profile.uid || (!l.general && can(profile, 'content.edit')));
  const remove = async (l) => {
    if (!(await confirm(`Buang link “${l.label}”? Fail di Google Drive tidak terjejas.`, { title: 'Buang link', okLabel: 'Buang', danger: true }))) return;
    await run(() => (l.general ? deleteDoc(doc(db, 'libraryLinks', l.id)) : removeLink(l.content, l.id, profile)), 'Link dibuang');
  };
  const where = (l) => (l.content
    ? <Link to={`/content/${l.content.id}`} className="small muted" style={{ fontWeight: 500 }}>{l.content.code} · {l.content.title}</Link>
    : <span className="small muted">Link umum{l.notes ? ` · ${l.notes}` : ''}</span>);

  return (
    <div className="page">
      <PageHeader title="Pustaka link" actions={<>
        <Segmented value={view} onChange={setView} options={[{ key: 'grid', label: 'Grid' }, { key: 'list', label: 'Senarai' }]} />
        {canAdd && <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Tambah link</Button>}
      </>}>
        <p className="muted small" style={{ marginTop: 4 }}>{links.length} link. Fail disimpan di Google Drive; di sini simpan link sahaja.</p>
      </PageHeader>
      <div className="toolbar">
        <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Cari link" />
        <Select value={f.kind} onChange={set('kind')} options={[{ value: 'content', label: 'Link content' }, { value: 'general', label: 'Link umum' }]} placeholder="Semua jenis" aria-label="Jenis link" />
        <Select value={f.category} onChange={set('category')} options={[...config.linkCategories, 'Post terbit']} placeholder="Semua kategori" aria-label="Kategori" />
        <Select value={f.campaignId} onChange={set('campaignId')} options={campaigns.map((c) => ({ value: c.id, label: c.name }))} placeholder="Semua kempen" aria-label="Kempen" />
        <Select value={f.platform} onChange={set('platform')} options={config.platforms} placeholder="Semua platform" aria-label="Platform" />
      </div>
      <ErrorBox error={generalQ.error} />
      {!links.length && <Card><Empty title="Belum ada link" text="Tekan Tambah link untuk simpan link Google Drive, Canva atau post." action={canAdd && <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Tambah link</Button>} /></Card>}
      {view === 'grid' ? (
        <div className="lib-grid">
          {links.map((l) => (
            <div key={l.key} className="lib-card">
              <div className="row gap-sm"><span className="tag">{l.category || 'Link'}</span><span className="grow" /><span className="small muted">{l.addedAt ? fmtDate(l.addedAt.slice(0, 10)) : ''}</span>
                {canRemove(l) && <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label={`Buang ${l.label}`} onClick={() => remove(l)}><Trash2 size={14} /></button>}
              </div>
              <a href={l.url} target="_blank" rel="noreferrer" className="row gap-sm"><ExternalLink size={16} /><span className="ellipsis">{l.label}</span></a>
              {where(l)}
              {l.campaignName && <span className="small muted">{l.campaignName}</span>}
            </div>
          ))}
        </div>
      ) : links.length > 0 && (
        <Card>
          <div className="table-wrap"><table className="table" style={{ minWidth: 760 }}>
            <thead><tr><th>Link</th><th>Kategori</th><th>Content</th><th>Kempen</th><th>Ditambah</th><th /></tr></thead>
            <tbody>{links.map((l) => (
              <tr key={l.key}>
                <td><a href={l.url} target="_blank" rel="noreferrer">{l.label}</a></td>
                <td>{l.category || '—'}</td>
                <td>{where(l)}</td>
                <td>{l.campaignName || '—'}</td>
                <td className="small">{l.addedBy || ''} {l.addedAt ? fmtDate(l.addedAt.slice(0, 10)) : ''}</td>
                <td className="right">{canRemove(l) && <button type="button" className="icon-btn" aria-label={`Buang ${l.label}`} onClick={() => remove(l)}><Trash2 size={15} /></button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}
      <AddLinkModal open={addOpen} onClose={() => setAddOpen(false)} />
      {confirmEl}
    </div>
  );
}
