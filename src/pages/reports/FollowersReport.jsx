// Laporan pengikut akaun jenama dan trend prestasi content, harian atau mingguan.
// Tiada sambungan API TikTok/Instagram: bilangan pengikut direkod manual (cukup sekali sehari atau seminggu).
import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useConfig } from '../../context/ConfigContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { can } from '../../lib/permissions';
import { saveAccountStats } from '../../lib/db';
import { stageOf } from '../../lib/statuses';
import { engagement } from '../../lib/metrics';
import { today, addDays, buckets, fmtDate, inRange } from '../../lib/dates';
import { PALETTE } from '../../lib/colors';
import { Card, Button, Field, Input, Select, Segmented, Modal, Empty, Stat } from '../../components/ui';
import { LineChart, BarChart, fmtNum } from '../../components/charts';

function FollowerModal({ open, onClose, stats }) {
  const config = useConfig();
  const { profile } = useAuth();
  const { run } = useToast();
  const accounts = [...new Set(stats.map((s) => s.account).filter(Boolean))];
  const [f, setF] = useState({ date: today(), account: accounts[0] || config.brandName || '', values: {}, notes: '' });
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const lastFor = (p) => stats.filter((s) => s.platform === p && (s.account || '') === f.account).sort((a, b) => b.date.localeCompare(a.date))[0];
  const save = async () => {
    setBusy(true);
    const n = await run(() => saveAccountStats(f, profile), 'Bilangan pengikut disimpan');
    setBusy(false);
    if (n) { setF({ ...f, values: {} }); onClose(); }
  };
  return (
    <Modal open onClose={onClose} title="Rekod bilangan pengikut" footer={<><Button onClick={onClose}>Batal</Button><Button variant="primary" busy={busy} onClick={save}>Simpan</Button></>}>
      <p className="muted small">Salin angka pengikut dari setiap app. Isi platform yang ada sahaja. Rekod semula tarikh yang sama akan menggantikan angka lama.</p>
      <div className="grid-2">
        <Field label="Tarikh"><Input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Akaun" hint="Nama akaun jenama, contoh @dibu.my"><Input list="acc-list" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} /></Field>
      </div>
      <datalist id="acc-list">{accounts.map((a) => <option key={a} value={a} />)}</datalist>
      <div className="grid-2">
        {config.platforms.map((p) => {
          const last = lastFor(p);
          return (
            <Field key={p} label={p} hint={last ? `Terakhir: ${fmtNum(last.followers)} pada ${fmtDate(last.date)}` : 'Belum ada rekod'}>
              <Input type="number" min="0" inputMode="numeric" value={f.values[p] ?? ''} onChange={(e) => setF({ ...f, values: { ...f.values, [p]: e.target.value } })} placeholder={last ? String(last.followers) : '0'} />
            </Field>
          );
        })}
      </div>
    </Modal>
  );
}

// Nilai terakhir yang diketahui pada atau sebelum tarikh d (bawa ke hadapan).
const valueAt = (sorted, d) => { let v = null; for (const r of sorted) { if (r.date <= d) v = Number(r.followers); else break; } return v; };

