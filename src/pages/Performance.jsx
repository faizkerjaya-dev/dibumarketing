// Prestasi content: format laporan yang praktikal untuk banyak video.
//   1. Rekod Hari ke-7 : SATU kali bagi setiap video, 7 hari selepas pos. Isi dalam satu jadual
//                        (boleh tampal terus dari Excel), atau import fail eksport TikTok / Excel.
//   2. Kad skor        : setiap video dapat gred (Hebat / Baik / Sederhana / Lemah) berbanding median
//                        tontonan platform yang sama, dan ringkasan ikut creator dan jenis content.
// Rekod prestasi lama (yang diisi manual sebelum ini) kekal dan masih digunakan jika tiada rekod Hari ke-7.
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { Save, Upload, Download, ExternalLink, Info } from 'lucide-react';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useFirestore';
import { usePersistentState } from '../hooks/usePersistentState';
import { isCreatorOnly } from '../lib/permissions';
import { saveDay7Metrics } from '../lib/db';
import { stageOf } from '../lib/statuses';
import { typeColor, staffColorMap, OTHER } from '../lib/colors';
import { today, addDays, fmtDate, parseDate } from '../lib/dates';
import { downloadCsv } from '../lib/csv';
import { readWorkbook } from '../lib/importPlan';
import {
  D7_FIELDS, EXTRA_FIELDS, GRADES, postedOn, erOf, median, metricsByContent, baselines, gradeOf,
  detectMetricSheet, matchRows, parseCount,
} from '../lib/performance';
import { PageHeader, Card, Button, Segmented, Select, Loading, Empty, Modal, Pill, Tabs, Stat, ErrorBox } from '../components/ui';
import { HBars, fmtNum } from '../components/charts';

const fmtInt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-MY'));
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);

