// Borang creator (baru / edit). Rate card berasingan daripada fee yang dirunding dalam kempen.
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { createDoc, updateById, nextCode, logActivity } from '../lib/db';
import { AppError } from '../lib/errors';
import { CREATOR_STATUSES, CONTRACT_STATUSES, uid } from '../lib/constants';
import { PageHeader, Card, Button, Field, Input, Select, Textarea, MultiChips, Loading } from '../components/ui';

const EMPTY = {
  name: '', displayName: '', email: '', phone: '', contactPerson: '', location: '', language: '', tags: [], status: 'new',
  socials: [{ id: uid(), platform: 'TikTok', username: '', url: '', followers: '', er: '' }],
  audience: { age: '', gender: '', geo: '', niche: '', source: 'Diberi oleh creator' },
  rates: { video: '', reel: '', story: '', live: '', ugc: '', affiliatePct: '', notes: '' },
  relationshipOwnerId: '', firstContact: '', lastContact: '', communicationStatus: '', contractStatus: 'none', contractExpiry: '',
  paymentDetailsStatus: 'missing', previousCollabs: '', notes: '',
};

export default function CreatorForm() {
  const { id } = useParams();
  const { creatorById, staff, staffById, ready } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const { run } = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || f) return;
    const c = id ? creatorById[id] : null;
    setF(c ? { ...EMPTY, ...c, audience: { ...EMPTY.audience, ...(c.audience || {}) }, rates: { ...EMPTY.rates, ...(c.rates || {}) }, socials: c.socials?.length ? c.socials : EMPTY.socials } : { ...EMPTY, relationshipOwnerId: profile.staffId || '' });
  }, [ready, id, creatorById, f, profile.staffId]);

  if (!f) return <div className="page"><Loading /></div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setIn = (group, k) => (e) => setF({ ...f, [group]: { ...f[group], [k]: e.target.value } });
  const setSocial = (i, k, v) => setF({ ...f, socials: f.socials.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });

  const save = async () => {
    setBusy(true);
    const newId = await run(async () => {
      if (!f.name.trim()) throw new AppError('Nama creator wajib diisi.');
      const data = {
        ...f,
        name: f.name.trim(),
        socials: f.socials.filter((s) => s.username || s.url).map((s) => ({ ...s, followers: s.followers === '' ? null : Number(s.followers), er: s.er === '' ? null : Number(s.er) })),
        rates: Object.fromEntries(Object.entries(f.rates).map(([k, v]) => [k, k === 'notes' ? v : v === '' ? null : Number(v)])),
        relationshipOwnerName: staffById[f.relationshipOwnerId]?.name || '',
        archived: f.status === 'archived',
      };
      delete data.id; delete data.createdAt; delete data.updatedAt;
      if (id) {
        await updateById('creators', id, data, profile);
        return id;
      }
      const code = await nextCode('creators', 'CR');
      const nid = await createDoc('creators', { ...data, code }, profile);
      await logActivity(profile, { type: 'creator_created', message: `${profile.name} tambah creator ${data.name}`, refType: 'creator', refId: nid });
      return nid;
    }, 'Creator disimpan');
    setBusy(false);
    if (newId) navigate(`/creators/${newId}`);
  };

  return (
    <div className="page">
      <PageHeader crumb={<Link to="/creators">Creator</Link>} title={id ? `Edit ${f.name}` : 'Tambah creator'} actions={<><Button onClick={() => navigate(-1)}>Batal</Button><Button variant="primary" busy={busy} onClick={save}>Simpan</Button></>} />
      <Card>
        <div className="col gap-lg">
          <div className="form-section">
            <h2>Maklumat asas</h2>
            <div className="grid-2">
              <Field label="Nama creator" required><Input value={f.name} onChange={set('name')} /></Field>
              <Field label="Nama paparan"><Input value={f.displayName} onChange={set('displayName')} /></Field>
              <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
              <Field label="Telefon"><Input value={f.phone} onChange={set('phone')} /></Field>
              <Field label="Orang dihubungi / pengurus"><Input value={f.contactPerson} onChange={set('contactPerson')} /></Field>
              <Field label="Lokasi"><Input value={f.location} onChange={set('location')} /></Field>
              <Field label="Bahasa pilihan"><Input value={f.language} onChange={set('language')} placeholder="Bahasa Melayu" /></Field>
              <Field label="Status hubungan"><Select value={f.status} onChange={set('status')} options={CREATOR_STATUSES} /></Field>
              <Field label="Klasifikasi" full group hint="Boleh pilih lebih dari satu."><MultiChips options={config.creatorTags} value={f.tags} onChange={(tags) => setF({ ...f, tags })} allowNew /></Field>
            </div>
          </div>

          <div className="form-section">
            <div className="row" style={{ justifyContent: 'space-between' }}><h2>Profil media sosial</h2><Button size="sm" icon={Plus} onClick={() => setF({ ...f, socials: [...f.socials, { id: uid(), platform: 'Instagram', username: '', url: '', followers: '', er: '' }] })}>Tambah akaun</Button></div>
            {f.socials.map((s, i) => (
              <div key={s.id || i} className="grid-3" style={{ alignItems: 'end' }}>
                <Field label="Platform"><Select value={s.platform} onChange={(e) => setSocial(i, 'platform', e.target.value)} options={[...config.platforms, 'Lain-lain']} /></Field>
                <Field label="Username"><Input value={s.username} onChange={(e) => setSocial(i, 'username', e.target.value)} placeholder="@username" /></Field>
                <Field label="Link profil"><Input type="url" value={s.url} onChange={(e) => setSocial(i, 'url', e.target.value)} /></Field>
                <Field label="Pengikut"><Input type="number" min="0" value={s.followers ?? ''} onChange={(e) => setSocial(i, 'followers', e.target.value)} /></Field>
                <Field label="Engagement rate (%)"><Input type="number" min="0" step="0.1" value={s.er ?? ''} onChange={(e) => setSocial(i, 'er', e.target.value)} /></Field>
                <Button variant="ghost" icon={Trash2} onClick={() => setF({ ...f, socials: f.socials.filter((_, j) => j !== i) })}>Buang</Button>
              </div>
            ))}
          </div>

          <div className="form-section">
            <h2>Audiens</h2>
            <p className="muted small">Maklumat ini dari creator atau sumber luar, bukan disahkan.</p>
            <div className="grid-2">
              <Field label="Julat umur"><Input value={f.audience.age} onChange={setIn('audience', 'age')} placeholder="25–34: 48%" /></Field>
              <Field label="Jantina"><Input value={f.audience.gender} onChange={setIn('audience', 'gender')} placeholder="Wanita 82%" /></Field>
              <Field label="Geografi"><Input value={f.audience.geo} onChange={setIn('audience', 'geo')} placeholder="Selangor, KL, Johor" /></Field>
              <Field label="Niche audiens"><Input value={f.audience.niche} onChange={setIn('audience', 'niche')} /></Field>
              <Field label="Sumber"><Input value={f.audience.source} onChange={setIn('audience', 'source')} /></Field>
            </div>
          </div>

          <div className="form-section">
            <h2>Kadar rasmi (RM)</h2>
            <p className="muted small">Harga rasmi creator. Fee yang dirunding untuk setiap kempen disimpan dalam kempen.</p>
            <div className="grid-3">
              {[['video', 'Video'], ['reel', 'Reel'], ['story', 'Story'], ['live', 'Sesi live (sejam)'], ['ugc', 'Produksi UGC'], ['affiliatePct', 'Komisen affiliate (%)']].map(([k, l]) => (
                <Field key={k} label={l}><Input type="number" min="0" value={f.rates[k] ?? ''} onChange={setIn('rates', k)} /></Field>
              ))}
              <Field label="Nota kadar" full><Input value={f.rates.notes || ''} onChange={setIn('rates', 'notes')} /></Field>
            </div>
          </div>

          <div className="form-section">
            <h2>Hubungan</h2>
            <div className="grid-3">
              <Field label="Pemilik hubungan"><Select value={f.relationshipOwnerId} onChange={set('relationshipOwnerId')} options={staff.map((s) => ({ value: s.id, label: s.name }))} placeholder="Tiada" /></Field>
              <Field label="Hubungan pertama"><Input type="date" value={f.firstContact} onChange={set('firstContact')} /></Field>
              <Field label="Hubungan terakhir"><Input type="date" value={f.lastContact} onChange={set('lastContact')} /></Field>
              <Field label="Status komunikasi"><Input value={f.communicationStatus} onChange={set('communicationStatus')} placeholder="Menunggu balasan" /></Field>
              <Field label="Status kontrak"><Select value={f.contractStatus} onChange={set('contractStatus')} options={CONTRACT_STATUSES} /></Field>
              <Field label="Kontrak tamat"><Input type="date" value={f.contractExpiry} onChange={set('contractExpiry')} /></Field>
              <Field label="Maklumat bayaran"><Select value={f.paymentDetailsStatus} onChange={set('paymentDetailsStatus')} options={[{ value: 'missing', label: 'Belum diterima' }, { value: 'on_file', label: 'Sudah ada (disimpan di luar sistem ini)' }]} /></Field>
              <Field label="Kerjasama lepas" full><Textarea value={f.previousCollabs} onChange={set('previousCollabs')} rows={2} /></Field>
              <Field label="Nota" full><Textarea value={f.notes} onChange={set('notes')} rows={3} /></Field>
            </div>
            <p className="muted small">Jangan simpan nombor akaun bank atau IC dalam sistem ini.</p>
          </div>
        </div>
        <div className="form-actions" style={{ marginTop: 20 }}><Button onClick={() => navigate(-1)}>Batal</Button><Button variant="primary" busy={busy} onClick={save}>Simpan creator</Button></div>
      </Card>
    </div>
  );
}
