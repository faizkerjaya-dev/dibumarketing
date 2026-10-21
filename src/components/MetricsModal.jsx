// Masukkan prestasi secara manual (tiada API platform). Setiap rekod ada tarikh & nama pengisi.
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { saveMetrics } from '../lib/db';
import { METRIC_FIELDS } from '../lib/constants';
import { today } from '../lib/dates';
import { Modal, Button, Field, Input } from './ui';

export default function MetricsModal({ open, onClose, target, title = 'Record performance' }) {
  const { profile } = useAuth();
  const { run } = useToast();
  const [values, setValues] = useState({ date: today() });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setValues({ date: today() }); }, [open]);

  const save = async () => {
    setBusy(true);
    const ok = await run(() => saveMetrics(target, values, profile), 'Prestasi disimpan');
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><Button onClick={onClose}>Batal</Button><Button variant="primary" busy={busy} onClick={save}>Simpan</Button></>}>
      <p className="muted small">Angka diisi secara manual dari app platform. Isi yang ada sahaja; kosongkan yang tiada.</p>
      <div className="grid-3">
        <Field label="Tarikh data"><Input type="date" value={values.date} onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))} /></Field>
        {METRIC_FIELDS.map(([k, label]) => (
          <Field key={k} label={label}><Input type="number" min="0" inputMode="numeric" value={values[k] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} /></Field>
        ))}
      </div>
    </Modal>
  );
}
