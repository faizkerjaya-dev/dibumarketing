// Dua alat untuk kerja pukal:
//   QuickPlanModal  - tempah slot kosong untuk sebulan mengikut kekerapan posting.
//   BulkFillModal   - isi tajuk semua slot kosong dalam satu senarai, tanpa buka satu per satu.
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { createSlots, fillSlot, deleteSlots } from '../lib/db';
import { statusForStage } from '../lib/statuses';
import { today, addDays, toISODate, parseDate, fmtDate } from '../lib/dates';
import { Modal, Button, Field, Input, Select, Empty, useConfirm } from './ui';

const DAYS = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Ahd'];

export function QuickPlanModal({ open, onClose }) {
  const { profile, } = useAuth();
  const { staff, staffById } = useData();
  const config = useConfig();
  const { run } = useToast();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const start = new Date();
    setF({
      perPlatform: Object.fromEntries(config.platforms.map((p, i) => [p, i === 0 ? 2 : 0])),
      weekdays: [0, 1, 2, 3, 4],
      from: toISODate(new Date(start.getFullYear(), start.getMonth() + 1, 1)),
      to: toISODate(new Date(start.getFullYear(), start.getMonth() + 2, 0)),
      ownerStaffId: profile.staffId || '',
      rotatePillars: true,
    });
  }, [open, config.platforms, profile.staffId]);

  const count = useMemo(() => {
    if (!f) return 0;
    const per = Object.values(f.perPlatform).reduce((n, v) => n + (Number(v) || 0), 0);
    if (!per || !f.from || !f.to || f.to < f.from) return 0;
    let days = 0;
    for (let d = f.from; d <= f.to; d = addDays(d, 1)) {
      if (f.weekdays.includes((parseDate(d).getDay() + 6) % 7)) days += 1;
    }
    return days * per;
  }, [f]);

  if (!open || !f) return null;
  const setPer = (p, v) => setF((x) => ({ ...x, perPlatform: { ...x.perPlatform, [p]: Math.max(0, Math.min(10, v)) } }));
  const toggleDay = (i) => setF((x) => ({ ...x, weekdays: x.weekdays.includes(i) ? x.weekdays.filter((d) => d !== i) : [...x.weekdays, i].sort() }));

  const save = async () => {
    setBusy(true);
    const n = await run(() => createSlots({ ...f, statusKey: statusForStage(config, 'idea') }, { profile, staffById, config }), 'Slot ditempah');
    setBusy(false);
    if (n) onClose();
  };

  const summary = Object.entries(f.perPlatform).filter(([, n]) => n > 0).map(([p, n]) => `${n} ${p}`).join(' + ');

  return (
    <Modal
      open
      wide
      title="Rancang sebulan"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Batal</Button><Button variant="primary" busy={busy} disabled={!count} onClick={save}>Cipta {count} slot</Button></>}
    >
      <p className="muted small">Tempah slot mengikut kekerapan posting. Tajuk diisi kemudian, terus dalam kalendar. Slot tanpa tajuk tidak dikira dalam laporan.</p>

      <Field label="Platform dan berapa kali sehari" group>
        <div className="grid-2">
          {config.platforms.map((p) => {
            const n = Number(f.perPlatform[p]) || 0;
            return (
              <div key={p} className="row gap-sm" style={{ padding: '9px 12px', borderRadius: 11, border: `1px solid ${n ? 'var(--brand-line)' : 'var(--border-2)'}`, background: n ? 'var(--brand-soft)' : 'var(--surface)' }}>
                <span className="strong grow">{p}</span>
                <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label={`Kurangkan ${p}`} onClick={() => setPer(p, n - 1)}>−</button>
                <strong style={{ minWidth: 20, textAlign: 'center' }}>{n}</strong>
                <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label={`Tambah ${p}`} onClick={() => setPer(p, n + 1)}>+</button>
              </div>
            );
          })}
        </div>
      </Field>

      <Field label="Hari posting" group>
        <div className="chips">
          {DAYS.map((d, i) => <button key={d} type="button" className={`chip${f.weekdays.includes(i) ? ' on' : ''}`} onClick={() => toggleDay(i)}>{d}</button>)}
        </div>
      </Field>

      <div className="grid-3">
        <Field label="Dari"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Hingga"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Pemilik lalai"><Select value={f.ownerStaffId} onChange={(e) => setF({ ...f, ownerStaffId: e.target.value })} options={staff.map((s) => ({ value: s.id, label: s.name }))} placeholder="Belum ditetapkan" /></Field>
      </div>

      <label className="check"><input type="checkbox" checked={f.rotatePillars} onChange={(e) => setF({ ...f, rotatePillars: e.target.checked })} />Pusing kategori secara bergilir</label>

      <div className="warnbox">
        <div>
          <strong>{count ? `${count} slot akan dicipta` : 'Tiada slot akan dicipta'}</strong>
          {count > 0 && <span>{summary} setiap {f.weekdays.map((i) => DAYS[i]).join(', ')}, {fmtDate(f.from)} hingga {fmtDate(f.to)}.</span>}
          {count > 400 && <span>Terlalu banyak. Hadkan kepada 400 slot setiap kali.</span>}
        </div>
      </div>
    </Modal>
  );
}

