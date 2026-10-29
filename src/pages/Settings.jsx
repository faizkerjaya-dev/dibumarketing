// Settings: senarai boleh ubah (Admin), pengurusan pengguna (Admin), dan System check (untuk troubleshoot).
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { Plus, X, Copy, RefreshCw } from 'lucide-react';
import { db, auth, firebaseConfig, getSecondaryAuth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useFirestore';
import { can } from '../lib/permissions';
import { setById, linkStaffToUser } from '../lib/db';
import { AppError, explainError } from '../lib/errors';
import { DEFAULT_CONFIG, ROLES, uid } from '../lib/constants';
import { PAGES, EDITABLE_ROLES, DEFAULT_ROLE_ACCESS, BLOCKED, roleAccess } from '../lib/access';
import { STAGES, DEFAULT_STATUSES, statusList, validateStatuses } from '../lib/statuses';
import { isDebug, log } from '../lib/log';
import { diagnostics } from '../components/ErrorBoundary';
import { PageHeader, Card, Tabs, Button, Field, Input, Select, Modal, MultiChips, Pill, Loading, ErrorBox, Empty } from '../components/ui';

const LISTS = [
  ['platforms', 'Platform media sosial'], ['pillars', 'Kategori content'], ['contentTypes', 'Jenis content'], ['products', 'Produk'],
  ['checklist', 'Item senarai semak'], ['creatorTags', 'Tag creator'], ['deliverableTypes', 'Jenis deliverable'], ['linkCategories', 'Kategori link'],
];

function ListEditor({ label, items, onChange }) {
  const [draft, setDraft] = useState('');
  const add = () => { if (draft.trim() && !items.includes(draft.trim())) onChange([...items, draft.trim()]); setDraft(''); };
  return (
    <Card title={label}>
      <div className="chips">
        {items.map((it) => (
          <span key={it} className="chip on" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{it}
            <button type="button" className="link-btn" aria-label={`Buang ${it}`} onClick={() => onChange(items.filter((x) => x !== it))}><X size={14} /></button>
          </span>
        ))}
      </div>
      <div className="row gap-sm" style={{ marginTop: 10 }}>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Tambah item" />
        <Button icon={Plus} onClick={add}>Tambah</Button>
      </div>
    </Card>
  );
}

function GeneralTab() {
  const config = useConfig();
  const { profile } = useAuth();
  const { run } = useToast();
  const [draft, setDraft] = useState(config);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(config), [config]);
  // Status content diurus dalam tab Status. Ia TIDAK disimpan dari sini supaya "Kembali ke asal"
  // di tab Umum tidak memadam status yang sedang digunakan oleh content.
  const save = async () => {
    setBusy(true);
    const { contentStatuses, roleAccess: _ra, updatedAt, ...rest } = draft;
    await run(() => setById('settings', 'config', { ...rest, updatedBy: profile.name }), 'Tetapan disimpan');
    setBusy(false);
  };
  return (
    <div className="col gap-lg">
      <Card title="Jenama">
        <div className="grid-2">
          <Field label="Nama ruang kerja"><Input value={draft.brandName} onChange={(e) => setDraft({ ...draft, brandName: e.target.value })} /></Field>
          <Field label="Kapasiti mingguan lalai (jam)"><Input type="number" min="0" value={draft.defaultWeeklyCapacity} onChange={(e) => setDraft({ ...draft, defaultWeeklyCapacity: Number(e.target.value) || 0 })} /></Field>
        </div>
      </Card>
      <div className="grid-2">
        {LISTS.map(([k, label]) => <ListEditor key={k} label={label} items={draft[k] || []} onChange={(v) => setDraft({ ...draft, [k]: v })} />)}
      </div>
      <p className="muted small">Status content kini boleh diubah dalam tab Status. Status deliverable dan kempen masih tetap dalam kod.</p>
      <div className="form-actions">
        <Button onClick={() => setDraft({ ...DEFAULT_CONFIG, contentStatuses: config.contentStatuses })}>Kembali ke asal</Button>
        <Button variant="primary" busy={busy} onClick={save}>Simpan tetapan</Button>
      </div>
    </div>
  );
}

// Editor status content. Setiap status mesti dipetakan ke satu peringkat tetap,
// supaya laporan kekal sah walaupun nama status ditukar.
const TONES = ['gray', 'blue', 'violet', 'amber', 'teal', 'green', 'red'];

