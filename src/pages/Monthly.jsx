// Laporan media sosial bulanan, dijana automatik dari data sistem.
//   Pos dirancang vs sebenar (semua akaun termasuk pos silang), tepat masa, pengikut setiap akaun,
//   gred video Hari ke-7, 5 terbaik / 5 terlemah, prestasi setiap creator, jenis content,
//   dan catatan SMM. Boleh dicetak (PDF) atau diexport ke Excel.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Printer, Download } from 'lucide-react';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { useQuery, useDoc } from '../hooks/useFirestore';
import { can } from '../lib/permissions';
import { stageOf, isArchived } from '../lib/statuses';
import { saveReportNote } from '../lib/db';
import { postsOf, postState, accountsOf, accountColor, accountLabel, isOnTime, postedDayOf } from '../lib/social';
import { TimingControl } from './Posting';
import { setPostTiming } from '../lib/db';
import { GRADES, postedOn, erOf, median, metricsByContent, baselines, gradeOf } from '../lib/performance';
import { monthKey, monthRange, shiftMonth, staffTarget, kpiStatus, monthPace } from '../lib/kpi';
import { today, parseDate, monthLabel, fmtDate } from '../lib/dates';
import { typeColor, OTHER } from '../lib/colors';
import { writeXlsx } from '../lib/xlsx';
import { PageHeader, Card, Button, IconButton, Pill, Loading, Textarea, Modal } from '../components/ui';
import { HBars, fmtNum } from '../components/charts';