export function BulkFillModal({ open, onClose, slots }) {
  const { profile } = useAuth();
  const { staffById } = useData();
  const { run } = useToast();
  const [titles, setTitles] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirm, confirmEl] = useConfirm();

  useEffect(() => { if (open) setTitles({}); }, [open]);
  if (!open) return null;

  const filled = Object.entries(titles).filter(([, v]) => v.trim());

  const save = async () => {
    setBusy(true);
    const ok = await run(async () => {
      for (const [id, title] of filled) {
        const slot = slots.find((s) => s.id === id);
        if (slot) await fillSlot(slot, { title }, { profile, staffById });
      }
    }, `${filled.length} slot diisi`);
    setBusy(false);
    if (ok) onClose();
  };

  const removeEmpty = async () => {
    const empties = slots.filter((s) => !titles[s.id]?.trim()).map((s) => s.id);
    if (!empties.length) return;
    if (!(await confirm(`Buang ${empties.length} slot kosong yang tidak diisi? Content yang sudah ada tajuk tidak terjejas.`, { title: 'Buang slot kosong', okLabel: 'Buang', danger: true }))) return;
    const ok = await run(() => deleteSlots(empties), 'Slot dibuang');
    if (ok) onClose();
  };

  return (
    <Modal
      open
      wide
      title={`Isi ${slots.length} slot kosong`}
      onClose={onClose}
      footer={<>
        <Button variant="danger" onClick={removeEmpty} className="mr-auto">Buang yang kosong</Button>
        <Button onClick={onClose}>Batal</Button>
        <Button variant="primary" busy={busy} disabled={!filled.length} onClick={save}>Simpan {filled.length || ''}</Button>
      </>}
    >
      {!slots.length && <Empty title="Tiada slot kosong" text="Semua slot sudah ada tajuk." />}
      {slots.length > 0 && <p className="muted small">Taip tajuk dan tekan Tab untuk ke slot seterusnya. Slot yang dibiarkan kosong kekal sebagai slot.</p>}
      <div className="col">
        {slots.slice(0, 60).map((s) => (
          <div key={s.id} className="list-row">
            <span className="small muted" style={{ width: 92, flex: 'none' }}>{fmtDate(s.publishDate, { weekday: 'short' })}</span>
            <span className="tag" style={{ flex: 'none' }}>{s.platform || '—'}</span>
            <input
              className="input"
              style={{ flex: 1, minHeight: 36 }}
              value={titles[s.id] || ''}
              placeholder={s.slotLabel || 'Tajuk content'}
              onChange={(e) => setTitles((t) => ({ ...t, [s.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {slots.length > 60 && <p className="muted small">Menunjukkan 60 slot terawal. Simpan dahulu, kemudian buka semula untuk selebihnya.</p>}
      {confirmEl}
    </Modal>
  );
}