function StatusTab() {
  const config = useConfig();
  const { content } = useData();
  const { profile } = useAuth();
  const { run, error } = useToast();
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => setList(statusList(config).map((s) => ({ ...s }))), [config]);

  const used = useMemo(() => {
    const m = {};
    content.forEach((c) => { m[c.status] = (m[c.status] || 0) + 1; });
    return m;
  }, [content]);

  const update = (i, k, v) => setList((l) => l.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const move = (i, dir) => setList((l) => {
    const n = [...l];
    const j = i + dir;
    if (j < 0 || j >= n.length) return n;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const add = () => setList((l) => [...l, { key: `status_${uid()}`, label: '', tone: 'gray', stage: 'production' }]);
  const remove = (i) => {
    const s = list[i];
    if (used[s.key]) { error({ code: 'validation', message: `“${s.label}” sedang digunakan oleh ${used[s.key]} content. Pindahkan content itu dahulu.` }); return; }
    setList((l) => l.filter((_, j) => j !== i));
  };

  const errors = validateStatuses(list);
  const save = async () => {
    setBusy(true);
    await run(async () => {
      if (errors.length) throw new AppError(errors[0]);
      await setById('settings', 'config', { contentStatuses: list.map((s) => ({ key: s.key, label: s.label.trim(), tone: s.tone, stage: s.stage })), updatedBy: profile.name });
    }, 'Status disimpan');
    setBusy(false);
  };

  return (
    <div className="col gap-lg">
      <Card title="Status content" subtitle="Lajur dalam Papan kerja mengikut senarai ini, ikut susunan.">
        <div className="warnbox" style={{ marginBottom: 14 }}>
          <div>
            <strong>Kenapa perlu pilih peringkat</strong>
            <span>Nama status bebas anda ubah. Laporan, dashboard dan syarat aliran kerja pula merujuk peringkat tetap, bukan nama. Dengan cara ini laporan lama kekal sah walaupun nama status ditukar.</span>
            <span>Syarat: status peringkat <strong>Terbit</strong> memerlukan link post dan tarikh terbit sebenar. Peringkat <strong>Sedia terbit</strong> memerlukan tarikh terbit.</span>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 640 }}>
            <thead><tr><th style={{ width: 70 }}>Susun</th><th>Nama status</th><th>Peringkat tetap</th><th>Warna</th><th className="num">Digunakan</th><th /></tr></thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={s.key}>
                  <td>
                    <div className="row gap-xs">
                      <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Naik" onClick={() => move(i, -1)}>↑</button>
                      <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Turun" onClick={() => move(i, 1)}>↓</button>
                    </div>
                  </td>
                  <td><Input value={s.label} onChange={(e) => update(i, 'label', e.target.value)} placeholder="Nama status" /></td>
                  <td><Select value={s.stage} onChange={(e) => update(i, 'stage', e.target.value)} options={STAGES.map((x) => ({ value: x.key, label: x.label }))} /></td>
                  <td><Select value={s.tone} onChange={(e) => update(i, 'tone', e.target.value)} options={TONES.map((t) => ({ value: t, label: t }))} /></td>
                  <td className="num">{used[s.key] || 0}</td>
                  <td className="right"><Button size="sm" variant="ghost" onClick={() => remove(i)}>Buang</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row gap-sm wrap" style={{ marginTop: 12 }}>
          <Button icon={Plus} onClick={add}>Tambah status</Button>
          <Button onClick={() => setList(DEFAULT_STATUSES.map((s) => ({ ...s })))}>Kembali ke asal</Button>
          <div className="grow" />
          <Button variant="primary" busy={busy} disabled={errors.length > 0} onClick={save}>Simpan status</Button>
        </div>
        {errors.map((e) => <p key={e} className="danger-text small" style={{ marginTop: 8 }}>{e}</p>)}
      </Card>
    </div>
  );
}

