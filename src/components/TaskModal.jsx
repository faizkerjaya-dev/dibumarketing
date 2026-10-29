// Assign / reassign / edit tugasan staf. Papar amaran kapasiti & cuti, tapi tidak menyekat.
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { saveTask, deleteTask } from '../lib/db';
import { assignWarnings, staffWorkload, BANDS } from '../lib/workload';
import { TASK_ROLES, TASK_STATUSES, PRIORITIES } from '../lib/constants';
import { fmtDateTime } from '../lib/dates';
import { Modal, Button, Field, Input, Select, Textarea, useConfirm } from './ui';

const EMPTY = { contentId: '', staffId: '', role: 'shooting', description: '', deadline: '', priority: 'medium', status: 'todo', estHours: '', notes: '' };

export default function TaskModal({ open, onClose, task, presetContentId, presetStaffId }) {
  const { staff, tasks, content, staffById, contentById } = useData();
  const { profile } = useAuth();
  const { run } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmEl] = useConfirm();

  useEffect(() => {
    if (!open) return;
    setAck(false);
    setForm(task ? { ...EMPTY, ...task, estHours: task.estHours ?? '' } : { ...EMPTY, contentId: presetContentId || '', staffId: presetStaffId || '' });
  }, [open, task, presetContentId, presetStaffId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const selected = staffById[form.staffId];
  const warnings = useMemo(() => assignWarnings(selected, form.deadline, form.estHours, tasks, task?.id), [selected, form.deadline, form.estHours, tasks, task?.id]);
  const staffOptions = staff.filter((s) => s.status !== 'inactive' || s.id === form.staffId).map((s) => {
    const w = staffWorkload(s, tasks);
    return { value: s.id, label: `${s.name} · ${s.jobTitle || ''} · ${w.pct != null ? `${w.pct}%` : BANDS[w.band].label}` };
  });
  const contentOptions = content.filter((c) => !c.archived && c.status !== 'archived').map((c) => ({ value: c.id, label: `${c.code} · ${c.title || c.slotLabel || 'Slot kosong'}` }));

  const save = async () => {
    if (warnings.length && !ack) return;
    setBusy(true);
    const ok = await run(() => saveTask(form, { profile, staffById, contentById, existing: task }), task ? 'Tugasan dikemas kini' : 'Tugasan diberikan');
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!(await confirm('Padam tugasan ini? Content tidak terjejas.', { title: 'Padam tugasan', okLabel: 'Padam', danger: true }))) return;
    const ok = await run(() => deleteTask(task, { staffById }), 'Tugasan dipadam');
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? 'Edit tugasan' : 'Beri tugasan'}
      footer={<>
        {task && <Button variant="danger" onClick={remove} className="mr-auto">Padam</Button>}
        <Button onClick={onClose}>Batal</Button>
        <Button variant="primary" busy={busy} onClick={save} disabled={!form.staffId || (warnings.length > 0 && !ack)}>{task ? 'Simpan' : 'Tugaskan'}</Button>
      </>}
    >
      <div className="grid-2">
        <Field label="Content" full hint="Kosongkan untuk tugasan umum, bukan content.">
          <Select value={form.contentId || ''} onChange={set('contentId')} options={contentOptions} placeholder="Tiada content" disabled={!!task?.contentId} />
        </Field>
        <Field label="Staf" required><Select value={form.staffId} onChange={set('staffId')} options={staffOptions} placeholder="Pilih staf" /></Field>
        <Field label="Jenis tugas"><Select value={form.role} onChange={set('role')} options={TASK_ROLES} /></Field>
        <Field label="Deadline"><Input type="date" value={form.deadline} onChange={set('deadline')} /></Field>
        <Field label="Anggaran jam" hint="Digunakan untuk kira beban kerja."><Input type="number" min="0" step="0.5" value={form.estHours} onChange={set('estHours')} /></Field>
        <Field label="Keutamaan"><Select value={form.priority} onChange={set('priority')} options={PRIORITIES} /></Field>
        <Field label="Status"><Select value={form.status} onChange={set('status')} options={TASK_STATUSES} /></Field>
        <Field label="Keterangan" full><Input value={form.description} onChange={set('description')} placeholder="Shoot unboxing, 3 sudut" /></Field>
        <Field label="Nota" full><Textarea value={form.notes} onChange={set('notes')} rows={2} /></Field>
      </div>
      {warnings.length > 0 && (
        <div className="warnbox">
          <div>
            <strong>Amaran sebelum assign</strong>
            {warnings.map((w) => <span key={w}>{w}</span>)}
            <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />Saya faham, teruskan juga</label>
          </div>
        </div>
      )}
      {task?.history?.length > 0 && (
        <details>
          <summary className="small strong">Sejarah tugasan ({task.history.length})</summary>
          <ul className="small muted">{task.history.slice().reverse().map((h, i) => <li key={i}>{fmtDateTime(h.at)} · {h.by}: {h.text}</li>)}</ul>
        </details>
      )}
      {confirmEl}
    </Modal>
  );
}
