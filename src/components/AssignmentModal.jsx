// Tambah creator ke kempen, atau kemas kini fee, kontrak dan bayaran. Creator yang sama tidak boleh ditambah dua kali.
import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { assignCreator, updateById, removeById } from '../lib/db';
import { AppError } from '../lib/errors';
import { CONTRACT_STATUSES, PAYMENT_STATUSES } from '../lib/constants';
import { Modal, Button, Field, Input, Select, Textarea, useConfirm } from './ui';

export default function AssignmentModal({ open, onClose, campaignId, assignment }) {
  const { campaigns, creators, staff, campaignById, creatorById, staffById, campaignCreators, deliverables } = useData();
  const { profile } = useAuth();
  const { run } = useToast();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirm, confirmEl] = useConfirm();

  useEffect(() => {
    if (!open) return;
    setF(assignment ? { ...assignment } : { campaignId: campaignId || '', creatorId: '', ownerStaffId: profile.staffId || '', fee: '', paidAmount: 0, contractStatus: 'none', paymentStatus: 'unpaid', briefDate: '', deadline: '', notes: '' });
  }, [open, assignment, campaignId, profile.staffId]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const taken = new Set(campaignCreators.filter((a) => a.campaignId === f.campaignId).map((a) => a.creatorId));

  const save = async () => {
    setBusy(true);
    const ok = await run(async () => {
      if (assignment) {
        const paid = Number(f.paidAmount) || 0;
        const fee = Number(f.fee) || 0;
        await updateById('campaignCreators', assignment.id, {
          ownerStaffId: f.ownerStaffId, ownerName: staffById[f.ownerStaffId]?.name || '', fee, paidAmount: paid,
          contractStatus: f.contractStatus, paymentStatus: f.paymentStatus || (paid >= fee && fee ? 'paid' : paid ? 'partial' : 'unpaid'),
          briefDate: f.briefDate || '', deadline: f.deadline || '', notes: f.notes || '',
        }, profile);
      } else {
        const campaign = campaignById[f.campaignId];
        const creator = creatorById[f.creatorId];
        if (!campaign) throw new AppError('Pilih kempen.');
        if (!creator) throw new AppError('Pilih creator.');
        await assignCreator(campaign, creator, f, { profile, staffById });
      }
    }, assignment ? 'Tugasan creator dikemas kini' : 'Creator ditambah ke kempen');
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    const count = deliverables.filter((d) => d.assignmentId === assignment.id).length;
    if (count) { run(async () => { throw new AppError(`Creator ini ada ${count} deliverable. Padam deliverable dahulu, atau set kontrak "Expired".`); }); return; }
    if (!(await confirm(`Buang ${assignment.creatorName} dari ${assignment.campaignName}?`, { title: 'Remove creator', okLabel: 'Remove', danger: true }))) return;
    const ok = await run(() => removeById('campaignCreators', assignment.id), 'Dibuang');
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide title={assignment ? `${assignment.creatorName} · ${assignment.campaignName}` : 'Assign creator to campaign'} footer={<>
      {assignment && <Button variant="danger" onClick={remove} className="mr-auto">Buang</Button>}
      <Button onClick={onClose}>Batal</Button><Button variant="primary" busy={busy} onClick={save}>Simpan</Button>
    </>}>
      <div className="grid-2">
        {!assignment && <>
          <Field label="Kempen" required><Select value={f.campaignId || ''} onChange={set('campaignId')} options={campaigns.filter((c) => c.status !== 'archived').map((c) => ({ value: c.id, label: c.name }))} placeholder="Pilih" disabled={!!campaignId} /></Field>
          <Field label="Creator" required hint="Creator yang sudah dalam kempen ini tidak disenaraikan."><Select value={f.creatorId || ''} onChange={set('creatorId')} options={creators.filter((c) => !c.archived && !taken.has(c.id)).map((c) => ({ value: c.id, label: c.name }))} placeholder="Pilih" /></Field>
        </>}
        <Field label="Pemilik hubungan"><Select value={f.ownerStaffId || ''} onChange={set('ownerStaffId')} options={staff.map((s) => ({ value: s.id, label: s.name }))} placeholder="Tiada" /></Field>
        <Field label="Fee dirundingkan (RM)" hint="Fee untuk kempen ini, berasingan daripada rate card."><Input type="number" min="0" value={f.fee ?? ''} onChange={set('fee')} /></Field>
        <Field label="Status kontrak"><Select value={f.contractStatus || 'none'} onChange={set('contractStatus')} options={CONTRACT_STATUSES} /></Field>
        <Field label="Tarikh brief"><Input type="date" value={f.briefDate || ''} onChange={set('briefDate')} /></Field>
        <Field label="Deadline akhir"><Input type="date" value={f.deadline || ''} onChange={set('deadline')} /></Field>
        {assignment && <>
          <Field label="Sudah dibayar (RM)"><Input type="number" min="0" value={f.paidAmount ?? 0} onChange={set('paidAmount')} /></Field>
          <Field label="Status bayaran"><Select value={f.paymentStatus || 'unpaid'} onChange={set('paymentStatus')} options={PAYMENT_STATUSES} /></Field>
        </>}
        <Field label="Nota" full><Textarea value={f.notes || ''} onChange={set('notes')} rows={2} /></Field>
      </div>
      {confirmEl}
    </Modal>
  );
}