// Akses halaman setiap role. Admin sentiasa ada semua akses.
// Kotak yang dimatikan = data halaman itu disekat oleh firestore.rules untuk role tersebut.
function RoleAccessTab() {
  const config = useConfig();
  const { profile } = useAuth();
  const { run } = useToast();
  const init = () => Object.fromEntries(EDITABLE_ROLES.map((r) => [r, roleAccess(config, r)]));
  const [draft, setDraft] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(init()), [config]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (r, k) => setDraft((d) => ({ ...d, [r]: d[r].includes(k) ? d[r].filter((x) => x !== k) : [...d[r], k] }));
  const save = async () => {
    setBusy(true);
    await run(() => setById('settings', 'config', { roleAccess: draft, updatedBy: profile.name }), 'Akses role disimpan');
    setBusy(false);
  };
  return (
    <Card title="Akses role" subtitle="Tanda halaman yang boleh dibuka oleh setiap role. Pengguna dengan lebih dari satu role dapat gabungan semua akses.">
      <div className="warnbox" style={{ marginBottom: 14 }}>
        <div>
          <strong>Apa yang dikawal di sini</strong>
          <span>Menu dan halaman yang boleh dibuka. Butang tindakan (edit, luluskan, padam, bayaran) tetap ikut role seperti dalam README bahagian 8. Admin sentiasa nampak semua.</span>
          <span>Kotak kelabu tidak boleh ditanda kerana data halaman itu memang disekat untuk role tersebut (contoh: Content Creator hanya boleh baca content dia sendiri).</span>
        </div>
      </div>
      <div className="table-wrap"><table className="table access-table" style={{ minWidth: 720 }}>
        <thead><tr><th>Halaman</th><th className="center">Admin</th>{EDITABLE_ROLES.map((r) => <th key={r} className="center">{ROLES[r]}</th>)}</tr></thead>
        <tbody>{PAGES.map((pg) => (
          <tr key={pg.key}>
            <td>{pg.label}</td>
            <td className="center small strong" style={{ color: 'var(--green-fg)' }} aria-label="Admin sentiasa ada akses">✓</td>
            {EDITABLE_ROLES.map((r) => {
              const blocked = (BLOCKED[r] || []).includes(pg.key);
              return <td key={r} className="center"><input type="checkbox" checked={!blocked && draft[r].includes(pg.key)} disabled={blocked} title={blocked ? 'Data disekat untuk role ini' : ''} aria-label={`${ROLES[r]}: ${pg.label}`} onChange={() => toggle(r, pg.key)} /></td>;
            })}
          </tr>
        ))}</tbody>
      </table></div>
      <div className="row gap-sm wrap" style={{ marginTop: 12 }}>
        <Button onClick={() => setDraft({ ...DEFAULT_ROLE_ACCESS })}>Kembali ke asal</Button>
        <div className="grow" />
        <Button variant="primary" busy={busy} onClick={save}>Simpan akses</Button>
      </div>
    </Card>
  );
}

function UserModal({ open, onClose, user }) {
  const { staff, staffById } = useData();
  const { run } = useToast();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(user ? { ...user, roles: user.roles || [] } : { name: '', email: '', password: '', roles: ['content_creator'], staffId: '', active: true });
  }, [open, user]);

  const roleKeys = Object.keys(ROLES);
  const save = async () => {
    setBusy(true);
    const ok = await run(async () => {
      if (!f.name?.trim()) throw new AppError('Nama wajib diisi.');
      if (!f.roles.length) throw new AppError('Pilih sekurang-kurangnya satu role.');
      let uidValue = user?.id;
      if (!user) {
        if (!f.email || !f.password) throw new AppError('Email dan kata laluan sementara wajib diisi.');
        const secondary = getSecondaryAuth();
        const cred = await createUserWithEmailAndPassword(secondary, f.email.trim(), f.password);
        uidValue = cred.user.uid;
        await signOut(secondary);
        log.info('auth user created', uidValue);
      }
      await setDoc(doc(db, 'users', uidValue), {
        name: f.name.trim(), email: (f.email || '').trim(), roles: f.roles, staffId: f.staffId || '', active: f.active !== false, updatedAt: serverTimestamp(),
      }, { merge: true });
      if ((user?.staffId || '') !== (f.staffId || '') || !user) await linkStaffToUser(f.staffId || '', uidValue, staffById);
    }, user ? 'Pengguna dikemas kini' : 'Pengguna dicipta');
    setBusy(false);
    if (ok) onClose();
  };

  const rolesValue = (f.roles || []).map((r) => ROLES[r]);
  return (
    <Modal open={open} onClose={onClose} title={user ? `Edit ${user.name}` : 'Tambah pengguna'} footer={<><Button onClick={onClose}>Batal</Button><Button variant="primary" busy={busy} onClick={save}>Simpan</Button></>}>
      <div className="grid-2">
        <Field label="Nama" required><Input value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email" required={!user}><Input type="email" value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} disabled={!!user} /></Field>
        {!user && <Field label="Kata laluan sementara" required hint="Minimum 6 aksara. Minta pengguna tukar selepas log masuk."><Input type="text" value={f.password || ''} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>}
        <Field label="Pautan profil staf" hint="Wajib untuk Content Creator supaya tugasan dia kelihatan."><Select value={f.staffId || ''} onChange={(e) => setF({ ...f, staffId: e.target.value })} options={staff.map((s) => ({ value: s.id, label: `${s.name}${s.userUid && s.userUid !== user?.id ? ' (sudah dipautkan ke akaun lain)' : ''}` }))} placeholder="Belum dipautkan" /></Field>
        <Field label="Peranan" full group hint="Boleh lebih dari satu. Kebenaran digabungkan."><MultiChips options={roleKeys.map((r) => ROLES[r])} value={rolesValue} onChange={(labels) => setF({ ...f, roles: roleKeys.filter((r) => labels.includes(ROLES[r])) })} /></Field>
        {user && <label className="check field-full"><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif (buang tanda untuk sekat akses)</label>}
      </div>
    </Modal>
  );
}

