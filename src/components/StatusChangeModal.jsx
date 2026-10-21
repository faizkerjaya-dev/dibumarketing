// Bila status baharu perlukan maklumat tambahan, contohnya Terbit perlukan link post,
// modal ini minta diisi dahulu. Syarat diikat pada peringkat, bukan nama status.
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { changeContentStatus } from '../lib/db';
import { missingForStatus, FIELD_LABELS } from '../lib/workflow';
import { findStatus } from '../lib/statuses';
import { today } from '../lib/dates';
import { Modal, Button, Field, Input } from './ui';

export default function StatusChangeModal({ request, onClose }) {
  const { profile } = useAuth();
  const { staffById } = useData();
  const config = useConfig();
  const { run } = useToast();
  const [extra, setExtra] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (request) {
      setExtra({
        title: request.content.title || '',
        publishedDate: request.content.publishedDate || today(),
        publishUrl: request.content.publishUrl || '',
        publishDate: request.content.publishDate || '',
      });
    }
  }, [request]);

  if (!request) return null;
  const { content, status } = request;
  const missing = missingForStatus(config, content, status).filter((f) => f !== 'ownerStaffId');
  const stillMissing = missing.filter((f) => !extra[f]);
  const label = findStatus(config, status).label;

  const save = async () => {
    setBusy(true);
    const patch = Object.fromEntries(missing.map((f) => [f, extra[f]]));
    if (patch.title) patch.isSlot = false;
    const ok = await run(() => changeContentStatus(content, status, patch, { profile, staffById }), `Ditukar ke ${label}`);
    setBusy(false);
    if (ok) onClose(true);
  };

  return (
    <Modal open title={`Tukar ke ${label}`} onClose={() => onClose(false)} footer={<><Button onClick={() => onClose(false)}>Batal</Button><Button variant="primary" busy={busy} disabled={stillMissing.length > 0} onClick={save}>Tukar</Button></>}>
      <p>Maklumat ini perlu diisi dahulu sebelum content boleh masuk peringkat {label}.</p>
      {missing.map((f) => (
        <Field key={f} label={FIELD_LABELS[f]} required>
          <Input
            type={f === 'publishUrl' ? 'url' : f === 'title' ? 'text' : 'date'}
            value={extra[f] || ''}
            onChange={(e) => setExtra((x) => ({ ...x, [f]: e.target.value }))}
            placeholder={f === 'publishUrl' ? 'https://www.tiktok.com/@…' : undefined}
          />
        </Field>
      ))}
    </Modal>
  );
}

// Guna: const [moveTo, moveEl] = useStatusChange(); moveTo(content, 'published');
export function useStatusChange() {
  const { profile } = useAuth();
  const { staffById } = useData();
  const config = useConfig();
  const { run, error } = useToast();
  const [request, setRequest] = useState(null);
  const moveTo = async (content, status) => {
    if (content.status === status) return;
    const missing = missingForStatus(config, content, status);
    if (missing.includes('ownerStaffId')) { error({ code: 'validation', message: 'Tetapkan pemilik content dahulu.' }); return; }
    if (missing.length) { setRequest({ content, status }); return; }
    await run(() => changeContentStatus(content, status, {}, { profile, staffById }), `Ditukar ke ${findStatus(config, status).label}`);
  };
  return [moveTo, <StatusChangeModal key="status-modal" request={request} onClose={() => setRequest(null)} />];
}