const pctTxt = (n) => (n == null ? '—' : `${Math.round(n)}%`);
const sign = (n) => (n == null ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('en-MY')}`);

// Semua angka satu bulan. Dipanggil dua kali (bulan ini & bulan lepas) untuk perbandingan.
function computeMonth({ key, content, config, byContent, base, stats }) {
  const { from, to } = monthRange(key);
  const t0 = today();
  const posts = content.filter((c) => !c.archived && !isArchived(config, c.status))
    .flatMap((c) => postsOf(config, c)).filter((p) => p.date >= from && p.date <= to)
    .map((p) => ({ ...p, state: postState(config, p) }));
  const planned = posts.filter((p) => p.date <= t0 || p.state === 'done');
  const done = posts.filter((p) => p.state === 'done');
  // Tepat masa: dipos sebelum hari bekerja berikutnya selepas tarikh jadual, atau dilaras oleh Admin/SMM.
  const onTime = done.filter((p) => isOnTime(config, p)).length;

  const published = content.filter((c) => !c.isSlot && stageOf(config, c.status) === 'published' && postedOn(c) >= from && postedOn(c) <= to);
  const rows = published.map((c) => ({ c, m: byContent[c.id] })).map((r) => ({ ...r, er: erOf(r.m), g: gradeOf(r.m, base[r.c.platform || '-']) }));
  const rec = rows.filter((r) => r.m && Number(r.m.views) > 0);

  // Pengikut: rekod pertama & terakhir dalam bulan bagi setiap akaun (platform + nama akaun).
  const acc = {};
  stats.filter((s) => s.date >= from && s.date <= to && s.followers != null).forEach((s) => {
    const k = `${s.platform}|${s.account || ''}`;
    const a = (acc[k] = acc[k] || { platform: s.platform, account: s.account || '', first: s, last: s });
    if (s.date < a.first.date) a.first = s;
    if (s.date > a.last.date) a.last = s;
  });
  const followers = Object.values(acc).map((a) => ({
    ...a, start: Number(a.first.followers), end: Number(a.last.followers), growth: Number(a.last.followers) - Number(a.first.followers),
    posts: done.filter((p) => p.account.platform === a.platform).length,
  })).sort((a, b) => b.end - a.end);
  const growth = followers.length ? followers.reduce((n, f) => n + f.growth, 0) : null;

  return {
    from, to, posts, planned, done, onTime, rows, rec, followers, growth,
    medianViews: median(rec.map((r) => Number(r.m.views))),
    medianEr: median(rec.map((r) => r.er)),
    onTimePct: done.length ? (onTime / done.length) * 100 : null,
  };
}

export default function Monthly() {
  const { content, staff, staffColor, ready } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const { run } = useToast();
  const now = parseDate(today());
  const [key, setKey] = useState(monthKey(now.getFullYear(), now.getMonth()));
  const metrics = useQuery(useMemo(() => collection(db, 'metrics'), []), []);
  const statsQ = useQuery(useMemo(() => collection(db, 'accountStats'), []), []);
  const targets = useDoc(useMemo(() => doc(db, 'kpiTargets', key), [key]), key);
  const noteQ = useDoc(useMemo(() => doc(db, 'reportNotes', key), [key]), key);
  const [note, setNote] = useState('');
  const [timingFor, setTimingFor] = useState(null); // { title, posts }
  useEffect(() => { setNote(noteQ.data?.text || ''); }, [noteQ.data?.text, key]);
  const canNote = can(profile, 'content.approve');

  const byContent = useMemo(() => metricsByContent(metrics.data), [metrics.data]);
  const base = useMemo(() => baselines(content.filter((c) => !c.isSlot && stageOf(config, c.status) === 'published').map((c) => ({ c, m: byContent[c.id] }))), [content, byContent, config]);
  const cur = useMemo(() => computeMonth({ key, content, config, byContent, base, stats: statsQ.data }), [key, content, config, byContent, base, statsQ.data]);
  const prev = useMemo(() => computeMonth({ key: shiftMonth(key, -1), content, config, byContent, base, stats: statsQ.data }), [key, content, config, byContent, base, statsQ.data]);

  if (!ready || metrics.loading) return <div className="page"><Loading /></div>;
  const { y, m } = monthRange(key);
  const title = monthLabel(y, m);

  const gradeCount = Object.fromEntries(GRADES.map((g) => [g.key, cur.rec.filter((r) => r.g?.key === g.key).length]));
  const sorted = [...cur.rec].sort((a, b) => Number(b.m.views) - Number(a.m.views));
  const top = sorted.slice(0, 5);
  const bottom = sorted.length > 5 ? sorted.slice(Math.max(5, sorted.length - 5)).reverse() : [];

  const creators = staff.map((s) => {
    const mine = cur.rows.filter((r) => r.c.ownerStaffId === s.id);
    const posts = cur.done.filter((p) => p.primary && p.content.ownerStaffId === s.id);
    const ok = posts.filter((p) => isOnTime(config, p)).length;
    const target = staffTarget(targets.data, s.id, 'published');
    const views = mine.filter((r) => r.m && Number(r.m.views) > 0);
    return {
      s, posts, n: mine.length, target, onTime: posts.length ? (ok / posts.length) * 100 : null,
      median: median(views.map((r) => Number(r.m.views))), er: median(views.map((r) => r.er)),
      grades: GRADES.map((g) => mine.filter((r) => r.g?.key === g.key).length),
      kst: kpiStatus(mine.length, target, 'count', monthPace(key)),
    };
  }).filter((x) => x.n || x.target).sort((a, b) => b.n - a.n);

  const types = (() => {
    const mm = {};
    cur.rec.forEach((r) => { const k = r.c.type || 'Tiada jenis'; (mm[k] = mm[k] || []).push(Number(r.m.views)); });
    return Object.entries(mm).map(([k, v]) => ({ label: `${k} (${v.length})`, value: median(v), color: typeColor(config, k === 'Tiada jenis' ? '' : k) })).sort((a, b) => b.value - a.value).slice(0, 8);
  })();

  const deltaPct = (a, b) => (a == null || !b ? null : ((a - b) / b) * 100);
  const tiles = [
    { label: 'Pos sebenar / dirancang', value: `${cur.done.length} / ${cur.planned.length}`, delta: cur.planned.length ? `${Math.round((cur.done.length / cur.planned.length) * 100)}% ikut jadual` : 'Tiada pos dirancang', good: !cur.planned.length || cur.done.length / cur.planned.length >= 0.9 },
    { label: 'Dipos tepat masa', onClick: () => setTimingFor({ title: 'Semua pos', keys: cur.done.map((p) => p.key) }), value: pctTxt(cur.onTimePct), delta: cur.onTimePct != null && prev.onTimePct != null ? `${sign(cur.onTimePct - prev.onTimePct)} mata berbanding bulan lepas` : '', good: (cur.onTimePct ?? 0) >= (prev.onTimePct ?? 0) },
    { label: 'Pengikut baharu (semua akaun)', value: cur.growth == null ? '—' : sign(cur.growth), delta: cur.growth == null ? 'Rekod pengikut dalam Laporan › Pengikut' : prev.growth > 0 ? `${sign(deltaPct(cur.growth, prev.growth))}% berbanding bulan lepas` : '', good: (cur.growth ?? 0) >= (prev.growth ?? 0) },
    { label: 'Median tontonan (Hari ke-7)', value: fmtNum(cur.medianViews), delta: prev.medianViews && cur.medianViews != null ? `${sign(deltaPct(cur.medianViews, prev.medianViews))}% berbanding bulan lepas` : `${cur.rec.length} video direkod`, good: (cur.medianViews ?? 0) >= (prev.medianViews ?? 0) },
  ];

  const exportXlsx = () => {
    const rows = [
      [`Laporan media sosial ${title}`],
      [],
      ['Ringkasan', 'Nilai'],
      ...tiles.map((t) => [t.label, t.value]),
      [],
      ['Akaun', 'Pengikut awal', 'Pengikut akhir', 'Baharu', 'Pos'],
      ...cur.followers.map((f) => [`${f.platform} ${f.account}`.trim(), f.start, f.end, f.growth, f.posts]),
      [],
      ['Creator', 'Terbit', 'Sasaran', 'Tepat masa %', 'Median tontonan', 'Median ER %', ...GRADES.map((g) => g.label)],
      ...creators.map((x) => [x.s.name, x.n, x.target || '', x.onTime == null ? '' : Math.round(x.onTime), x.median ?? '', x.er == null ? '' : x.er.toFixed(1), ...x.grades]),
      [],
      ['ID', 'Tajuk', 'Pemilik', 'Platform', 'Jenis', 'Tarikh pos', 'Tontonan', 'ER %', 'Gred', 'Link'],
      ...sorted.map((r) => [r.c.code, r.c.title, r.c.ownerName, r.c.platform, r.c.type, postedOn(r.c), r.m.views, r.er == null ? '' : r.er.toFixed(1), r.g?.label || '', r.c.publishUrl || '']),
      [],
      ['Catatan SMM'],
      [note],
    ];
    const url = URL.createObjectURL(writeXlsx(rows, { sheetName: 'Laporan', widths: [34, 16, 16, 14, 16, 14, 12, 12, 12, 40] }));
    const a = document.createElement('a');
    a.href = url; a.download = `laporan_media_sosial_${key}.xlsx`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="page monthly">
      <PageHeader title={`Laporan media sosial · ${title}`} actions={<span className="row gap-sm no-print">
        <IconButton icon={ChevronLeft} label="Bulan sebelum" onClick={() => setKey(shiftMonth(key, -1))} />
        <IconButton icon={ChevronRight} label="Bulan seterusnya" onClick={() => setKey(shiftMonth(key, 1))} />
        <Button icon={Download} onClick={exportXlsx}>Export Excel</Button>
        <Button variant="primary" icon={Printer} onClick={() => window.print()}>Cetak / PDF</Button>
      </span>}>
        <p className="muted small" style={{ marginTop: 4 }}>Dijana automatik dari data sistem: semua akaun termasuk pos silang. Pengikut dari rekod dalam Laporan › Pengikut.</p>
      </PageHeader>

      <div className="stats">
        {tiles.map((t) => (
          <div key={t.label} className="stat">
            <span className="stat-label">{t.label}</span>
            <span className="stat-value">{t.onClick ? <button type="button" className="link-btn stat-btn" onClick={t.onClick} title="Lihat dan laras setiap pos">{t.value}</button> : t.value}</span>
            {t.delta && <span className={`stat-hint ${t.good ? 'ok-text' : 'danger-text'}`}>{t.delta}</span>}
          </div>
        ))}
      </div>

      <div className="grid-2">
        <Card title="Pengikut ikut akaun">
          {!cur.followers.length ? <p className="muted small">Tiada rekod pengikut bulan ini. <Link to="/analytics?tab=followers">Rekod di Laporan › Pengikut</Link>.</p> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Akaun</th><th className="num">Awal</th><th className="num">Akhir</th><th className="num">Baharu</th><th className="num">Pos</th></tr></thead>
              <tbody>{cur.followers.map((f) => (
                <tr key={`${f.platform}${f.account}`}>
                  <td>{f.platform}{f.account ? ` ${f.account}` : ''}</td>
                  <td className="num">{f.start.toLocaleString('en-MY')}</td>
                  <td className="num strong">{f.end.toLocaleString('en-MY')}</td>
                  <td className={`num strong ${f.growth >= 0 ? 'ok-text' : 'danger-text'}`}>{sign(f.growth)}</td>
                  <td className="num">{f.posts}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
        <Card title="Pos ikut akaun" subtitle="Sudah dipos berbanding dirancang (termasuk pos silang).">
          <div className="col gap-sm">
            {accountsOf(config).map((a) => {
              const mine = cur.planned.filter((p) => p.account.id === a.id);
              const d = mine.filter((p) => p.state === 'done').length;
              return (
                <div key={a.id} className="col gap-xs">
                  <div className="row small" style={{ justifyContent: 'space-between' }}><span>{accountLabel(a)}</span><strong>{d} / {mine.length}</strong></div>
                  <span className="acc-bar"><span style={{ width: `${mine.length ? (d / mine.length) * 100 : 0}%`, background: accountColor(config, a.id) }} /></span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title="Gred video (Hari ke-7)" subtitle={`${cur.rec.length} daripada ${cur.rows.length} video terbit sudah ada angka. Gred berbanding median tontonan platform 90 hari.`}>
        {cur.rec.length ? <>
          <div className="grade-bar" role="img" aria-label={GRADES.map((g) => `${g.label} ${gradeCount[g.key]}`).join(', ')}>
            {GRADES.filter((g) => gradeCount[g.key]).map((g) => <span key={g.key} className={`tone-fill-${g.tone}`} style={{ flex: gradeCount[g.key] }}>{gradeCount[g.key]}</span>)}
          </div>
          <div className="legend">{GRADES.map((g) => <span key={g.key}><span className={`dot tone-fill-${g.tone}`} />{g.label} {gradeCount[g.key]}</span>)}</div>
        </> : <p className="muted small">Belum ada rekod prestasi. <Link to="/performance">Rekod Hari ke-7</Link>.</p>}
      </Card>

      {sorted.length > 0 && (
        <div className="grid-2">
          {[['5 video terbaik', top], ['Video paling lemah', bottom]].map(([t, list]) => (
            <Card key={t} title={t}>
              {!list.length ? <p className="muted small">Perlu sekurang-kurangnya 6 video direkod.</p> : list.map((r, i) => (
                <div key={r.c.id} className="rank-row">
                  <strong className="muted">{i + 1}</strong>
                  <span className="grow min0"><Link to={`/content/${r.c.id}`} className="strong block ellipsis" style={{ color: 'var(--text)' }}>{r.c.title}</Link><span className="small muted">{[r.c.platform, r.c.ownerName, r.c.type].filter(Boolean).join(' · ')}</span></span>
                  <span className="col" style={{ textAlign: 'right' }}><strong>{fmtNum(Number(r.m.views))}</strong><span className={`small strong ${r.g && r.g.ratio >= 1 ? 'ok-text' : 'danger-text'}`}>{r.g ? `${r.g.ratio.toFixed(1)}× median` : ''}</span></span>
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}

      <Card title="Prestasi creator">
        {!creators.length ? <p className="muted small">Tiada content terbit bulan ini.</p> : (
          <div className="table-wrap"><table className="table" style={{ minWidth: 720 }}>
            <thead><tr><th>Creator</th><th className="num">Terbit / sasaran</th><th className="num">Tepat masa</th><th className="num">Median tontonan</th><th className="num">Median ER</th><th className="center">Hebat / Baik / Sdhn / Lemah</th><th>KPI</th></tr></thead>
            <tbody>{creators.map((x) => (
              <tr key={x.s.id}>
                <td><span className="meta-dot"><span className="dot" style={{ background: staffColor[x.s.id] || OTHER }} />{x.s.name}</span></td>
                <td className="num">{x.n}{x.target ? ` / ${x.target}` : ''}</td>
                <td className="num">{x.posts.length ? <button type="button" className="link-btn" title="Lihat dan laras setiap pos" onClick={() => setTimingFor({ title: x.s.name, keys: x.posts.map((p) => p.key) })}>{pctTxt(x.onTime)}</button> : '—'}</td>
                <td className="num strong">{fmtNum(x.median)}</td>
                <td className="num">{x.er == null ? '—' : `${x.er.toFixed(1)}%`}</td>
                <td className="center small">{x.grades.join(' / ')}</td>
                <td><Pill tone={x.kst.tone}>{x.kst.label}</Pill></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Median tontonan ikut jenis content" subtitle="Panduan untuk rancang bulan depan.">
          {types.length ? <HBars items={types} /> : <p className="muted small">Tiada data.</p>}
        </Card>
        <Card title="Catatan & rancangan bulan depan" subtitle={canNote ? 'Ditulis oleh SMM, dicetak bersama laporan.' : 'Catatan SMM'}>
          {canNote ? (
            <div className="col gap-sm">
              <Textarea rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Apa yang berjaya, apa yang perlu diubah, fokus bulan depan" />
              <Button size="sm" className="self-start no-print" disabled={note === (noteQ.data?.text || '')} onClick={() => run(() => saveReportNote(key, note, profile), 'Catatan disimpan')}>Simpan catatan</Button>
            </div>
          ) : <p className="pre-line">{note || <span className="muted">Tiada catatan.</span>}</p>}
        </Card>
      </div>

      <Modal open={!!timingFor} wide onClose={() => setTimingFor(null)} title={`Tepat masa · ${timingFor?.title || ''}`} footer={<Button onClick={() => setTimingFor(null)}>Tutup</Button>}>
        <p className="small muted">Auto: dikira tepat masa jika ditanda dipos sebelum hujung <strong>hari bekerja berikutnya</strong> selepas tarikh jadual (pos malam / hujung minggu tidak dikira lewat). {can(profile, 'content.approve') ? 'Anda boleh laras setiap pos secara manual.' : ''}</p>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Pos</th><th>Jadual</th><th>Dipos</th><th style={{ minWidth: 220 }}>Tepat masa</th></tr></thead>
          <tbody>{cur.done.filter((p) => timingFor?.keys.includes(p.key)).sort((a, b) => a.date.localeCompare(b.date)).map((p) => (
            <tr key={p.key}>
              <td><span className="code-tag">{p.content.code}</span> {p.content.title}<span className="block small muted">{accountLabel(p.account)}</span></td>
              <td className="small nowrap">{fmtDate(p.date, { weekday: 'short' })}{p.time ? ` ${p.time}` : ''}</td>
              <td className="small nowrap">{postedDayOf(p) ? fmtDate(postedDayOf(p), { weekday: 'short' }) : '—'}</td>
              <td><TimingControl post={p} config={config} canEdit={can(profile, 'content.approve')} onChange={(v) => run(() => setPostTiming(p, v, profile), 'Dikemas kini')} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      </Modal>
    </div>
  );
}
