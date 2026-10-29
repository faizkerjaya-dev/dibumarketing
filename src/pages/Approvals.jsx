// Kelulusan pukal. Semua content di peringkat "Semakan" dalam satu senarai, dikumpul ikut tarikh terbit.
// Pilih banyak sekaligus (satu hari / satu minggu / semua) → Luluskan atau Minta pembetulan.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Undo2, ExternalLink } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/permissions';
import { bulkApprove, bulkReturn } from '../lib/db';
import { stageOf, statusForStage } from '../lib/statuses';
import { missingForStatus, FIELD_LABELS } from '../lib/workflow';
import { slug } from '../lib/constants';
import { typeColor, OTHER } from '../lib/colors';
import { today, addDays, startOfWeek, fmtDate, relDue } from '../lib/dates';
import { PageHeader, Card, Button, Segmented, Select, Avatar, Loading, Empty, Modal, Field, Textarea, Pill } from '../components/ui';

export default function Approvals() {
  const { content, tasks, staff, staffById, staffColor, ready } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const { run, success, error } = useToast();
  const [scope, setScope] = useState('week');
  const [owner, setOwner] = useState('');
  const [platform, setPlatform] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [note, setNote] = useState('');
  const canApprove = can(profile, 'content.approve');
  const t0 = today();
  const weekEnd = addDays(startOfWeek(t0), 6);

  const pending = useMemo(() => content.filter((c) => !c.archived && !c.isSlot && stageOf(config, c.status) === 'review'), [content, config]);
  const list = useMemo(() => pending
    .filter((c) => (scope === 'today' ? c.publishDate && c.publishDate <= addDays(t0, 1) : scope === 'week' ? c.publishDate && c.publishDate <= weekEnd : true))
    .filter((c) => (!owner || c.ownerStaffId === owner) && (!platform || c.platform === platform))
    .sort((a, b) => `${a.publishDate || '9999'}${a.publishTime || ''}`.localeCompare(`${b.publishDate || '9999'}${b.publishTime || ''}`)), [pending, scope, owner, platform, t0, weekEnd]);

  const groups = useMemo(() => {
    const m = new Map();
    list.forEach((c) => { const k = c.publishDate || ''; m.set(k, [...(m.get(k) || []), c]); });
    return [...m.entries()];
  }, [list]);

  const taskInfo = useMemo(() => {
    const m = {};
    tasks.forEach((t) => { if (!t.contentId) return; const x = (m[t.contentId] = m[t.contentId] || { n: 0, done: 0 }); x.n += 1; if (t.status === 'done') x.done += 1; });
    return m;
  }, [tasks]);

  if (!ready) return <div className="page"><Loading /></div>;

  const visibleIds = new Set(list.map((c) => c.id));
  const selected = [...sel].filter((id) => visibleIds.has(id)).map((id) => list.find((c) => c.id === id));
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setMany = (ids, on) => setSel((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  const allOn = list.length > 0 && list.every((c) => sel.has(c.id));
  const checklist = config.checklist.map((label) => slug(label));
  const missingFor = (c, statusKey) => missingForStatus(config, c, statusKey);
  const readyKey = statusForStage(config, 'ready');

  const approve = async () => {
    setBusy(true);
    const res = await run(() => bulkApprove(selected, { config, profile, staffById, missingFor }));
    setBusy(false);
    if (!res) return;
    setSel(new Set());
    if (!res.skipped.length) { success(`${res.approved} content diluluskan`); return; }
    const codes = res.skipped.map((c) => c.code).slice(0, 5).join(', ');
    error({ code: 'validation', message: `${res.approved} diluluskan, ${res.skipped.length} dilangkau kerana belum cukup syarat (${codes}${res.skipped.length > 5 ? '…' : ''}). Lengkapkan tarikh terbit dan pemilik dahulu.` });
  };

  const sendBack = async () => {
    setBusy(true);
    const n = await run(() => bulkReturn(selected, note, { config, profile, staffById }), `${selected.length} content dipulangkan untuk pembetulan`);
    setBusy(false);
    if (n) { setSel(new Set()); setReturnOpen(false); setNote(''); }
  };

  const scopeCount = (k) => pending.filter((c) => (k === 'today' ? c.publishDate && c.publishDate <= addDays(t0, 1) : k === 'week' ? c.publishDate && c.publishDate <= weekEnd : true)).length;

  return (
    <div className="page">
      <PageHeader title="Kelulusan">
        <p className="muted small" style={{ marginTop: 4 }}>{pending.length} content menunggu kelulusan. Pilih banyak sekaligus, kemudian luluskan atau pulangkan untuk pembetulan.</p>
      </PageHeader>

      <div className="toolbar">
        <Segmented value={scope} onChange={setScope} options={[
          { key: 'today', label: `Hari ini & esok (${scopeCount('today')})` },
          { key: 'week', label: `Minggu ini (${scopeCount('week')})` },
          { key: 'all', label: `Semua (${pending.length})` },
        ]} />
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} options={staff.map((s) => ({ value: s.id, label: s.name }))} placeholder="Semua pemilik" aria-label="Pemilik" />
        <Select value={platform} onChange={(e) => setPlatform(e.target.value)} options={config.platforms} placeholder="Semua platform" aria-label="Platform" />
        {list.length > 0 && <label className="check"><input type="checkbox" checked={allOn} onChange={(e) => setMany(list.map((c) => c.id), e.target.checked)} />Pilih semua ({list.length})</label>}
      </div>

      {!canApprove && <div className="warnbox"><div><strong>Paparan sahaja</strong><span>Hanya Admin dan Marketing Manager boleh meluluskan content.</span></div></div>}

      {!list.length && <Card><Empty title="Tiada content menunggu kelulusan" text={pending.length ? 'Cuba skop "Semua" atau kosongkan penapis.' : 'Semua content sudah disemak.'} /></Card>}

      {groups.map(([date, rows]) => {
        const ids = rows.map((c) => c.id);
        const groupOn = ids.every((id) => sel.has(id));
        const late = date && date < t0;
        return (
          <Card key={date || 'none'} pad={false} className="appr-group">
            <div className="appr-head">
              {canApprove && <input type="checkbox" aria-label={`Pilih semua ${date ? fmtDate(date) : 'tanpa tarikh'}`} checked={groupOn} onChange={(e) => setMany(ids, e.target.checked)} />}
              <strong>{date ? fmtDate(date, { weekday: 'long' }) : 'Tiada tarikh terbit'}</strong>
              {date && <span className={late ? 'danger-text small' : 'small muted'}>{relDue(date)}</span>}
              <span className="grow" />
              <span className="small muted">{rows.length} content</span>
            </div>
            {rows.map((c) => {
              const ownerName = staffById[c.ownerStaffId]?.name || c.ownerName;
              const done = checklist.filter((k) => c.checklist?.[k]).length;
              const ti = taskInfo[c.id];
              const firstLink = (c.links || [])[c.links?.length - 1];
              const need = missingFor(c, readyKey).filter((m) => m !== 'title');
              return (
                <label key={c.id} className={`appr-row${sel.has(c.id) ? ' on' : ''}`}>
                  {canApprove && <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} />}
                  <span className="grow min0" style={{ flexBasis: 240 }}>
                    <span className="row gap-sm wrap">
                      <strong>{c.title}</strong>
                      {c.approval?.outcome === 'returned' && <Pill tone="amber">Pernah dipulangkan</Pill>}
                    </span>
                    <span className="day-meta">
                      <span className="muted">{c.code}{c.publishTime ? ` · ${c.publishTime}` : ''}</span>
                      {c.platform && <span className="tag">{c.platform}</span>}
                      <span className="meta-dot"><span className="dot" style={{ background: typeColor(config, c.type) }} />{c.type || 'Jenis belum ditetapkan'}</span>
                      {need.length > 0 && <span className="danger-text">Belum ada: {need.map((m) => FIELD_LABELS[m]).join(', ')}</span>}
                    </span>
                  </span>
                  <span className="day-owner">
                    {ownerName ? <><span className="owner-ring" style={{ '--ring': staffColor[c.ownerStaffId] || OTHER }}><Avatar name={ownerName} size={24} /></span><span className="small">{ownerName}</span></> : <span className="small muted">Tiada pemilik</span>}
                  </span>
                  <span className="appr-facts small muted">
                    <span title="Senarai semak">☑ {done}/{checklist.length}</span>
                    {ti && <span title="Tugasan siap">Tugasan {ti.done}/{ti.n}</span>}
                  </span>
                  <span className="row gap-xs" onClick={(e) => e.stopPropagation()}>
                    {firstLink && <a className="icon-btn" href={firstLink.url} target="_blank" rel="noreferrer" title={`Buka ${firstLink.label}`} aria-label={`Buka ${firstLink.label}`}><ExternalLink size={16} /></a>}
                    <Link to={`/content/${c.id}`} className="btn btn-ghost btn-sm">Buka</Link>
                  </span>
                </label>
              );
            })}
          </Card>
        );
      })}

      {canApprove && selected.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Tindakan pukal">
          <strong>{selected.length} dipilih</strong>
          <button type="button" className="link-btn" onClick={() => setSel(new Set())}>Batal pilih</button>
          <span className="grow" />
          <Button icon={Undo2} onClick={() => setReturnOpen(true)} disabled={busy}>Minta pembetulan</Button>
          <Button variant="primary" icon={Check} busy={busy} onClick={approve}>Luluskan {selected.length}</Button>
        </div>
      )}

      <Modal open={returnOpen} onClose={() => setReturnOpen(false)} title={`Minta pembetulan · ${selected.length} content`} footer={<>
        <Button onClick={() => setReturnOpen(false)}>Batal</Button>
        <Button variant="primary" busy={busy} disabled={!note.trim()} onClick={sendBack}>Pulangkan</Button>
      </>}>
        <p className="muted small">Content akan kembali ke peringkat Produksi. Nota ini dihantar kepada pemilik dan staf yang bertugas, dan disimpan dalam catatan setiap content.</p>
        <Field label="Apa yang perlu dibetulkan" required><Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: Caption terlalu panjang, tambah CTA pautan bio." /></Field>
      </Modal>
    </div>
  );
}