function UsersTab() {
  const q = useMemo(() => collection(db, 'users'), []);
  const { data, loading, error } = useQuery(q, [q]);
  const { staffById } = useData();
  const { run } = useToast();
  const [modal, setModal] = useState(null);
  return (
    <Card title="Pengguna" subtitle="Akaun log masuk. Untuk buang akses, buang tanda Aktif. Padam akaun Auth dibuat dalam Firebase Console." actions={<Button variant="primary" icon={Plus} onClick={() => setModal({})}>Tambah pengguna</Button>}>
      {loading && <Loading />}
      <ErrorBox error={error} />
      {!loading && !data.length && <Empty title="Tiada pengguna" />}
      <div className="table-wrap"><table className="table" style={{ minWidth: 720 }}>
        <thead><tr><th>Nama</th><th>Peranan</th><th>Profil staf</th><th>Status</th><th /></tr></thead>
        <tbody>{[...data].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((u) => (
          <tr key={u.id}>
            <td><strong>{u.name}</strong><div className="small muted">{u.email}</div></td>
            <td><div className="row gap-xs wrap">{(u.roles || []).map((r) => <span key={r} className="tag">{ROLES[r] || r}</span>)}</div></td>
            <td>{u.staffId ? staffById[u.staffId]?.name || <span className="danger-text">Staf tiada</span> : <span className="muted">Belum dipautkan</span>}</td>
            <td>{u.active === false ? <Pill tone="gray">Tidak aktif</Pill> : <Pill tone="green">Aktif</Pill>}</td>
            <td className="right"><div className="row gap-xs" style={{ justifyContent: 'flex-end' }}>
              {u.email && <Button size="sm" variant="ghost" onClick={() => run(() => sendPasswordResetEmail(auth, u.email), 'Email reset dihantar')}>Reset kata laluan</Button>}
              <Button size="sm" onClick={() => setModal({ user: u })}>Edit</Button>
            </div></td>
          </tr>
        ))}</tbody>
      </table></div>
      <UserModal open={!!modal} onClose={() => setModal(null)} user={modal?.user} />
    </Card>
  );
}