export default function Performance() {
  const { content, staff, ready } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const creatorOnly = isCreatorOnly(profile);
  const mq = useMemo(() => (creatorOnly ? query(collection(db, 'metrics'), where('ownerUid', '==', profile.uid)) : collection(db, 'metrics')), [creatorOnly, profile.uid]);
  const metrics = useQuery(mq, [mq]);
  const [tab, setTab] = usePersistentState('perf_tab', 'record');

  const published = useMemo(() => content.filter((c) => !c.isSlot && !c.archived && stageOf(config, c.status) === 'published' && postedOn(c)), [content, config]);
  const byContent = useMemo(() => metricsByContent(metrics.data), [metrics.data]);
  const t0 = today();
  const due = published.filter((c) => postedOn(c) <= addDays(t0, -7) && postedOn(c) >= addDays(t0, -60) && byContent[c.id]?.checkpoint !== 'd7').length;

  if (!ready) return <div className="page"><Loading /></div>;
  return (
    <div className="page">
      <PageHeader title="Prestasi content" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'record', label: 'Rekod Hari ke-7', count: due || null },
        { key: 'score', label: 'Kad skor' },
        { key: 'how', label: 'Cara ia berfungsi' },
      ]} />
      <ErrorBox error={metrics.error} title="Rekod prestasi gagal dibaca" />
      {metrics.loading ? <Loading /> : tab === 'record'
        ? <RecordGrid published={published} byContent={byContent} staff={staff} creatorOnly={creatorOnly} />
        : tab === 'score'
          ? <Scorecard published={published} byContent={byContent} staff={staff} creatorOnly={creatorOnly} />
          : <HowItWorks />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RecordGrid({ published, byContent, staff, creatorOnly }) {
  const { profile } = useAuth();
  const config = useConfig();
  const { run, success, error } = useToast();
  const t0 = today();
  const [scope, setScope] = usePersistentState('perf_rec_scope', 'pending');
  const [owner, setOwner] = usePersistentState('perf_owner', '');
  const [platform, setPlatform] = usePersistentState('perf_platform', '');
  const [extra, setExtra] = usePersistentState('perf_extra', false);
  const [draft, setDraft] = useState({});
  const [pulled, setPulled] = useState(() => new Set()); // content dari fail import yang di luar senarai
  const [busy, setBusy] = useState(false);
  const [imp, setImp] = useState(null);
  const fileRef = useRef(null);

  const fields = extra ? [...D7_FIELDS, ...EXTRA_FIELDS] : D7_FIELDS;
  const rows = useMemo(() => published
    .filter((c) => pulled.has(c.id) || (scope === 'pending'
      ? postedOn(c) <= addDays(t0, -7) && postedOn(c) >= addDays(t0, -60) && byContent[c.id]?.checkpoint !== 'd7'
      : scope === 'young' ? postedOn(c) > addDays(t0, -7)
        : postedOn(c) >= addDays(t0, -60)))
    .filter((c) => (!owner || c.ownerStaffId === owner) && (!platform || c.platform === platform))
    .sort((a, b) => postedOn(a).localeCompare(postedOn(b))), [published, scope, owner, platform, byContent, pulled, t0]);

  const valueOf = (c, k) => {
    const d = draft[c.id];
    if (d && k in d) return d[k];
    const m = byContent[c.id];
    return m?.checkpoint === 'd7' && m[k] != null ? String(m[k]) : '';
  };
  const setVal = (id, k, v) => setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), [k]: v } }));
  const dirtyIds = Object.keys(draft).filter((id) => Object.entries(draft[id]).some(([k, v]) => {
    const m = byContent[id];
    const old = m?.checkpoint === 'd7' && m[k] != null ? String(m[k]) : '';
    return String(v).trim() !== old;
  }));

  // Tampal dari Excel: blok sel (baris × lajur) diisi bermula dari sel yang dipilih.
  const onPaste = (rowIdx, colIdx) => (e) => {
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter((l, i, a) => l !== '' || i < a.length - 1);
    setDraft((d) => {
      const n = { ...d };
      lines.forEach((line, i) => {
        const c = rows[rowIdx + i];
        if (!c) return;
        line.split('\t').forEach((cell, j) => {
          const f = fields[colIdx + j];
          if (!f) return;
          n[c.id] = { ...(n[c.id] || {}), [f[0]]: cell.replace(/[^\d.kKmM]/g, '') };
        });
      });
      return n;
    });
  };

  const save = async () => {
    const list = dirtyIds.map((id) => {
      const c = published.find((x) => x.id === id);
      const values = {};
      fields.forEach(([k]) => { const v = parseCount(valueOf(c, k)); if (v != null) values[k] = v; });
      return { content: c, values };
    }).filter((r) => r.content);
    setBusy(true);
    const n = await run(() => saveDay7Metrics(list, { profile }), null);
    setBusy(false);
    if (n) { success(`Prestasi ${n} video disimpan`); setDraft({}); setPulled(new Set()); }
  };

  const onFile = async (file) => {
    if (!file) return;
    try {
      const sheets = await readWorkbook(file);
      const det = detectMetricSheet(sheets);
      if (!det) throw Object.assign(new Error('Tidak jumpa lajur tontonan (Views) dan link / tajuk video dalam fail ini.'), { code: 'validation' });
      const res = matchRows(det, published);
      setImp({ name: file.name, sheet: det.sheet, res });
    } catch (e) { error(e); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const applyImport = () => {
    const ok = imp.res.filter((r) => r.content && Object.keys(r.values).length);
    setDraft((d) => {
      const n = { ...d };
      ok.forEach((r) => { n[r.content.id] = { ...(n[r.content.id] || {}), ...Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, String(v)])) }; });
      return n;
    });
    setPulled((p) => new Set([...p, ...ok.map((r) => r.content.id)]));
    if (ok.some((r) => r.values.reach != null)) setExtra(true);
    setImp(null);
    success(`${ok.length} video diisi dari fail. Semak, kemudian tekan Simpan.`);
  };

  const pendingN = published.filter((c) => postedOn(c) <= addDays(t0, -7) && postedOn(c) >= addDays(t0, -60) && byContent[c.id]?.checkpoint !== 'd7').length;

  return (
    <div className="col gap">
      <div className="perf-intro">
        <Info size={16} />
        <span>Rekod <strong>sekali sahaja</strong> bagi setiap video, 7 hari selepas dipos. Isi terus dalam jadual, <strong>tampal</strong> satu blok dari Excel, atau <strong>import fail eksport</strong> TikTok Studio / Excel. Video dipadankan ikut link post, kod content (DBU-xxxx) atau tajuk.</span>
      </div>
      <div className="toolbar">
        <Segmented value={scope} onChange={setScope} options={[
          { key: 'pending', label: `Perlu direkod (${pendingN})` },
          { key: 'all', label: '60 hari terakhir' },
          { key: 'young', label: 'Belum 7 hari' },
        ]} />
        {!creatorOnly && <Select value={owner} onChange={(e) => setOwner(e.target.value)} options={staff.map((x) => ({ value: x.id, label: x.name }))} placeholder="Semua pemilik" aria-label="Pemilik" />}
        <Select value={platform} onChange={(e) => setPlatform(e.target.value)} options={config.platforms} placeholder="Semua platform" aria-label="Platform" />
        <label className="check small"><input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} />Lajur tambahan (capaian, klik, jualan)</label>
        <span className="grow" />
        <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <Button icon={Upload} onClick={() => fileRef.current?.click()}>Import fail</Button>
      </div>

      {!rows.length ? (
        <Card><Empty title={scope === 'pending' ? 'Semua video sudah direkod' : 'Tiada video dalam tempoh ini'} text={scope === 'pending' ? 'Video akan muncul di sini 7 hari selepas ditanda Sudah dipos.' : undefined} /></Card>
      ) : (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="table perf-grid">
              <thead><tr>
                <th>Video</th><th>Dipos</th>
                {fields.map(([k, label]) => <th key={k} className="num">{label}</th>)}
                <th className="num">ER</th>
              </tr></thead>
              <tbody>
                {rows.map((c, ri) => {
                  const m = byContent[c.id];
                  const vals = Object.fromEntries(fields.map(([k]) => [k, valueOf(c, k)]));
                  const er = erOf(Object.fromEntries(fields.map(([k]) => [k, parseCount(vals[k])])));
                  const dirty = dirtyIds.includes(c.id);
                  const age = Math.round((parseDate(t0) - parseDate(postedOn(c))) / 86400000);
                  return (
                    <tr key={c.id} className={dirty ? 'dirty' : ''}>
                      <td className="perf-title">
                        <span className="row gap-xs">
                          <span className="code-tag">{c.code}</span>
                          {c.publishUrl && <a href={c.publishUrl} target="_blank" rel="noreferrer" className="icon-btn sm" title="Buka post" aria-label="Buka post"><ExternalLink size={13} /></a>}
                        </span>
                        <Link to={`/content/${c.id}`} className="ellipsis block">{c.title}</Link>
                        <span className="small muted">{c.platform}{!creatorOnly && c.ownerName ? ` · ${c.ownerName}` : ''}{m && m.checkpoint !== 'd7' ? ' · ada rekod lama' : ''}</span>
                      </td>
                      <td className="small nowrap">{fmtDate(postedOn(c))}<span className={`block ${age < 7 ? 'warn-text' : 'muted'}`}>Hari ke-{age}</span></td>
                      {fields.map(([k, label], ci) => (
                        <td key={k} className="num">
                          <input
                            className="input cell-input"
                            inputMode="numeric"
                            aria-label={`${label} ${c.code}`}
                            value={vals[k]}
                            onChange={(e) => setVal(c.id, k, e.target.value.replace(/[^\d.kKmM]/g, ''))}
                            onPaste={onPaste(ri, ci)}
                            placeholder="–"
                          />
                        </td>
                      ))}
                      <td className="num small strong">{fmtPct(er)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {dirtyIds.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Simpan prestasi">
          <strong>{dirtyIds.length} video diubah</strong>
          <button type="button" className="link-btn" onClick={() => { setDraft({}); setPulled(new Set()); }}>Buang perubahan</button>
          <span className="grow" />
          <Button variant="primary" icon={Save} busy={busy} onClick={save}>Simpan {dirtyIds.length}</Button>
        </div>
      )}

      <Modal open={!!imp} wide onClose={() => setImp(null)} title={`Import: ${imp?.name || ''}`} footer={<>
        <Button onClick={() => setImp(null)}>Batal</Button>
        <Button variant="primary" disabled={!imp?.res.some((r) => r.content)} onClick={applyImport}>Isi {imp?.res.filter((r) => r.content).length || 0} video ke jadual</Button>
      </>}>
        {imp && <>
          <p className="small muted">Sheet “{imp.sheet}”: {imp.res.length} baris. <strong className="ok-text">{imp.res.filter((r) => r.content).length} sepadan</strong>, {imp.res.filter((r) => !r.content).length} tidak sepadan (diabaikan). Angka belum disimpan sehingga anda tekan Simpan.</p>
          <div className="table-wrap" style={{ maxHeight: 360 }}>
            <table className="table">
              <thead><tr><th>Dalam fail</th><th>Content</th><th>Cara padan</th><th className="num">Tontonan</th><th className="num">Suka</th></tr></thead>
              <tbody>{imp.res.slice(0, 200).map((r, i) => (
                <tr key={i} className={r.content ? '' : 'row-muted'}>
                  <td className="ellipsis" style={{ maxWidth: 220 }}>{String(r.label).slice(0, 80)}</td>
                  <td>{r.content ? <><span className="code-tag">{r.content.code}</span> {r.content.title}</> : 'Tidak dijumpai'}</td>
                  <td className="small muted">{r.how || '—'}</td>
                  <td className="num">{fmtInt(r.values.views)}</td>
                  <td className="num">{fmtInt(r.values.likes)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="small muted">Tip: tampal link post semasa tanda <strong>Sudah dipos</strong>, supaya import boleh padankan video secara tepat.</p>
        </>}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Scorecard({ published, byContent, staff, creatorOnly }) {
  const config = useConfig();
  const t0 = today();
  const [period, setPeriod] = usePersistentState('perf_period', '30');
  const [platform, setPlatform] = usePersistentState('perf_platform', '');
  const [owner, setOwner] = usePersistentState('perf_owner', '');
  const [sort, setSort] = usePersistentState('perf_sort', 'views');
  const colors = useMemo(() => staffColorMap(staff), [staff]);

  const all = useMemo(() => published.map((c) => ({ c, m: byContent[c.id] })), [published, byContent]);
  const base = useMemo(() => baselines(all, t0), [all, t0]);
  const from = period === 'month' ? `${t0.slice(0, 8)}01` : addDays(t0, -Number(period));
  const rows = useMemo(() => all
    .filter(({ c }) => postedOn(c) >= from && postedOn(c) <= t0)
    .filter(({ c }) => (!platform || c.platform === platform) && (!owner || c.ownerStaffId === owner))
    .map((r) => ({ ...r, er: erOf(r.m), g: gradeOf(r.m, base[r.c.platform || '-']) })), [all, from, t0, platform, owner, base]);

  const recorded = rows.filter((r) => r.m && Number(r.m.views) > 0);
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'date') return postedOn(b.c).localeCompare(postedOn(a.c));
    if (sort === 'er') return (b.er ?? -1) - (a.er ?? -1);
    return (Number(b.m?.views) || -1) - (Number(a.m?.views) || -1);
  });
  const gradeCount = Object.fromEntries(GRADES.map((g) => [g.key, recorded.filter((r) => r.g?.key === g.key).length]));

  const byOwner = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const k = r.c.ownerStaffId || '-';
      const x = (m[k] = m[k] || { id: k, name: r.c.ownerName || 'Tiada pemilik', n: 0, rec: 0, views: [], er: [], A: 0, B: 0, C: 0, D: 0 });
      x.n += 1;
      if (r.m && Number(r.m.views) > 0) { x.rec += 1; x.views.push(Number(r.m.views)); if (r.er != null) x.er.push(r.er); }
      if (r.g) x[r.g.key] += 1;
    });
    return Object.values(m).sort((a, b) => (median(b.views) || 0) - (median(a.views) || 0));
  }, [rows]);

  const byType = useMemo(() => {
    const m = {};
    recorded.forEach((r) => { const k = r.c.type || 'Tiada jenis'; (m[k] = m[k] || []).push(Number(r.m.views)); });
    return Object.entries(m).map(([k, v]) => ({ label: `${k} (${v.length})`, value: median(v), color: typeColor(config, k === 'Tiada jenis' ? '' : k) })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [recorded, config]);

  const exportCsv = () => downloadCsv(`prestasi_${from}_${t0}.csv`, [
    { label: 'ID', value: (r) => r.c.code }, { label: 'Tajuk', value: (r) => r.c.title }, { label: 'Pemilik', value: (r) => r.c.ownerName },
    { label: 'Jenis', value: (r) => r.c.type }, { label: 'Platform', value: (r) => r.c.platform }, { label: 'Tarikh pos', value: (r) => postedOn(r.c) },
    { label: 'Link', value: (r) => r.c.publishUrl }, { label: 'Rekod', value: (r) => (r.m ? (r.m.checkpoint === 'd7' ? 'Hari ke-7' : 'Manual') : '') },
    ...D7_FIELDS.map(([k, label]) => ({ label, value: (r) => r.m?.[k] ?? '' })),
    { label: 'ER %', value: (r) => (r.er == null ? '' : r.er.toFixed(2)) }, { label: 'Gred', value: (r) => r.g?.label || '' },
    { label: 'x median', value: (r) => (r.g ? r.g.ratio.toFixed(2) : '') },
  ], sorted);

  return (
    <div className="col gap">
      <div className="toolbar">
        <Segmented value={period} onChange={setPeriod} options={[{ key: 'month', label: 'Bulan ini' }, { key: '30', label: '30 hari' }, { key: '90', label: '90 hari' }]} />
        <Select value={platform} onChange={(e) => setPlatform(e.target.value)} options={config.platforms} placeholder="Semua platform" aria-label="Platform" />
        {!creatorOnly && <Select value={owner} onChange={(e) => setOwner(e.target.value)} options={staff.map((x) => ({ value: x.id, label: x.name }))} placeholder="Semua pemilik" aria-label="Pemilik" />}
        <span className="grow" />
        <Button icon={Download} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
      </div>

      <div className="stats">
        <Stat label="Video dipos" value={rows.length} hint={`${recorded.length} sudah ada angka`} />
        <Stat label="Median tontonan" value={fmtNum(median(recorded.map((r) => Number(r.m.views))))} hint="Separuh video melebihi angka ini" />
        <Stat label="Median ER" value={fmtPct(median(recorded.map((r) => r.er)))} hint="(suka + komen + kongsi + simpan) ÷ tontonan" />
        <Stat label="Video Hebat" value={gradeCount.A} tone={gradeCount.A ? 'green' : undefined} hint="≥ 2× median platform" />
      </div>

      {recorded.length > 0 && (
        <Card title="Taburan gred" subtitle="Berbanding median tontonan platform yang sama dalam 90 hari terakhir.">
          <div className="grade-bar" role="img" aria-label={GRADES.map((g) => `${g.label} ${gradeCount[g.key]}`).join(', ')}>
            {GRADES.filter((g) => gradeCount[g.key]).map((g) => <span key={g.key} className={`tone-fill-${g.tone}`} style={{ flex: gradeCount[g.key] }}>{gradeCount[g.key]}</span>)}
          </div>
          <div className="legend">{GRADES.map((g) => <span key={g.key}><span className={`dot tone-fill-${g.tone}`} />{g.label} {gradeCount[g.key]}</span>)}</div>
        </Card>
      )}

      <Card pad={false}>
        <div className="card-head-pad">
          <h3>Kad skor setiap video</h3>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} options={[{ value: 'views', label: 'Susun: tontonan' }, { value: 'er', label: 'Susun: ER' }, { value: 'date', label: 'Susun: terbaru' }]} aria-label="Susun" />
        </div>
        {!rows.length ? <Empty title="Tiada video dipos dalam tempoh ini" /> : (
          <div className="table-wrap">
            <table className="table perf-grid">
              <thead><tr><th>Video</th><th>Dipos</th><th className="num">Tontonan</th><th className="num">Engagement</th><th className="num">ER</th><th>Gred</th></tr></thead>
              <tbody>{sorted.map(({ c, m, er, g }) => (
                <tr key={c.id}>
                  <td className="perf-title">
                    <span className="row gap-xs"><span className="code-tag">{c.code}</span>{c.type && <span className="meta-dot small"><span className="dot" style={{ background: typeColor(config, c.type) }} />{c.type}</span>}</span>
                    <Link to={`/content/${c.id}`} className="ellipsis block">{c.title}</Link>
                    <span className="small muted">{c.platform}{!creatorOnly && c.ownerName ? ` · ${c.ownerName}` : ''}</span>
                  </td>
                  <td className="small nowrap">{fmtDate(postedOn(c))}</td>
                  <td className="num strong">{m ? fmtInt(m.views) : <span className="muted">Belum direkod</span>}{m && m.checkpoint !== 'd7' && <span className="block small muted">rekod manual</span>}</td>
                  <td className="num">{m ? fmtInt((Number(m.likes) || 0) + (Number(m.comments) || 0) + (Number(m.shares) || 0) + (Number(m.saves) || 0)) : '—'}</td>
                  <td className="num">{fmtPct(er)}</td>
                  <td>{g ? <span className="row gap-xs nowrap"><Pill tone={g.tone}>{g.label}</Pill><span className="small muted">{g.ratio.toFixed(1)}×</span></span> : <span className="small muted">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid-2">
        {!creatorOnly && (
          <Card title="Ikut creator" subtitle="Median tontonan dan bilangan gred bagi setiap pemilik content.">
            {!byOwner.length ? <p className="muted small">Tiada data.</p> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Pemilik</th><th className="num">Video</th><th className="num">Median</th><th className="num">ER</th><th className="center">Hebat / Baik / Sdhn / Lemah</th></tr></thead>
                <tbody>{byOwner.map((o) => (
                  <tr key={o.id}>
                    <td><span className="meta-dot"><span className="dot" style={{ background: colors[o.id] || OTHER }} />{o.name}</span></td>
                    <td className="num">{o.rec}/{o.n}</td>
                    <td className="num strong">{fmtNum(median(o.views))}</td>
                    <td className="num">{fmtPct(median(o.er))}</td>
                    <td className="center small">{o.A} / {o.B} / {o.C} / {o.D}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        )}
        <Card title="Ikut jenis content" subtitle="Median tontonan. Gunakan untuk pilih jenis content bulan depan.">
          {byType.length ? <HBars items={byType} /> : <p className="muted small">Tiada data.</p>}
        </Card>
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <Card>
      <div className="col gap how">
        <h3>Format laporan yang disyorkan</h3>
        <ol>
          <li><strong>Satu rekod, satu masa: Hari ke-7.</strong> Kebanyakan tontonan TikTok dan Reels berlaku dalam minggu pertama. Merekod pada hari yang sama untuk setiap video menjadikan perbandingan adil, dan staf tidak perlu isi setiap hari.</li>
          <li><strong>Lima angka sahaja:</strong> Tontonan, Suka, Komen, Kongsi, Simpan. Capaian, klik dan jualan adalah pilihan.</li>
          <li><strong>Seminggu sekali (contoh setiap Isnin):</strong> buka tab <em>Rekod Hari ke-7</em>, isi semua video yang muncul sekaligus, atau import fail eksport TikTok Studio.</li>
          <li><strong>Gred automatik:</strong> setiap video dibandingkan dengan <em>median</em> tontonan platform yang sama (90 hari terakhir): Hebat ≥ 2×, Baik ≥ 1×, Sederhana ≥ 0.5×, Lemah &lt; 0.5×. Median tidak terjejas oleh satu video viral.</li>
          <li><strong>ER (engagement rate)</strong> = (suka + komen + kongsi + simpan) ÷ tontonan. Tontonan tinggi tetapi ER rendah biasanya bermaksud hook kuat tetapi isi kurang menarik.</li>
          <li><strong>KPI bulanan</strong> guna kad skor: bilangan video dipos, median tontonan, dan bilangan video Hebat/Baik bagi setiap creator.</li>
        </ol>
        <p className="small muted">Rekod prestasi lama kekal. Jika video tiada rekod Hari ke-7, rekod manual terkini digunakan dan ditanda “rekod manual”.</p>
      </div>
    </Card>
  );
}
