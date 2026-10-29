// KPI keseluruhan pasukan dan KPI individu setiap staf, bagi satu bulan.
// Sasaran ditetapkan oleh Admin / Marketing Manager (butang "Tetapkan sasaran").
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { useQuery, useDoc } from '../hooks/useFirestore';
import { can } from '../lib/permissions';
import { saveKpiTargets } from '../lib/db';
import { today, parseDate, monthLabel } from '../lib/dates';
import { computeKpi, monthKey, monthRange, shiftMonth, monthPace, kpiStatus, staffTarget, fmtKpi, OVERALL_FIELDS, STAFF_FIELDS } from '../lib/kpi';
import { PageHeader, Card, Button, IconButton, Pill, Avatar, Loading, ErrorBox, Empty, Modal, Field, Input } from '../components/ui';

// Bar kemajuan dengan penanda "sepatutnya sudah sampai sini" (kadar masa berlalu).
export function KpiBar({ ratio, pace, tone = 'brand' }) {
  const pct = ratio == null ? 0 : Math.min(ratio * 100, 100);
  return (
    <div className="kpi-bar" title={ratio == null ? 'Tiada sasaran' : `${Math.round(ratio * 100)}% daripada sasaran`}>
      <div className={`bar-fill fill-${tone}`} style={{ width: `${pct}%` }} />
      {pace != null && pace > 0 && pace < 1 && <span className="kpi-pace" style={{ left: `${pace * 100}%` }} />}
    </div>
  );
}

