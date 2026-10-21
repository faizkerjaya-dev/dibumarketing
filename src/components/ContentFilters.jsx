// Penapis content yang dikongsi oleh Kalendar dan Papan kerja. Semua penapis berfungsi serentak.
import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { statusList } from '../lib/statuses';
import { PRIORITIES } from '../lib/constants';
import { Select, SearchInput } from './ui';

export const EMPTY_FILTERS = { q: '', platform: '', pillar: '', campaignId: '', product: '', ownerStaffId: '', staffId: '', status: '', priority: '' };

export function applyFilters(list, f) {
  const q = f.q.trim().toLowerCase();
  return list.filter((c) => (!q || `${c.title} ${c.code}`.toLowerCase().includes(q))
    && (!f.platform || c.platform === f.platform)
    && (!f.pillar || c.pillar === f.pillar)
    && (!f.campaignId || c.campaignId === f.campaignId)
    && (!f.product || c.product === f.product)
    && (!f.ownerStaffId || c.ownerStaffId === f.ownerStaffId)
    && (!f.staffId || (c.assigneeStaffIds || []).includes(f.staffId))
    && (!f.status || c.status === f.status)
    && (!f.priority || c.priority === f.priority));
}

export const activeFilterCount = (f) => Object.entries(f).filter(([k, v]) => v && k !== 'q').length;

// Tiga penapis utama sentiasa kelihatan. Selebihnya di belakang butang "Lagi penapis",
// supaya bar atas tidak penuh dengan 9 kotak pilihan.
export default function ContentFilters({ value, onChange, hide = [] }) {
  const { staff, campaigns } = useData();
  const config = useConfig();
  const [more, setMore] = useState(false);
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const staffOpts = staff.map((s) => ({ value: s.id, label: s.name }));
  const extra = activeFilterCount({ ...value, platform: '', ownerStaffId: '', status: '' });

  return (
    <div className="col gap-sm">
      <div className="toolbar">
        <SearchInput value={value.q} onChange={(q) => onChange({ ...value, q })} placeholder="Cari tajuk atau kod" />
        <Select value={value.platform} onChange={set('platform')} options={config.platforms} placeholder="Semua platform" aria-label="Platform" />
        <Select value={value.ownerStaffId} onChange={set('ownerStaffId')} options={staffOpts} placeholder="Semua pemilik" aria-label="Pemilik" />
        {!hide.includes('status') && <Select value={value.status} onChange={set('status')} options={statusList(config)} placeholder="Semua status" aria-label="Status" />}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMore((m) => !m)}>
          <SlidersHorizontal size={14} />Lagi penapis{extra > 0 ? ` (${extra})` : ''}
        </button>
        {(activeFilterCount(value) > 0 || value.q) && <button type="button" className="link-btn" onClick={() => onChange(EMPTY_FILTERS)}>Kosongkan</button>}
      </div>
      {more && (
        <div className="toolbar">
          <Select value={value.pillar} onChange={set('pillar')} options={config.pillars} placeholder="Semua kategori" aria-label="Kategori" />
          <Select value={value.campaignId} onChange={set('campaignId')} options={campaigns.map((c) => ({ value: c.id, label: c.name }))} placeholder="Semua kempen" aria-label="Kempen" />
          <Select value={value.product} onChange={set('product')} options={config.products} placeholder="Semua produk" aria-label="Produk" />
          <Select value={value.staffId} onChange={set('staffId')} options={staffOpts} placeholder="Semua staf terlibat" aria-label="Staf terlibat" />
          <Select value={value.priority} onChange={set('priority')} options={PRIORITIES} placeholder="Semua keutamaan" aria-label="Keutamaan" />
        </div>
      )}
    </div>
  );
}
