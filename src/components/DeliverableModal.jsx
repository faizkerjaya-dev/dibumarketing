// Cipta / edit deliverable creator, dan urus aliran revisi (submit → revision → approve).
// Revisi satu deliverable TIDAK mengubah deliverable lain milik creator yang sama.
import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { saveDeliverable, deliverableAction, removeById } from '../lib/db';
import { can } from '../lib/permissions';
import { DELIVERABLE_STATUSES } from '../lib/constants';
import { Modal, Button, Field, Input, Select, Textarea, Tabs, useConfirm } from './ui';
import { DeliverableStatusPill } from './pills';
import CommentThread from './CommentThread';
import MetricsModal from './MetricsModal';

export default function DeliverableModal({ open, onClose, deliverable, assignmentId }) {
  const { campaignCreators, content } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const { run } = useToast();
  const [f, setF] = useState({});
  const [tab, setTab] = useState('details');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [confirm, confirmEl] = useConfirm();
  const canEdit = can(profile, 'campaign.creators');

  useEffect(() => {
    if (!open) return;
    setTab('details');
    setNote('');
    setF(deliverable ? { ...deliverable } : { assignmentId: assignmentId || '', type: config.deliverableTypes[0], platform: config.platforms[0], description: '', brief: '', draftDue: '', revisionDue: '', approvalDue: '', publishDue: '', publishedUrl: '', publishedDate: '', contentId: '', status: 'brief_sent', notes: '' });
  }, [open, deliverable, assignmentId, config.deliverableTypes, config.platforms]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const assignment = campaignCreators.find((a) => a.id === f.assignmentId);

  const save = async () => {
    setBusy(true);
    const ok = await run(() => {
      const data = {
        assignmentId: f.assignmentId, campaignId: assignment?.campaignId || f.campaignId, campaignName: assignment?.campaignName || f.campaignName,
        creatorId: assignment?.creatorId || f.creatorId, creatorName: assignment?.creatorName || f.creatorName,
        type: f.type, platform: f.platform, description: f.description || '', brief: f.brief || '', contentId: f.contentId || null,
        draftDue: f.draftDue || '', revisionDue: f.revisionDue || '', approvalDue: f.approvalDue || '', publishDue: f.publishDue || '',
        publishedUrl: f.publishedUrl || '', publishedDate: f.publishedDate || '', status: f.status, notes: f.notes || '',
      };
      return saveDeliverable(data, deliverable, profile);
    }, 'Deliverable disimpan');
    setBusy(false);
    if (ok) onClose();
  };

  const act = async (action) => {
    setBusy(true);
    const ok = await run(() => deliverableAction(deliverable, action, note, profile), 'Dikemas kini');
    setBusy(false);
    if (ok) { setNote(''); onClose(); }
  };

  const remove = async () => {
    if (!(await confirm('Padam deliverable ini?', { title: 'Padam deliverable', okLabel: 'Padam', danger: true }))) return;
    const ok = await run(() => removeById('deliverables', deliverable.id), 'Dipadam');
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide title={deliverable ? `${deliverable.code} · ${deliverable.creatorName} · ${deliverable.type}` : 'Deliverable baharu'} footer={tab === 'details' && canEdit && <>
      {deliverable && <Button variant="danger" onClick={remove} className="mr-auto">Padam</Button>}
      <Button onClick={onClose}>Batal</Button><Button variant="primary" busy={busy} onClick={save}>Simpan</Button>
    </>}>
      {deliverable && <Tabs value={tab} onChange={setTab} tabs={[{ key: 'details', label: 'Butiran' }, { key: 'revisions', label: 'Pembetulan', count: deliverable.revisionCount || 0 }]} />}
      {tab === 'details' && (
        <div className="grid-2">
          {!deliverable && (
            <Field label="Creator dan kempen" required full>
              <Select value={f.assignmentId || ''} onChange={set('assignmentId')} options={campaignCreators.map((a) => ({ value: a.id, label: `${a.creatorName} · ${a.campaignName}` }))} placeholder="Pilih" disabled={!!assignmentId} />
            </Field>
          )}
          <Field label="Jenis deliverable"><Select value={f.type || ''} onChange={set('type')} options={config.deliverableTypes} /></Field>
          <Field label="Platform"><Select value={f.platform || ''} onChange={set('platform')} options={config.platforms} /></Field>
          <Field label="Status"><Select value={f.status || 'brief_sent'} onChange={set('status')} options={DELIVERABLE_STATUSES} /></Field>
          <Field label="Content berkaitan" hint="Pilihan. Pautkan jika deliverable ini juga ada rekod content."><Select value={f.contentId || ''} onChange={set('contentId')} options={content.filter((c) => !c.archived && !c.isSlot).map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` }))} placeholder="Tiada" /></Field>
          <Field label="Draf perlu siap"><Input type="date" value={f.draftDue || ''} onChange={set('draftDue')} /></Field>
          <Field label="Pembetulan perlu siap"><Input type="date" value={f.revisionDue || ''} onChange={set('revisionDue')} /></Field>
          <Field label="Approval perlu siap"><Input type="date" value={f.approvalDue || ''} onChange={set('approvalDue')} /></Field>
          <Field label="Terbit pada"><Input type="date" value={f.publishDue || ''} onChange={set('publishDue')} /></Field>
          <Field label="Link post"><Input type="url" value={f.publishedUrl || ''} onChange={set('publishedUrl')} placeholder="https://…" /></Field>
          <Field label="Tarikh terbit"><Input type="date" value={f.publishedDate || ''} onChange={set('publishedDate')} /></Field>
          <Field label="Keterangan" full><Input value={f.description || ''} onChange={set('description')} placeholder="Video 1: unboxing dan review" /></Field>
          <Field label="Brief" full><Textarea value={f.brief || ''} onChange={set('brief')} /></Field>
          <Field label="Nota" full><Textarea value={f.notes || ''} onChange={set('notes')} rows={2} /></Field>
          {deliverable && can(profile, 'metrics.enter') && <Button icon={BarChart3} onClick={() => setMetricsOpen(true)}>Rekod prestasi</Button>}
        </div>
      )}
      {tab === 'revisions' && deliverable && (
        <div className="col gap">
          <div className="row gap-sm wrap"><DeliverableStatusPill value={deliverable.status} /><span className="muted small">{deliverable.revisionCount || 0} kali pembetulan</span></div>
          {canEdit && (
            <div className="col gap-sm">
              <Field label="Nota"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Komen semakan atau link draf" /></Field>
              <div className="row gap-sm wrap">
                <Button busy={busy} onClick={() => act('submit')}>Tanda draf dihantar</Button>
                <Button busy={busy} onClick={() => act('revision')}>Minta pembetulan</Button>
                <Button variant="primary" busy={busy} onClick={() => act('approve')}>Luluskan</Button>
              </div>
            </div>
          )}
          <CommentThread targetType="deliverable" targetId={deliverable.id} thread="revision" canPost={false} emptyText="Belum ada sejarah pembetulan." />
        </div>
      )}
      {deliverable && <MetricsModal open={metricsOpen} onClose={() => setMetricsOpen(false)} target={{ type: 'deliverable', id: deliverable.id, campaignId: deliverable.campaignId, creatorId: deliverable.creatorId }} />}
      {confirmEl}
    </Modal>
  );
}
