import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { createDoc, updateById, nextCode, logActivity, propagateCampaignName } from '../lib/db';
import { AppError } from '../lib/errors';
import { CAMPAIGN_STATUSES } from '../lib/constants';
import { PageHeader, Card, Button, Field, Input, Select, Textarea, MultiChips, Loading } from '../components/ui';

const EMPTY = { code: '', name: '', objective: '', description: '', startDate: '', endDate: '', managerStaffId: '', budget: '', targetAudience: '', platforms: [], products: [], pillars: [], status: 'planning' };

export default function CampaignForm() {
  const { id } = useParams();
  const { campaignById, staff, staffById, ready } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const { run } = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || f) return;
    const c = id ? campaignById[id] : null;
    setF(c ? { ...EMPTY, ...c } : { ...EMPTY, managerStaffId: profile.staffId || '' });
  }, [ready, id, campaignById, f, profile.staffId]);

  if (!f) return <div className="page"><Loading /></div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    const result = await run(async () => {
      if (!f.name.trim()) throw new AppError('Nama kempen wajib diisi.');
      if (f.startDate && f.endDate && f.endDate < f.startDate) throw new AppError('Tarikh tamat mesti selepas tarikh mula.');
      const data = {
        name: f.name.trim(), objective: f.objective, description: f.description, startDate: f.startDate, endDate: f.endDate,
        managerStaffId: f.managerStaffId, managerName: staffById[f.managerStaffId]?.name || '', budget: Number(f.budget) || 0,
        targetAudience: f.targetAudience, platforms: f.platforms, products: f.products, pillars: f.pillars, status: f.status,
        archived: f.status === 'archived',
      };
      if (id) {
        await updateById('campaigns', id, data, profile);
        if (campaignById[id]?.name !== data.name) await propagateCampaignName(id, data.name);
        return id;
      }
      const code = f.code.trim() || (await nextCode('campaigns', 'CMP'));
      const nid = await createDoc('campaigns', { ...data, code, team: [], expenses: [] }, profile);
      await logActivity(profile, { type: 'campaign_created', message: `${profile.name} created campaign ${data.name}`, refType: 'campaign', refId: nid });
      return nid;
    }, 'Kempen disimpan');
    setBusy(false);
    if (result) navigate(`/campaigns/${result}`);
  };

  return (
    <div className="page">
      <PageHeader crumb={<Link to="/campaigns">Campaigns</Link>} title={id ? `Edit ${f.name}` : 'New campaign'} actions={<><Button onClick={() => navigate(-1)}>Batal</Button><Button variant="primary" busy={busy} onClick={save}>Simpan</Button></>} />
      <Card>
        <div className="grid-2">
          <Field label="Nama kempen" required><Input value={f.name} onChange={set('name')} placeholder="Ramadan 2027" /></Field>
          <Field label="Campaign ID" hint="Kosongkan untuk jana automatik"><Input value={f.code} onChange={set('code')} disabled={!!id} /></Field>
          <Field label="Tarikh mula"><Input type="date" value={f.startDate} onChange={set('startDate')} /></Field>
          <Field label="Tarikh tamat"><Input type="date" value={f.endDate} onChange={set('endDate')} /></Field>
          <Field label="Pengurus kempen"><Select value={f.managerStaffId} onChange={set('managerStaffId')} options={staff.map((s) => ({ value: s.id, label: s.name }))} placeholder="Pilih" /></Field>
          <Field label="Bajet (RM)"><Input type="number" min="0" value={f.budget} onChange={set('budget')} /></Field>
          <Field label="Status"><Select value={f.status} onChange={set('status')} options={CAMPAIGN_STATUSES} /></Field>
          <Field label="Objektif"><Input value={f.objective} onChange={set('objective')} placeholder="Awareness Chicken Soup sepanjang Ramadan" /></Field>
          <Field label="Sasaran audiens" full><Input value={f.targetAudience} onChange={set('targetAudience')} /></Field>
          <Field label="Keterangan" full><Textarea value={f.description} onChange={set('description')} /></Field>
          <Field label="Platform" full group><MultiChips options={config.platforms} value={f.platforms} onChange={(platforms) => setF({ ...f, platforms })} /></Field>
          <Field label="Produk" full group><MultiChips options={config.products} value={f.products} onChange={(products) => setF({ ...f, products })} /></Field>
          <Field label="Kategori content" full group><MultiChips options={config.pillars} value={f.pillars} onChange={(pillars) => setF({ ...f, pillars })} /></Field>
        </div>
        <div className="form-actions" style={{ marginTop: 20 }}><Button onClick={() => navigate(-1)}>Batal</Button><Button variant="primary" busy={busy} onClick={save}>Simpan kempen</Button></div>
      </Card>
    </div>
  );
}
