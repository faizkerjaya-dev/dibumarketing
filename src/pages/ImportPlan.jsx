// Import pelan content dari Excel. Langkah: pilih fail → semak tetapan & padanan pemilik → pratonton → import.
// Format pelan matriks (seperti "Pelan 30 Hari") dan format senarai (templat) dikesan automatik.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection } from 'firebase/firestore';
import { Upload, Download, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useFirestore';
import { can } from '../lib/permissions';
import { importPlanRows, setById, deleteImportBatch } from '../lib/db';
import { statusForStage, stageOf } from '../lib/statuses';
import { readWorkbook, detectPlan, addDaysIso, toWeekday, TEMPLATE_HEADER, TEMPLATE_EXAMPLE } from '../lib/importPlan';
import { writeXlsx } from '../lib/xlsx';
import { typeColor } from '../lib/colors';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { PageHeader, Card, Button, Field, Input, Select, Pill, Empty, Loading, ErrorBox, Modal } from '../components/ui';
import { Trash2 } from 'lucide-react';

const MAP_KEY = 'dibu_import_owner_map';
const readMap = () => { try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); } catch { return {}; } };
const GENERAL = 'General';

// Senarai import terdahulu, dikumpul ikut masa import. Admin boleh padam satu import sekaligus.
function ImportHistory() {
  const { content, tasks } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const { run } = useToast();
  const isAdmin = can(profile, 'settings.manage');
  const [target, setTarget] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const batches = useMemo(() => {
    const m = new Map();
    content.filter((c) => c.importedAt).forEach((c) => { m.set(c.importedAt, [...(m.get(c.importedAt) || []), c]); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([at, list]) => {
      const dates = list.map((c) => c.publishDate).filter(Boolean).sort();
      const ids = new Set(list.map((c) => c.id));
      return {
        at, list, source: list[0].importSource || 'Fail tanpa nama', by: list[0].createdBy || '',
        from: dates[0], to: dates[dates.length - 1],
        touched: list.filter((c) => stageOf(config, c.status) !== 'idea').length,
        taskCount: tasks.filter((t) => ids.has(t.contentId)).length,
      };
    });
  }, [content, tasks, config]);

  if (!batches.length) return null;

  const doDelete = async () => {
    setBusy(true);
    const res = await run(() => deleteImportBatch(target.list, tasks, profile));
    setBusy(false);
    if (res) {
      setTarget(null); setTyped('');
      run(async () => {}, `${res.content} content dan ${res.tasks} tugasan dipadam`);
    }
  };

  return (
    <Card title="Import terdahulu" subtitle={isAdmin ? 'Tersalah import? Padam satu import sekaligus. Hanya Admin boleh padam.' : 'Hanya Admin boleh memadam import.'}>
      <div className="col">
        {batches.map((b) => (
          <div key={b.at} className="list-row wrap">
            <span className="grow min0" style={{ flexBasis: 280 }}>
              <strong>{b.source}</strong>
              <span className="small muted block">{fmtDateTime(b.at)}{b.by ? ` · oleh ${b.by}` : ''} · pos {fmtDate(b.from)} – {fmtDate(b.to, { year: 'numeric' })}</span>
            </span>
            <Pill tone="gray">{b.list.length} content</Pill>
            {b.taskCount > 0 && <Pill tone="gray">{b.taskCount} tugasan</Pill>}
            {b.touched > 0 && <Pill tone="amber">{b.touched} sudah bergerak dari Idea</Pill>}
            {isAdmin && <Button size="sm" variant="danger" icon={Trash2} onClick={() => { setTarget(b); setTyped(''); }}>Padam import ini</Button>}
          </div>
        ))}
      </div>
      {target && (
        <Modal open title="Padam import" onClose={() => setTarget(null)} footer={<>
          <Button onClick={() => setTarget(null)}>Batal</Button>
          <Button variant="danger" icon={Trash2} busy={busy} disabled={typed.trim().toUpperCase() !== 'PADAM'} onClick={doDelete}>Padam {target.list.length} content</Button>
        </>}>
          <p>Ini akan memadam <strong>{target.list.length} content</strong> dari “{target.source}” dan <strong>{target.taskCount} tugasan</strong> berkaitan. Tindakan ini tidak boleh dibatalkan.</p>
          {target.touched > 0 && <div className="warnbox"><div><strong>{target.touched} content sudah diusahakan</strong><span>Statusnya bukan Idea lagi. Brief, link dan senarai semak dalam content itu juga akan hilang.</span></div></div>}
          <Field label="Taip PADAM untuk sahkan"><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus placeholder="PADAM" /></Field>
        </Modal>
      )}
    </Card>
  );
}

export default function ImportPlan() {
  const { staff, staffById, content } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const { run } = useToast();
  const isAdmin = can(profile, 'settings.manage');
  const usersQ = useQuery(useMemo(() => (isAdmin ? collection(db, 'users') : null), [isAdmin]), [isAdmin]);
  const fileRef = useRef(null);

  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [opt, setOpt] = useState({ platform: config.platforms[0] || '', lead: 28, weekdayShoot: true, createTasks: true, addTypes: true, keepGeneralIdea: false, general: [] });
  const [ownerMap, setOwnerMap] = useState({});

  // Padanan automatik: email staf, email akaun log masuk (Admin), atau nama.
  const autoMatch = (key) => {
    const k = key.toLowerCase();
    const saved = readMap()[k];
    if (saved && staffById[saved]) return saved;
    const byStaffEmail = staff.find((s) => (s.email || '').toLowerCase() === k);
    if (byStaffEmail) return byStaffEmail.id;
    const user = usersQ.data.find((u) => (u.email || '').toLowerCase() === k);
    if (user?.staffId && staffById[user.staffId]) return user.staffId;
    const byName = staff.find((s) => (s.name || '').trim().toLowerCase() === k);
    return byName?.id || '';
  };

  const onFile = async (file) => {
    if (!file) return;
    setError(null); setDone(null); setPlan(null); setReading(true); setFileName(file.name);
    try {
      const sheets = await readWorkbook(file);
      const p = detectPlan(sheets);
      if (!p) throw Object.assign(new Error('Tiada pelan dijumpai. Pastikan ada lajur "Tarikh post" (atau "Tarikh pos"), atau guna templat.'), { code: 'validation' });
      setPlan(p);
      setOpt((o) => ({ ...o, lead: p.lead || o.lead, general: p.types.filter((t) => /promosi|promo/i.test(t.name)).map((t) => t.name) }));
      setOwnerMap(Object.fromEntries(p.people.map((k) => [k, autoMatch(k)])));
    } catch (e) {
      setError(e);
    } finally {
      setReading(false);
    }
  };

  // Senarai akaun (Admin) mungkin siap dimuat selepas fail dibaca: cuba padankan semula email yang masih kosong.
  useEffect(() => {
    if (!plan) return;
    setOwnerMap((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v || autoMatch(k)])));
  }, [usersQ.data, staff]); // eslint-disable-line react-hooks/exhaustive-deps

  const existingKeys = useMemo(() => new Set(content.map((c) => `${c.publishDate}|${(c.title || '').trim().toLowerCase()}`)), [content]);

  const rows = useMemo(() => {
    if (!plan) return [];
    const general = new Set(opt.general);
    return plan.rows.map((r) => {
      const isGeneral = general.has(r.type);
      const shootRaw = r.shootDate || (plan.format === 'matrix' && r.publishDate && opt.lead ? addDaysIso(r.publishDate, -Number(opt.lead)) : '');
      const shootDate = shootRaw && opt.weekdayShoot ? toWeekday(shootRaw) : shootRaw;
      const title = isGeneral ? 'General: isi idea kemudian' : r.title;
      const notes = [
        ...(r.flags || []),
        isGeneral && opt.keepGeneralIdea ? `Cadangan asal dalam jadual (bukan promosi sebenar): ${r.title}` : null,
        r.notes,
      ].filter(Boolean).join('\n');
      const ownerStaffId = r.owner ? ownerMap[r.owner] || '' : '';
      return {
        key: r.key,
        title,
        publishDate: r.publishDate,
        shootDate,
        publishTime: r.publishTime || '',
        type: isGeneral ? GENERAL : r.type,
        pillar: r.pillar || '',
        platform: r.platform || opt.platform,
        ownerKey: r.owner,
        ownerStaffId,
        isGeneral,
        set: r.set,
        brief: { topic: r.topic || '', hook: r.hook || '', notes },
        duplicate: !isGeneral && existingKeys.has(`${r.publishDate}|${title.trim().toLowerCase()}`),
      };
    });
  }, [plan, opt, ownerMap, existingKeys]);

  const toImport = rows.filter((r) => !r.duplicate);
  const unmatched = plan ? plan.people.filter((k) => !ownerMap[k]) : [];
  const dates = toImport.map((r) => r.publishDate).filter(Boolean).sort();
  const perOwner = {};
  toImport.forEach((r) => { const n = staffById[r.ownerStaffId]?.name || 'Tiada pemilik'; perOwner[n] = (perOwner[n] || 0) + 1; });
  const newTypes = [...new Set(toImport.map((r) => r.type).filter((t) => t && !(config.contentTypes || []).includes(t)))];

  const doImport = async () => {
    setBusy(true);
    try { localStorage.setItem(MAP_KEY, JSON.stringify({ ...readMap(), ...Object.fromEntries(Object.entries(ownerMap).filter(([, v]) => v).map(([k, v]) => [k.toLowerCase(), v])) })); } catch { /* abaikan */ }
    const res = await run(async () => {
      if (isAdmin && opt.addTypes && newTypes.length) {
        // Jenis baharu diletak di HADAPAN senarai: hanya 8 jenis pertama dapat warna tersendiri dalam kalendar.
        await setById('settings', 'config', { contentTypes: [...newTypes, ...(config.contentTypes || []).filter((t) => !newTypes.includes(t))] });
      }
      return importPlanRows(toImport.map((r) => ({
        title: r.title, publishDate: r.publishDate, shootDate: r.shootDate, publishTime: r.publishTime, type: r.type, pillar: r.pillar,
        platform: r.platform, ownerStaffId: r.ownerStaffId, status: statusForStage(config, 'idea'), brief: r.brief,
      })), { profile, staffById, createTasks: opt.createTasks, source: fileName });
    });
    setBusy(false);
    if (res) { setDone({ ...res, first: dates[0] }); setPlan(null); }
  };

  const downloadTemplate = () => {
    const widths = TEMPLATE_HEADER.map((h, i) => (i === 2 ? 46 : Math.max(12, h.length + 4)));
    const url = URL.createObjectURL(writeXlsx([TEMPLATE_HEADER, ...TEMPLATE_EXAMPLE], { sheetName: 'Pelan', widths }));
    const a = document.createElement('a');
    a.href = url; a.download = 'templat_pelan_content.xlsx'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (!can(profile, 'content.create')) return <div className="page"><Empty title="Tiada akses" text="Hanya Admin, Marketing Manager dan Content Manager boleh import pelan." /></div>;

  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <PageHeader title="Import pelan content" crumb={<Link to="/calendar">Kalendar</Link>} actions={<Button icon={Download} onClick={downloadTemplate}>Muat turun templat</Button>}>
        <p className="muted small" style={{ marginTop: 4 }}>Upload fail Excel pelan content. Setiap idea jadi satu content dalam kalendar, siap dengan tarikh pos, tarikh shoot dan pemilik.</p>
      </PageHeader>

      {done && (
        <div className="okbox" style={{ alignItems: 'center' }}>
          <CheckCircle2 size={20} />
          <div><strong>{done.content} content diimport{done.tasks ? `, ${done.tasks} tugasan shoot dicipta` : ''}.</strong><span>Semua bermula dengan status Idea. Pemilik dapat satu notifikasi.</span></div>
          <span className="grow" />
          <Link className="btn btn-primary btn-sm" to="/calendar">Buka kalendar</Link>
        </div>
      )}

      <Card>
        <div
          className="dropzone"
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
        >
          <FileSpreadsheet size={28} />
          <strong>{fileName || 'Pilih atau seret fail Excel ke sini'}</strong>
          <span className="small muted">.xlsx atau .csv · Pelan matriks (seperti “Pelan 30 Hari”) atau templat senarai</span>
          <Button size="sm" icon={Upload} onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>{fileName ? 'Tukar fail' : 'Pilih fail'}</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {reading && <Loading text="Membaca fail…" />}
        <ErrorBox error={error} />
      </Card>

      {plan && <>
        <Card title={plan.title || plan.sheet} subtitle={`Tab “${plan.sheet}” · ${plan.format === 'matrix' ? 'pelan matriks' : 'senarai'} · ${plan.rows.length} idea${dates.length ? ` · pos ${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1], { year: 'numeric' })}` : ''}`}>
          {plan.issues.length > 0 && <div className="warnbox" style={{ marginBottom: 12 }}><div><strong>{plan.issues.length} baris perlu disemak</strong>{plan.issues.slice(0, 5).map((x) => <span key={x}>{x}</span>)}</div></div>}
          <div className="grid-3">
            <Field label="Platform" hint={plan.format === 'list' ? 'Untuk baris tanpa lajur platform' : 'Semua content dalam pelan ini'}><Select value={opt.platform} onChange={(e) => setOpt({ ...opt, platform: e.target.value })} options={config.platforms} /></Field>
            {plan.format === 'matrix' && <Field label="Shoot berapa hari sebelum pos" hint={plan.lead ? `Dari fail: ${plan.lead} hari` : 'Kosongkan jika tiada tarikh shoot'}><Input type="number" min="0" value={opt.lead} onChange={(e) => setOpt({ ...opt, lead: e.target.value })} /></Field>}
            <Field label="Status awal"><Input value="Idea" disabled /></Field>
          </div>
          <div className="col gap-xs" style={{ marginTop: 10 }}>
            {plan.format === 'matrix' && <label className="check"><input type="checkbox" checked={opt.weekdayShoot} onChange={(e) => setOpt({ ...opt, weekdayShoot: e.target.checked })} />Shoot hari bekerja sahaja: jika jatuh Sabtu atau Ahad, alih ke Jumaat sebelumnya</label>}
            <label className="check"><input type="checkbox" checked={opt.createTasks} onChange={(e) => setOpt({ ...opt, createTasks: e.target.checked })} />Cipta tugasan Shooting untuk pemilik, deadline pada tarikh shoot (muncul dalam Hari ini)</label>
            {isAdmin && newTypes.length > 0 && <label className="check"><input type="checkbox" checked={opt.addTypes} onChange={(e) => setOpt({ ...opt, addTypes: e.target.checked })} />Tambah jenis content baharu ke Tetapan (di hadapan senarai supaya dapat warna sendiri dalam kalendar): {newTypes.join(', ')}</label>}
          </div>
        </Card>

        <Card title="Jenis content" subtitle="Tanda jenis yang patut jadi General. Tajuknya akan diganti “General: isi idea kemudian” kerana isi dalam jadual bukan pelan sebenar.">
          <div className="type-grid">
            {plan.types.map((t) => {
              const on = opt.general.includes(t.name);
              const n = plan.rows.filter((r) => r.type === t.name).length;
              return (
                <label key={t.name} className={`type-opt${on ? ' on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => setOpt((o) => ({ ...o, general: on ? o.general.filter((x) => x !== t.name) : [...o.general, t.name] }))} />
                  <span className="dot" style={{ background: on ? typeColor(config, GENERAL) : typeColor(config, t.name) }} />
                  <span className="grow"><strong>{t.name}</strong>{t.set && <span className="small muted"> · set {t.set}</span>}</span>
                  <span className="small muted">{n}</span>
                  {on && <Pill tone="amber">General</Pill>}
                </label>
              );
            })}
          </div>
          {opt.general.length > 0 && <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={opt.keepGeneralIdea} onChange={(e) => setOpt({ ...opt, keepGeneralIdea: e.target.checked })} />Simpan teks asal dalam nota brief sebagai rujukan (ditanda “bukan promosi sebenar”)</label>}
        </Card>

        {plan.people.length > 0 && (
          <Card title="Padankan pemilik" subtitle={plan.format === 'matrix' ? 'Lajur email dalam fail menentukan siapa buat set A atau B setiap hari. Pilih profil staf bagi setiap email.' : 'Pilih profil staf bagi setiap nilai dalam lajur Pemilik.'}>
            <div className="col">
              {plan.people.map((k) => (
                <div key={k} className="list-row wrap">
                  <span className="grow min0" style={{ flexBasis: 240 }}><strong>{k}</strong><span className="small muted block">{plan.rows.filter((r) => r.owner === k).length} content</span></span>
                  <Select value={ownerMap[k] || ''} onChange={(e) => setOwnerMap((m) => ({ ...m, [k]: e.target.value }))} options={staff.filter((s) => s.status !== 'inactive').map((s) => ({ value: s.id, label: `${s.name}${s.email ? ` · ${s.email}` : ''}` }))} placeholder="Tiada pemilik" style={{ width: 300 }} />
                  {ownerMap[k] ? <Pill tone="green">Dipadankan</Pill> : <Pill tone="amber">Belum dipadankan</Pill>}
                </div>
              ))}
            </div>
            {unmatched.length > 0 && <p className="small muted" style={{ marginTop: 8 }}>Tiada profil staf? Tambah dahulu di Pasukan › Tambah staf (isi email yang sama), kemudian kembali ke sini.</p>}
          </Card>
        )}

        <Card title={`Pratonton · ${toImport.length} content akan diimport`} subtitle={rows.length - toImport.length ? `${rows.length - toImport.length} dilangkau kerana tajuk dan tarikh pos yang sama sudah wujud.` : 'Tiada pertindihan dengan content sedia ada.'}>
          <div className="row gap-sm wrap" style={{ marginBottom: 10 }}>
            {Object.entries(perOwner).map(([n, c]) => <span key={n} className="legend-chip">{n} <strong>{c}</strong></span>)}
          </div>
          <div className="table-wrap"><table className="table" style={{ minWidth: 860 }}>
            <thead><tr><th>Pos</th><th>Shoot</th><th>Tajuk</th><th>Jenis</th><th>Pemilik</th><th>Nota</th></tr></thead>
            <tbody>{rows.slice(0, 80).map((r) => (
              <tr key={r.key} className={r.duplicate ? 'row-muted' : ''}>
                <td className="small">{fmtDate(r.publishDate, { weekday: 'short' })}</td>
                <td className="small">{r.shootDate ? fmtDate(r.shootDate, { weekday: 'short' }) : '—'}</td>
                <td>{r.isGeneral ? <span className="muted">{r.title}</span> : r.title}{r.duplicate && <Pill tone="gray">Sudah wujud</Pill>}</td>
                <td><span className="meta-dot"><span className="dot" style={{ background: typeColor(config, r.type) }} />{r.type || '—'}</span></td>
                <td className="small">{staffById[r.ownerStaffId]?.name || <span className="danger-text">{r.ownerKey || 'Tiada'}</span>}</td>
                <td className="small muted">{r.brief.notes.split('\n').filter(Boolean).slice(0, 2).join(' · ')}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {rows.length > 80 && <p className="small muted" style={{ marginTop: 8 }}>Menunjukkan 80 baris pertama daripada {rows.length}.</p>}
        </Card>

        <div className="bulk-bar">
          <strong>{toImport.length} content</strong>
          <span className="small muted">{opt.createTasks ? `+ ${toImport.filter((r) => r.ownerStaffId).length} tugasan shoot` : 'tanpa tugasan'}{unmatched.length ? ` · ${unmatched.length} email belum dipadankan (content tanpa pemilik)` : ''}</span>
          <span className="grow" />
          <Button onClick={() => { setPlan(null); setFileName(''); }}>Batal</Button>
          <Button variant="primary" icon={Upload} busy={busy} disabled={!toImport.length} onClick={doImport}>Import {toImport.length} content</Button>
        </div>
      </>}

      {!plan && <ImportHistory />}

      {!plan && !done && (
        <Card title="Format yang disokong">
          <div className="grid-2">
            <div className="col gap-xs">
              <strong>1. Pelan matriks</strong>
              <span className="small muted">Seperti tab “Pelan 30 Hari”: satu baris setiap hari, lajur Tarikh post, Tema, satu lajur untuk setiap jenis content, dan lajur email ahli dengan huruf A atau B. Baris “Creator A · …” / “Creator B · …” di atas kepala menentukan jenis mana milik set A dan B.</span>
            </div>
            <div className="col gap-xs">
              <strong>2. Senarai (templat)</strong>
              <span className="small muted">Satu baris setiap content: {TEMPLATE_HEADER.join(', ')}. Hanya Tarikh pos dan Tajuk wajib. Tarikh boleh “2026-12-01”, “1/12/2026” atau “Selasa 1 Dis”.</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