function TargetsModal({ open, onClose, monthKeyValue, targets, prevTargets, staff }) {
  const { profile } = useAuth();
  const { run } = useToast();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(JSON.parse(JSON.stringify(targets || { overall: {}, staffDefault: {}, staff: {} })));
  }, [open, targets]);
  if (!open || !f) return null;
  const setOverall = (k, v) => setF((x) => ({ ...x, overall: { ...x.overall, [k]: v } }));
  const setDef = (k, v) => setF((x) => ({ ...x, staffDefault: { ...x.staffDefault, [k]: v } }));
  const setStaff = (id, k, v) => setF((x) => ({ ...x, staff: { ...x.staff, [id]: { ...(x.staff?.[id] || {}), [k]: v } } }));
  const save = async () => {
    setBusy(true);
    const ok = await run(() => saveKpiTargets(monthKeyValue, f, profile), 'Sasaran KPI disimpan');
    setBusy(false);
    if (ok) onClose();
  };
  const { y, m } = monthRange(monthKeyValue);
  return (
    <Modal open wide onClose={onClose} title={`Sasaran KPI · ${monthLabel(y, m)}`} footer={<>
      {prevTargets && <Button className="mr-auto" onClick={() => setF(JSON.parse(JSON.stringify(prevTargets)))}>Salin dari bulan lepas</Button>}
      <Button onClick={onClose}>Batal</Button><Button variant="primary" busy={busy} onClick={save}>Simpan sasaran</Button>
    </>}>
      <div className="form-section">
        <h3>KPI keseluruhan pasukan</h3>
        <div className="grid-3">
          {OVERALL_FIELDS.map((x) => (
            <Field key={x.key} label={`${x.label}${x.unit ? ` (${x.unit})` : ''}`} hint={x.hint}>
              <Input type="number" min="0" step={x.unit === '%' ? '0.1' : '1'} value={f.overall?.[x.key] ?? ''} onChange={(e) => setOverall(x.key, e.target.value)} placeholder="Tiada sasaran" />
            </Field>
          ))}
        </div>
      </div>
      <div className="form-section">
        <h3>KPI individu</h3>
        <p className="muted small">Sasaran lalai digunakan untuk semua staf. Isi baris staf hanya jika sasaran dia berbeza.</p>
        <div className="table-wrap"><table className="table" style={{ minWidth: 520 }}>
          <thead><tr><th>Staf</th>{STAFF_FIELDS.map((x) => <th key={x.key}>{x.label}{x.unit ? ` (${x.unit})` : ''}</th>)}</tr></thead>
          <tbody>
            <tr>
              <td><strong>Sasaran lalai</strong></td>
              {STAFF_FIELDS.map((x) => <td key={x.key}><Input type="number" min="0" value={f.staffDefault?.[x.key] ?? ''} onChange={(e) => setDef(x.key, e.target.value)} placeholder="—" /></td>)}
            </tr>
            {staff.filter((s) => s.status !== 'inactive').map((s) => (
              <tr key={s.id}>
                <td>{s.name}<div className="small muted">{s.jobTitle}</div></td>
                {STAFF_FIELDS.map((x) => <td key={x.key}><Input type="number" min="0" value={f.staff?.[s.id]?.[x.key] ?? ''} onChange={(e) => setStaff(s.id, x.key, e.target.value)} placeholder={f.staffDefault?.[x.key] ? `Lalai: ${f.staffDefault[x.key]}` : '—'} /></td>)}
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </Modal>
  );
}

export default function KpiPage() {
  const { content, tasks, staff, staffColor, ready } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const now = parseDate(today());
  const [key, setKey] = useState(monthKey(now.getFullYear(), now.getMonth()));
  const [editOpen, setEditOpen] = useState(false);

  const targetsQ = useDoc(useMemo(() => doc(db, 'kpiTargets', key), [key]), key);
  const prevKey = shiftMonth(key, -1);
  const prevQ = useDoc(useMemo(() => doc(db, 'kpiTargets', prevKey), [prevKey]), prevKey);
  const metricsQ = useQuery(useMemo(() => collection(db, 'metrics'), []), []);
  const statsQ = useQuery(useMemo(() => collection(db, 'accountStats'), []), []);

  const kpi = useMemo(() => computeKpi({ key, content, tasks, staff, metrics: metricsQ.data, accountStats: statsQ.data, config }), [key, content, tasks, staff, metricsQ.data, statsQ.data, config]);
  if (!ready) return <div className="page"><Loading /></div>;

  const targets = targetsQ.data;
  const pace = monthPace(key);
  const { y, m, to } = monthRange(key);
  const canManage = can(profile, 'kpi.manage');
  const daysIn = parseDate(to).getDate();

  return (
    <div className="page">
      <PageHeader title="KPI" actions={canManage && <Button variant="primary" icon={Target} onClick={() => setEditOpen(true)}>Tetapkan sasaran</Button>} />
      <div className="toolbar">
        <IconButton icon={ChevronLeft} label="Bulan sebelum" onClick={() => setKey(shiftMonth(key, -1))} />
        <IconButton icon={ChevronRight} label="Bulan seterusnya" onClick={() => setKey(shiftMonth(key, 1))} />
        <h2 style={{ fontSize: 17, margin: '0 6px' }}>{monthLabel(y, m)}</h2>
        <span className="muted small">
          {pace >= 1 ? 'Bulan sudah tamat.' : pace <= 0 ? 'Bulan belum bermula.' : `Hari ke-${Math.round(pace * daysIn)} daripada ${daysIn} (${Math.round(pace * 100)}% masa berlalu). Garis menegak pada bar = tahap sepatutnya hari ini.`}
        </span>
      </div>
      <ErrorBox error={targetsQ.error || metricsQ.error || statsQ.error} />
      {!targetsQ.loading && !targets && (
        <div className="warnbox"><div>
          <strong>Sasaran bulan ini belum ditetapkan</strong>
          <span>Angka sebenar tetap dipaparkan. {canManage ? 'Tekan "Tetapkan sasaran" untuk mula, atau salin dari bulan lepas.' : 'Minta Admin atau Marketing Manager tetapkan sasaran.'}</span>
        </div></div>
      )}

      <h2 className="section-title">KPI keseluruhan</h2>
      <div className="kpi-grid">
        {OVERALL_FIELDS.map((x) => {
          const actual = kpi.overall[x.key];
          const target = targets?.overall?.[x.key];
          const st = kpiStatus(actual, target, x.kind, pace);
          return (
            <div key={x.key} className="kpi-card">
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span className="stat-label">{x.label}</span>
                <Pill tone={st.tone}>{st.label}</Pill>
              </div>
              <div className="kpi-value">{fmtKpi(actual, x.unit)}<span className="kpi-target">{target ? ` / ${fmtKpi(Number(target), x.unit)}` : ''}</span></div>
              <KpiBar ratio={st.ratio} pace={x.kind === 'count' ? pace : null} tone={st.tone === 'gray' ? 'gray' : st.tone} />
              <span className="stat-hint">{x.hint}{x.key === 'views' && kpi.overall.withData < kpi.overall.published ? ` · ${kpi.overall.published - kpi.overall.withData} content belum ada data` : ''}</span>
            </div>
          );
        })}
      </div>

      <Card title="KPI individu" subtitle="Content terbit dikira mengikut pemilik content. Tugasan dikira mengikut deadline dalam bulan ini." pad>
        {!kpi.perStaff.length ? <Empty title="Belum ada staf" /> : (
          <div className="table-wrap"><table className="table" style={{ minWidth: 980 }}>
            <thead><tr>
              <th>Staf</th><th style={{ width: 200 }}>Content terbit</th><th style={{ width: 200 }}>Siap tepat masa</th>
              <th className="num">Tugasan siap</th><th className="num">Lewat</th><th className="num">Tontonan</th><th className="num">Kadar eng.</th><th className="num">Kadar FYP</th><th>Status</th>
            </tr></thead>
            <tbody>{kpi.perStaff.map((r) => {
              const tPub = staffTarget(targets, r.staff.id, 'published');
              const tOn = staffTarget(targets, r.staff.id, 'onTimePct');
              const sPub = kpiStatus(r.published, tPub, 'count', pace);
              const sOn = kpiStatus(r.onTimePct, tOn, 'rate', pace);
              const worst = [sPub, sOn].filter((s) => s.key !== 'none').sort((a, b) => ['behind', 'near', 'track', 'hit'].indexOf(a.key) - ['behind', 'near', 'track', 'hit'].indexOf(b.key))[0] || sPub;
              return (
                <tr key={r.staff.id}>
                  <td><Link to={`/team/${r.staff.id}`} className="row gap-sm" style={{ color: 'var(--text)' }}>
                    <span className="owner-ring" style={{ '--ring': staffColor[r.staff.id] }}><Avatar name={r.staff.name} size={28} /></span>
                    <span><strong>{r.staff.name}</strong><span className="small muted block">{r.staff.jobTitle}</span></span>
                  </Link></td>
                  <td><div className="small"><strong>{r.published}</strong>{tPub ? ` / ${tPub}` : ''} <span className="muted">· {r.planned} dirancang</span></div><KpiBar ratio={sPub.ratio} pace={pace} tone={sPub.tone === 'gray' ? 'gray' : sPub.tone} /></td>
                  <td><div className="small"><strong>{fmtKpi(r.onTimePct, '%')}</strong>{tOn ? ` / ${tOn}%` : ''}</div><KpiBar ratio={sOn.ratio} tone={sOn.tone === 'gray' ? 'gray' : sOn.tone} /></td>
                  <td className="num">{r.done}/{r.assigned}</td>
                  <td className={`num${r.overdue ? ' danger-text' : ''}`}>{r.overdue}</td>
                  <td className="num">{fmtKpi(r.views)}</td>
                  <td className="num">{fmtKpi(r.engagementRate, '%')}</td>
                  <td className="num">{fmtKpi(r.fypRate, '%')}</td>
                  <td><Pill tone={worst.tone}>{worst.label}</Pill></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>KPI ialah alat perancangan, bukan skor prestasi penuh. Kerumitan content dan tugasan berbeza antara staf.</p>
      </Card>

      <TargetsModal open={editOpen} onClose={() => setEditOpen(false)} monthKeyValue={key} targets={targets} prevTargets={prevQ.data} staff={staff} />
    </div>
  );
}
