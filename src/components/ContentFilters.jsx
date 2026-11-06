// Penapis content yang dikongsi oleh Kalendar dan Papan kerja.
// Ringkas: kotak carian + satu butang "Penapis" yang membuka panel. Penapis yang aktif dipaparkan
// sebagai cip kecil (klik × untuk buang), jadi bar atas tidak penuh dengan banyak kotak pilihan.
import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { statusList, findStatus } from '../lib/statuses';
import { PRIORITIES } from '../lib/constants';
import { Select, SearchInput, Field } from './ui';

export const EMPTY_FILTERS = { q: '', platform: '', pillar: '', campaignId: '', product: '', ownerStaffId: '', staffId: '', status: '', priority: '' };

// config pilihan: membolehkan status lama (legacy) dipadankan dengan status semasa.
export function applyFilters(list, f, config) {
  const q = (f.q || '').trim().toLowerCase();
  return list.filter((c) => (!q || `${c.title} ${c.code}`.toLowerCase().includes(q))
    && (!f.platform || (c.platform || '').toLowerCase() === f.platform.toLowerCase())
    && (!f.pillar || c.pillar === f.pillar)
    && (!f.campaignId || c.campaignId === f.campaignId)
    && (!f.product || c.product === f.product)
    && (!f.ownerStaffId || c.ownerStaffId === f.ownerStaffId)
    && (!f.staffId || (c.assigneeStaffIds || []).includes(f.staffId) || c.ownerStaffId === f.staffId)
    && (!f.status || c.status === f.status || (config && findStatus(config, c.status).key === f.status))
    && (!f.priority || c.priority === f.priority));
}

export const activeFilterCount = (f) => Object.entries(f).filter(([k, v]) => v && k !== 'q').length;

// hide: senarai penapis yang tidak dipaparkan (contoh 'platform' bila kalendar guna tab platform).
// extra: kandungan tambahan dalam panel (contoh pilihan warna kad).
export default function ContentFilters({ value, onChange, hide = [], extra = null }) {
  const { staff, campaigns } = useData();
  const config = useConfig();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const staffOpts = staff.map((s) => ({ value: s.id, label: s.name }));
  const statuses = statusList(config);
  const defs = [
    { k: 'platform', label: 'Platform', options: config.platforms },
    { k: 'ownerStaffId', label: 'Pemilik', options: staffOpts },
    { k: 'status', label: 'Status', options: statuses.map((x) => ({ value: x.key, label: x.label })) },
    { k: 'pillar', label: 'Kategori', options: config.pillars },
    { k: 'campaignId', label: 'Kempen', options: campaigns.map((c) => ({ value: c.id, label: c.name })) },
    { k: 'product', label: 'Produk', options: config.products },
    { k: 'staffId', label: 'Staf terlibat', options: staffOpts },
    { k: 'priority', label: 'Keutamaan', options: PRIORITIES },
  ].filter((d) => !hide.includes(d.k));
  const labelOf = (d, v) => {
    const o = (d.options || []).find((x) => (typeof x === 'string' ? x : x.value ?? x.key) === v);
    return typeof o === 'string' ? o : o?.label || v;
  };
  const active = defs.filter((d) => value[d.k]);

  return (
    <div className="cf" ref={ref}>
      <SearchInput value={value.q} onChange={(q) => onChange({ ...value, q })} placeholder="Cari tajuk atau kod" className="cf-search" />
      <button type="button" className={`btn btn-secondary btn-sm cf-btn${active.length ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={14} />Penapis{active.length ? ` (${active.length})` : ''}
      </button>
      {active.map((d) => (
        <span key={d.k} className="cf-chip">
          <span className="muted">{d.label}:</span> {labelOf(d, value[d.k])}
          <button type="button" aria-label={`Buang penapis ${d.label}`} onClick={() => onChange({ ...value, [d.k]: '' })}><X size={12} /></button>
        </span>
      ))}
      {open && (
        <div className="cf-panel" role="dialog" aria-label="Penapis">
          <div className="cf-grid">
            {defs.map((d) => (
              <Field key={d.k} label={d.label}>
                <Select value={value[d.k]} onChange={set(d.k)} options={d.options || []} placeholder="Semua" aria-label={d.label} />
              </Field>
            ))}
          </div>
          {extra && <div className="cf-extra">{extra}</div>}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="link-btn" onClick={() => onChange({ ...EMPTY_FILTERS, q: value.q })} disabled={!active.length}>Kosongkan semua</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>Siap</button>
          </div>
        </div>
      )}
    </div>
  );
}