function SystemCheck() {
  const { profile, user } = useAuth();
  const data = useData();
  const { run } = useToast();
  const [tests, setTests] = useState(null);
  const [copied, setCopied] = useState(false);
  const [debug, setDebug] = useState(isDebug());

  const runTests = async () => {
    const results = [];
    const probe = async (name, fn) => {
      try { const detail = await fn(); results.push({ name, ok: true, detail }); } catch (e) { const x = explainError(e); results.push({ name, ok: false, detail: `${x.code}: ${x.title}`, link: x.link }); }
    };
    await probe('Baca profil sendiri (users)', async () => { const s = await getDoc(doc(db, 'users', user.uid)); return s.exists() ? 'dijumpai' : 'tiada'; });
    await probe('Baca settings/config', async () => { const s = await getDoc(doc(db, 'settings', 'config')); return s.exists() ? 'dijumpai' : 'belum dicipta, guna tetapan asal'; });
    if (can(profile, 'view.all')) {
      for (const col of ['metrics', 'activity', 'comments']) await probe(`Baca ${col}`, async () => `${(await getDocs(query(collection(db, col), limit(1)))).size} dokumen diuji`);
    }
    if (can(profile, 'settings.manage')) {
      await probe('Ujian tulis (settings/healthcheck)', async () => { await setDoc(doc(db, 'settings', 'healthcheck'), { at: serverTimestamp(), by: profile.name }); return 'tulis OK'; });
    }
    setTests(results);
  };

  const toggleDebug = () => {
    const next = !debug;
    try { localStorage.setItem('dibu_debug', next ? '1' : '0'); } catch { /* ignore */ }
    setDebug(next);
  };

  const listeners = ['content', 'tasks', 'staff', 'campaigns', 'creators', 'campaignCreators', 'deliverables'].map((n) => ({
    n, count: data[n].length, loading: data.loading[n], error: data.errors[n],
  }));
  const report = () => diagnostics({
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    uid: user?.uid, email: user?.email, roles: profile?.roles, staffId: profile?.staffId,
    linkedStaffFound: !!data.myStaff, listeners: listeners.map((l) => ({ ...l, error: l.error ? `${l.error.code}: ${l.error.message}` : null })), tests,
  });

  return (
    <div className="col gap-lg">
      <Card title="Persekitaran">
        <ul className="syscheck">
          <li><Pill tone="green">OK</Pill><span>Projek Firebase <code>{firebaseConfig.projectId}</code> · auth domain <code>{firebaseConfig.authDomain}</code></span></li>
          <li><Pill tone="green">OK</Pill><span>Log masuk sebagai <strong>{user?.email}</strong> · UID <code className="select-all">{user?.uid}</code></span></li>
          <li><Pill tone={profile?.roles?.length ? 'green' : 'red'}>{profile?.roles?.length ? 'OK' : 'BAIKI'}</Pill><span>Role: {(profile?.roles || []).map((r) => ROLES[r] || r).join(', ') || 'tiada'}</span></li>
          <li><Pill tone={data.myStaff ? 'green' : 'amber'}>{data.myStaff ? 'OK' : 'NOTA'}</Pill><span>{data.myStaff ? `Dipautkan ke profil staf ${data.myStaff.name}` : 'Akaun ini tidak dipautkan ke profil staf. Perlu untuk Content Creator dan halaman Hari ini.'}</span></li>
        </ul>
      </Card>
      <Card title="Sambungan data langsung" subtitle="Setiap koleksi Firestore yang didengar oleh app.">
        <ul className="syscheck">
          {listeners.map((l) => (
            <li key={l.n}>
              <Pill tone={l.error ? 'red' : l.loading ? 'amber' : 'green'}>{l.error ? 'RALAT' : l.loading ? 'MEMUAT' : 'OK'}</Pill>
              <span className="grow"><code>{l.n}</code> · {l.count} rekod{l.error && <> · <span className="danger-text">{explainError(l.error).code}: {explainError(l.error).title}</span></>}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Ujian kebenaran" actions={<Button icon={RefreshCw} onClick={() => run(runTests)}>Jalankan ujian</Button>}>
        {!tests && <p className="muted small">Tekan Jalankan ujian untuk semak akses baca dan tulis mengikut role anda.</p>}
        {tests && <ul className="syscheck">{tests.map((t) => <li key={t.name}><Pill tone={t.ok ? 'green' : 'red'}>{t.ok ? 'OK' : 'GAGAL'}</Pill><span className="grow">{t.name} · {t.detail}{t.link && <> · <a href={t.link} target="_blank" rel="noreferrer">cipta index</a></>}</span></li>)}</ul>}
      </Card>
      <Card title="Alat troubleshoot">
        <div className="row gap-sm wrap">
          <Button icon={Copy} onClick={() => { navigator.clipboard?.writeText(report()); setCopied(true); }}>{copied ? 'Disalin' : 'Salin diagnostik'}</Button>
          <Button onClick={toggleDebug}>{debug ? 'Matikan log debug' : 'Hidupkan log debug'}</Button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>Log debug memaparkan setiap bacaan dan tulisan Firestore dalam Console (F12). Diagnostik mengandungi 40 log terakhir; tiada kata laluan disertakan.</p>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { profile } = useAuth();
  const isAdmin = can(profile, 'settings.manage');
  const [tab, setTab] = useState(isAdmin ? 'general' : 'system');
  const tabs = [
    isAdmin && { key: 'general', label: 'Umum' },
    isAdmin && { key: 'status', label: 'Status' },
    can(profile, 'users.manage') && { key: 'users', label: 'Pengguna' },
    isAdmin && { key: 'access', label: 'Akses role' },
    { key: 'system', label: 'Semakan sistem' },
  ].filter(Boolean);
  return (
    <div className="page">
      <PageHeader title="Tetapan" />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'general' && isAdmin && <GeneralTab />}
      {tab === 'status' && isAdmin && <StatusTab />}
      {tab === 'users' && can(profile, 'users.manage') && <UsersTab />}
      {tab === 'access' && isAdmin && <RoleAccessTab />}
      {tab === 'system' && <SystemCheck />}
    </div>
  );
}
