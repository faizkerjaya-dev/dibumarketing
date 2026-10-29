// Popup senarai content bagi satu hari dalam kalendar.
// Setiap baris papar pemilik, jenis content, platform dan status. Warna jalur kiri mengikut
// pilihan "Warna ikut" (status / jenis / pemilik), tetapi nama sentiasa ditulis sebagai teks.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { findStatus } from '../lib/statuses';
import { platformShort } from '../lib/constants';
import { typeColor, TONE_FILL, OTHER } from '../lib/colors';
import { fmtDate } from '../lib/dates';
import { Modal, Button, Avatar, Select } from './ui';
import { readLast } from './BriefDrawer';
import { ContentStatusPill } from './pills';

export function colorFor(mode, c, { config, staffColor }) {
  if (c.isSlot) return OTHER;
  if (mode === 'owner') return staffColor[c.ownerStaffId] || OTHER;
  if (mode === 'type') return typeColor(config, c.type);
  return TONE_FILL[findStatus(config, c.status).tone] || OTHER;
}

// Ringkasan kiraan untuk sel kalendar dan kepala popup: [{ key, label, color, n }]
export function breakdown(mode, list, { config, staffById, staffColor }) {
  const m = new Map();
  list.filter((c) => !c.isSlot).forEach((c) => {
    let key; let label;
    if (mode === 'owner') { key = c.ownerStaffId || '-'; label = staffById[c.ownerStaffId]?.name || c.ownerName || 'Tiada pemilik'; }
    else if (mode === 'type') { key = c.type || '-'; label = c.type || 'Jenis belum ditetapkan'; }
    else { const st = findStatus(config, c.status); key = st.key; label = st.label; }
    const cur = m.get(key) || { key, label, color: colorFor(mode, c, { config, staffColor }), n: 0 };
    cur.n += 1;
    m.set(key, cur);
  });
  return [...m.values()].sort((a, b) => b.n - a.n);
}

export default function DayModal({ day, items, mode, canCreate, onClose, onQuickAdd, onOpenBrief, onOpenSlot, saving }) {
  const navigate = useNavigate();
  const config = useConfig();
  const { staffById, staffColor } = useData();
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState(() => readLast().platform || config.platforms[0] || '');
  const [type, setType] = useState(() => readLast().type || '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!day) return;
    setTitle('');
    if (canCreate) setTimeout(() => inputRef.current?.focus(), 40);
  }, [day, canCreate]);

  if (!day) return null;
  const real = items.filter((c) => !c.isSlot);
  const slots = items.filter((c) => c.isSlot);
  const parts = breakdown(mode, items, { config, staffById, staffColor });
  const ctx = { config, staffColor };

  const submit = async () => {
    const t = title.trim();
    if (!t || saving) return;
    const ok = await onQuickAdd(t, platform, type);
    if (ok !== false) { setTitle(''); inputRef.current?.focus(); }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`${fmtDate(day, { weekday: 'long', year: 'numeric' })}`}
      footer={canCreate && <>
        <Button icon={FileText} onClick={() => onOpenBrief(day, platform)} className="mr-auto">Brief penuh</Button>
        <Button onClick={onClose}>Tutup</Button>
      </>}
    >
      <div className="day-summary">
        <strong>{real.length} content</strong>
        {slots.length > 0 && <span className="muted">· {slots.length} slot belum ada tajuk</span>}
        <span className="grow" />
        {parts.map((p) => <span key={p.key} className="legend-chip"><span className="dot" style={{ background: p.color }} />{p.label} <strong>{p.n}</strong></span>)}
      </div>

      {canCreate && (
        <div className="day-add">
          <input
            ref={inputRef}
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder="Taip tajuk content baharu, tekan Enter"
            aria-label="Tajuk content baharu"
          />
          <div className="row gap-xs wrap">
            {config.platforms.map((p) => (
              <button key={p} type="button" title={p} aria-pressed={platform === p} className={`qa-chip${platform === p ? ' on' : ''}`} onClick={() => setPlatform(p)}>{platformShort(p)}</button>
            ))}
            <Select value={type} onChange={(e) => setType(e.target.value)} options={config.contentTypes || []} placeholder="Jenis content" aria-label="Jenis content" className="input input-sm" />
            <Button size="sm" variant="primary" icon={Plus} busy={saving} disabled={!title.trim()} onClick={submit}>Tambah</Button>
          </div>
        </div>
      )}

      {!items.length && <p className="muted small">Tiada content pada hari ini.</p>}
      <div className="day-list">
        {items.map((c) => {
          const owner = staffById[c.ownerStaffId];
          const ownerName = owner?.name || c.ownerName;
          return (
            <button
              key={c.id}
              type="button"
              className={`day-item${c.isSlot ? ' slot' : ''}`}
              style={{ '--bar': colorFor(mode, c, ctx) }}
              onClick={() => (c.isSlot ? onOpenSlot(c) : navigate(`/content/${c.id}`))}
            >
              <span className="day-time">{c.publishTime || '—'}</span>
              <span className="grow min0">
                <span className="day-title">{c.isSlot ? (c.slotLabel || 'Slot kosong') : c.title}</span>
                <span className="day-meta">
                  <span className="muted">{c.code}</span>
                  {c.platform && <span className="tag">{c.platform}</span>}
                  <span className="meta-dot"><span className="dot" style={{ background: typeColor(config, c.type) }} />{c.type || 'Jenis belum ditetapkan'}</span>
                </span>
              </span>
              <span className="day-owner">
                {ownerName ? <><span className="owner-ring" style={{ '--ring': staffColor[c.ownerStaffId] || OTHER }}><Avatar name={ownerName} size={26} /></span><span className="small">{ownerName}</span></> : <span className="small muted">Tiada pemilik</span>}
              </span>
              {c.isSlot ? <span className="tag">Isi slot</span> : <ContentStatusPill value={c.status} />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