export default function FollowersReport({ stats, metricsLatest, error }) {
  const { content } = useData();
  const config = useConfig();
  const { profile } = useAuth();
  const [gran, setGran] = useState('day');
  const [range, setRange] = useState({ from: addDays(today(), -29), to: today() });
  const [account, setAccount] = useState('');
  const [open, setOpen] = useState(false);

  const accounts = [...new Set(stats.map((s) => s.account || ''))];
  const rows = stats.filter((s) => !account || (s.account || '') === account);
  const platforms = config.platforms.filter((p) => rows.some((r) => r.platform === p));
  const bks = useMemo(() => buckets(range.from, range.to, gran), [range, gran]);

  const byPlatform = useMemo(() => Object.fromEntries(platforms.map((p) => {
    // Jumlahkan semua akaun bagi platform yang sama.
    const accs = [...new Set(rows.filter((r) => r.platform === p).map((r) => r.account || ''))];
    const sortedByAcc = accs.map((a) => rows.filter((r) => r.platform === p && (r.account || '') === a).sort((x, y) => x.date.localeCompare(y.date)));
    const at = (d) => { const vals = sortedByAcc.map((s) => valueAt(s, d)); return vals.every((v) => v == null) ? null : vals.reduce((n, v) => n + (v || 0), 0); };
    return [p, at];
  })), [rows, platforms.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const series = platforms.map((p) => ({ name: p, color: PALETTE[config.platforms.indexOf(p)] || PALETTE[0], values: bks.map((b) => byPlatform[p](b.to)) }));
  const totalAt = (d) => { const v = platforms.map((p) => byPlatform[p](d)); return v.every((x) => x == null) ? null : v.reduce((n, x) => n + (x || 0), 0); };
  const growth = bks.map((b) => { const end = totalAt(b.to); const start = totalAt(addDays(b.from, -1)); return end != null && start != null ? end - start : 0; });

  const summary = platforms.map((p) => {
    const now = byPlatform[p](range.to); const before = byPlatform[p](addDays(range.from, -1)) ?? byPlatform[p](range.from);
    const last = rows.filter((r) => r.platform === p && r.date <= range.to).sort((a, b) => b.date.localeCompare(a.date))[0];
    return { p, now, diff: now != null && before != null ? now - before : null, pct: now != null && before ? ((now - before) / before) * 100 : null, last: last?.date };
  });
  const totNow = totalAt(range.to); const totBefore = totalAt(addDays(range.from, -1)) ?? totalAt(range.from);

  // Trend content: ikut tarikh sebenar terbit.
  const published = content.filter((c) => !c.isSlot && stageOf(config, c.status) === 'published' && inRange(c.publishedDate || c.publishDate, range.from, range.to));
  const cTrend = bks.map((b) => {
    const list = published.filter((c) => inRange(c.publishedDate || c.publishDate, b.from, b.to));
    const ms = list.map((c) => metricsLatest[c.id]).filter(Boolean);
    const views = ms.reduce((n, m) => n + (Number(m.views) || 0), 0);
    const eng = ms.reduce((n, m) => n + engagement(m), 0);
    return { n: list.length, views, er: views ? (eng / views) * 100 : null };
  });
  const labels = bks.map((b) => b.label);

  return (
    <div className="col gap-lg">
      <div className="toolbar">
        <Segmented value={gran} onChange={setGran} options={[{ key: 'day', label: 'Harian' }, { key: 'week', label: 'Mingguan' }]} />
        <Select value="" onChange={(e) => { const n = Number(e.target.value); if (n) setRange({ from: addDays(today(), -(n - 1)), to: today() }); }} options={[{ value: '7', label: '7 hari lepas' }, { value: '30', label: '30 hari lepas' }, { value: '90', label: '90 hari lepas' }]} placeholder="Tempoh cepat" aria-label="Tempoh cepat" />
        <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="Dari" style={{ width: 160 }} />
        <span className="muted">–</span>
        <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="Hingga" style={{ width: 160 }} />
        {accounts.length > 1 && <Select value={account} onChange={(e) => setAccount(e.target.value)} options={accounts.map((a) => ({ value: a, label: a || 'Tanpa nama akaun' }))} placeholder="Semua akaun" aria-label="Akaun" />}
        <span className="grow" />
        {can(profile, 'stats.enter') && <Button variant="primary" icon={TrendingUp} onClick={() => setOpen(true)}>Rekod pengikut</Button>}
      </div>
      {error && <p className="danger-text small">{error.message}</p>}

      <div className="stats">
        <Stat label="Jumlah pengikut" value={fmtNum(totNow)} hint={totNow != null && totBefore != null ? `${totNow - totBefore >= 0 ? '+' : ''}${fmtNum(totNow - totBefore)} dalam tempoh ini` : 'Belum cukup rekod'} />
        {summary.map((s) => (
          <Stat key={s.p} label={s.p} value={fmtNum(s.now)} tone={s.diff < 0 ? 'red' : undefined}
            hint={s.diff != null ? `${s.diff >= 0 ? '+' : ''}${fmtNum(s.diff)}${s.pct != null ? ` (${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%)` : ''} · rekod ${fmtDate(s.last)}` : `Rekod terakhir ${fmtDate(s.last)}`} />
        ))}
      </div>

      {!stats.length ? (
        <Card><Empty title="Belum ada rekod pengikut" text="Rekod bilangan pengikut setiap hari atau setiap minggu untuk melihat trend." action={can(profile, 'stats.enter') && <Button variant="primary" icon={TrendingUp} onClick={() => setOpen(true)}>Rekod pengikut</Button>} /></Card>
      ) : (
        <>
          <p className="muted small" style={{ marginBottom: -6 }}>Satu graf bagi setiap platform kerana saiz akaun berbeza. {gran === 'week' ? 'Angka hujung setiap minggu.' : 'Hari tanpa rekod guna angka terakhir yang diketahui.'}</p>
          <div className="grid-chart">
            {series.map((sr, k) => {
              const sm = summary[k];
              return (
                <Card key={sr.name} title={sr.name} subtitle={sm.diff != null ? `${sm.diff >= 0 ? '+' : ''}${fmtNum(sm.diff)} pengikut dalam tempoh ini` : 'Belum cukup rekod'}>
                  <LineChart labels={labels} series={[sr]} height={190} integer />
                </Card>
              );
            })}
          </div>
          <Card title="Pengikut baharu" subtitle={`Jumlah semua platform, ${gran === 'week' ? 'setiap minggu' : 'setiap hari'}`}>
            <BarChart labels={labels} values={growth.map((g) => Math.max(g, 0))} name="Pengikut baharu" color={PALETTE[2]} integer height={190} />
            {growth.some((g) => g < 0) && <p className="small muted">Pengikut berkurang dalam {growth.filter((g) => g < 0).length} {gran === 'week' ? 'minggu' : 'hari'} (tidak dipaparkan sebagai bar).</p>}
          </Card>
        </>
      )}

      <h2 className="section-title">Trend prestasi content</h2>
      <p className="muted small" style={{ marginTop: -8 }}>Content yang terbit dalam tempoh ini, dikumpul ikut tarikh terbit. Angka ialah data terkini yang direkod untuk setiap content.</p>
      <div className="grid-chart">
        <Card title="Content terbit"><BarChart labels={labels} values={cTrend.map((t) => t.n)} name="Content terbit" color={PALETTE[0]} height={180} integer /></Card>
        <Card title="Tontonan"><BarChart labels={labels} values={cTrend.map((t) => t.views)} name="Tontonan" color={PALETTE[6]} height={180} /></Card>
        <Card title="Kadar engagement"><LineChart labels={labels} series={[{ name: 'Kadar engagement', color: PALETTE[1], values: cTrend.map((t) => t.er) }]} unit="%" height={180} empty="Belum ada data prestasi" /></Card>
      </div>

      {stats.length > 0 && (
        <Card title="Rekod terkini" subtitle="Untuk semakan. Rekod semula tarikh yang sama untuk betulkan angka.">
          <div className="table-wrap"><table className="table" style={{ minWidth: 560 }}>
            <thead><tr><th>Tarikh</th><th>Platform</th><th>Akaun</th><th className="num">Pengikut</th><th>Direkod oleh</th></tr></thead>
            <tbody>{[...rows].sort((a, b) => b.date.localeCompare(a.date) || a.platform.localeCompare(b.platform)).slice(0, 15).map((r) => (
              <tr key={r.id}><td>{fmtDate(r.date, { weekday: 'short' })}</td><td>{r.platform}</td><td>{r.account || '—'}</td><td className="num">{Number(r.followers).toLocaleString('ms-MY')}</td><td className="small muted">{r.enteredByName}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}
      <FollowerModal open={open} onClose={() => setOpen(false)} stats={stats} />
    </div>
  );
}
