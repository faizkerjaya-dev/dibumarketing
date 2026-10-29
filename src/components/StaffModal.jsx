// Cipta / edit profil staf dalaman (bukan KOL). Termasuk kapasiti & tarikh tidak available.
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { createDoc, updateById } from '../lib/db';
import { AppError } from '../lib/errors';
import { STAFF_STATUSES, uid } from '../lib/constants';
import { Modal, Button, Field, Input, Select, Textarea, MultiChips } from './ui';

const SKILLS = ['Script', 'Shooting', 'Editing', 'Design', 'Caption', 'Publishing', 'Live hosting', 'Creator outreach'];

export default function StaffModal({ open, onClose, staff }) {
  const { profile } = useAuth();
  const config = useConfig();
  const { run } = useToast();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setF(staff ? { ...staff } : { name: '', email: '', jobTitle: '', department: 'Marketing', status: 'active', skills: [], responsibilities: '', startDate: '', weeklyCapacity: config.defaultWeeklyCapacity, monthlyCapacity: '', unavailable: [], notes: '' });
  }, [open, staff, config.defaultWeeklyCapacity]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setRange = (i, k, v) => setF((x) => ({ ...x, unavailable: x.unavailable.map((u, j) => (j === i ? { ...u, [k]: v } : u)) }));

  const save = async () => {
    setBusy(true);
    const ok = await run(async () => {
      if (!f.name?.trim()) throw new AppError('Nama staf wajib diisi.');
      const data = {
        name: f.name.trim(), email: f.email || '', jobTitle: f.jobTitle || '', department: f.department || '', status: f.status,
        skills: f.skills || [], responsibilities: f.responsibilities || '', startDate: f.startDate || '',
        weeklyCapacity: Number(f.weeklyCapacity) || 0, monthlyCapacity: Number(f.monthlyCapacity) || 0,
        unavailable: (f.unavailable || []).filter((u) => u.from && u.to), notes: f.notes || '',
      };
      if (staff) await updateById('staff', staff.id, data, profile);
      else await createDoc('staff', { ...data, userUid: null }, profile);
    }, staff ? 'Staf dikemas kini' : 'Staf ditambah');
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide title={staff ? `Edit ${staff.name}` : 'Tambah staf'} footer={<><Button onClick={onClose}>Batal</Button><Button variant="primary" busy={busy} onClick={save}>Simpan</Button></>}>
      <div className="grid-2">
        <Field label="Nama penuh" required><Input value={f.name || ''} onChange={set('name')} /></Field>
        <Field label="Email"><Input type="email" value={f.email || ''} onChange={set('email')} /></Field>
        <Field label="Jawatan"><Input value={f.jobTitle || ''} onChange={set('jobTitle')} placeholder="Video Editor" list="job-titles" /></Field>
        <Field label="Jabatan"><Input value={f.department || ''} onChange={set('department')} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set('status')} options={STAFF_STATUSES} /></Field>
        <Field label="Tarikh mula"><Input type="date" value={f.startDate || ''} onChange={set('startDate')} /></Field>
        <Field label="Kapasiti mingguan (jam)"><Input type="number" min="0" value={f.weeklyCapacity ?? ''} onChange={set('weeklyCapacity')} /></Field>
        <Field label="Kapasiti bulanan (jam)"><Input type="number" min="0" value={f.monthlyCapacity ?? ''} onChange={set('monthlyCapacity')} /></Field>
        <Field label="Kemahiran" full group><MultiChips options={SKILLS} value={f.skills || []} onChange={(skills) => setF((x) => ({ ...x, skills }))} allowNew /></Field>
        <Field label="Tanggungjawab" full><Textarea value={f.responsibilities || ''} onChange={set('responsibilities')} rows={2} /></Field>
      </div>
      <datalist id="job-titles">{['Marketing Manager', 'Content Manager', 'Content Creator', 'Scriptwriter', 'Videographer', 'Video Editor', 'Designer', 'Social Media Manager', 'Affiliate Manager'].map((t) => <option key={t} value={t} />)}</datalist>
      <div className="form-section">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Tarikh tidak available</h3>
          <Button size="sm" icon={Plus} onClick={() => setF((x) => ({ ...x, unavailable: [...(x.unavailable || []), { id: uid(), from: '', to: '', note: '' }] }))}>Tambah tarikh</Button>
        </div>
        {(f.unavailable || []).map((u, i) => (
          <div key={u.id || i} className="grid-3" style={{ alignItems: 'end' }}>
            <Field label="Dari"><Input type="date" value={u.from} onChange={(e) => setRange(i, 'from', e.target.value)} /></Field>
            <Field label="Hingga"><Input type="date" value={u.to} onChange={(e) => setRange(i, 'to', e.target.value)} /></Field>
            <Field label="Nota"><Input value={u.note} onChange={(e) => setRange(i, 'note', e.target.value)} placeholder="Cuti tahunan" /></Field>
            <Button variant="ghost" icon={Trash2} onClick={() => setF((x) => ({ ...x, unavailable: x.unavailable.filter((_, j) => j !== i) }))}>Buang</Button>
          </div>
        ))}
      </div>
      <Field label="Nota"><Textarea value={f.notes || ''} onChange={set('notes')} rows={2} /></Field>
    </Modal>
  );
}
