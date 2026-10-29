// Analisa engagement untuk SATU content: angka terkini, pecahan interaksi, sejarah rekod,
// dan perbandingan dengan purata content lain di platform yang sama.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useConfig } from '../../context/ConfigContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../lib/permissions';
import { stageOf } from '../../lib/statuses';
import { engagement, engagementRate } from '../../lib/metrics';
import { fmtDate, addDays, today } from '../../lib/dates';
import { PALETTE } from '../../lib/colors';
import { METRIC_FIELDS } from '../../lib/constants';
import { Card, Button, Input, Select, Empty, Stat, Pill } from '../../components/ui';
import { ReviewPill, ContentStatusPill } from '../../components/pills';
import { LineChart, HBars, fmtNum } from '../../components/charts';
import MetricsModal from '../../components/MetricsModal';

const avg = (xs) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null);

export default function EngagementReport({ metrics, latest, contentId, onPick }) {
  const { content, staffById } = useData();
  const config = useConfig();
  const { profile } = useAuth();
  const [q, setQ] = useState('');
  const [metricsOpen, setMetricsOpen] = useState(false);

  const published = useMemo(() => content.filter((c) => !c.isSlot && stageOf(config, c.status) === 'published'), [content, config]);
  const withData = published.filter((c) => latest[c.id]);
  const picked = content.find((c) => c.id === contentId) || null;
  const options = published
    .filter((c) => !q || `${c.code} ${c.title}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.publishedDate || b.publishDate || '').localeCompare(a.publishedDate || a.publishDate || ''))
    .slice(0, 300)
    .map((c) => ({ value: c.id, label: `${c.code} · ${c.title}${latest[c.id] ? '' : ' (tiada data)'}` }));

  // Top content 30 hari lepas ikut kadar engagement (minimum 1,000 tontonan supaya tidak terpesong).
  const top = withData
    .filter((c) => (c.publishedDate || c.publishDate) >= addDays(today(), -30) && (latest[c.id].views || 0) >= 1000)
    .map((c) => ({ c, m: latest[c.id], er: engagementRate(latest[c.id]) }))
    .sort((a, b) => (b.er || 0) - (a.er || 0))
    .slice(0, 10);

  const picker = (
    <div className="toolbar">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari tajuk atau kod" aria-label="Cari content" style={{ width: 220 }} />
      <Select value={contentId || ''} onChange={(e) => onPick(e.target.value)} options={options} placeholder="Pilih content yang sudah terbit" aria-label="Content" style={{ minWidth: 320 }} />
    </div>
  );

  if (!picked) {
    return (
      <div className="col gap-lg">
        {picker}
        <Card title="Content terbaik 30 hari lepas" subtitle="Ikut kadar engagement. Hanya content dengan sekurang-kurangnya 1,000 tontonan. Klik untuk analisa.">
          {!top.length ? <Empty title="Belum cukup data" text="Rekod prestasi content yang sudah terbit untuk melihat analisa." /> : (
            <div className="table-wrap"><table className="table" style={{ minWidth: 640 }}>
              <thead><tr><th>#</th><th>Content</th><th>Platform</th><th className="num">Tontonan</th><th className="num">Engagement</th><th className="num">Kadar eng.</th></tr></thead>
              <tbody>{top.map(({ c, m, er }, k) => (
                <tr key={c.id} className="clickable" onClick={() => onPick(c.id)}>
                  <td className="muted">{k + 1}</td>
                  <td><strong>{c.title}</strong><div className="small muted">{c.code} · {c.ownerName}</div></td>
                  <td>{c.platform}</td><td className="num">{fmtNum(m.views)}</td><td className="num">{fmtNum(engagement(m))}</td><td className="num strong">{er == null ? '—' : `${er.toFixed(1)}%`}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </div>
    );
  }

  const m = latest[picked.id];
  const history = metrics.filter((x) => x.targetId === picked.id).sort((a, b) => `${a.date}${a.createdAtIso || ''}`.localeCompare(`${b.date}${b.createdAtIso || ''}`));
  const peers = withData.filter((c) => c.id !== picked.id && c.platform === picked.platform);
  const peerEr = avg(peers.map((c) => engagementRate(latest[c.id])).filter((v) => v != null));
  const peerViews = avg(peers.map((c) => latest[c.id].views || 0));
  const er = engagementRate(m);
  const ranked = withData.filter((c) => c.platform === picked.platform).map((c) => ({ id: c.id, er: engagementRate(latest[c.id]) || 0 })).sort((a, b) => b.er - a.er);
  const rank = ranked.findIndex((r) => r.id === picked.id) + 1;
  const delta = (v, base) => (v == null || !base ? null : ((v - base) / base) * 100);
  const dEr = delta(er, peerEr); const dViews = delta(m?.views, peerViews);
  const owner = staffById[picked.ownerStaffId];

  return (
    <div className="col gap-lg">
      {picker}
      <Card>
        <div className="row gap wrap" style={{ alignItems: 'flex-start' }}>
          <div className="grow min0" style={{ flexBasis: 280 }}>
            <div className="small muted">{picked.code} · {picked.platform} · {picked.type || 'Jenis belum ditetapkan'} · terbit {fmtDate(picked.publishedDate || picked.publishDate, { year: 'numeric' })}</div>
            <h2 style={{ fontSize: 19, margin: '4px 0' }}>{picked.title}</h2>
            <div className="row gap-sm wrap"><span className="small">Pemilik: <strong>{owner?.name || picked.ownerName || '—'}</strong></span><ContentStatusPill value={picked.status} /><ReviewPill review={picked.review} showNone /></div>
          </div>
          <div className="row gap-sm wrap">
            {picked.publishUrl && <a className="btn btn-secondary btn-sm" href={picked.publishUrl} target="_blank" rel="noreferrer">Lihat post</a>}
            <Link className="btn btn-secondary btn-sm" to={`/content/${picked.id}`}>Buka content</Link>
            {can(profile, 'metrics.enter') && <Button size="sm" variant="primary" icon={BarChart3} onClick={() => setMetricsOpen(true)}>Rekod prestasi</Button>}
          </div>
        </div>
      </Card>

      {!m ? <Card><Empty title="Belum ada data prestasi" text="Rekod angka dari app platform untuk melihat analisa engagement." /></Card> : <>
        <div className="stats">
          <Stat label="Tontonan" value={fmtNum(m.views)} hint={dViews == null ? 'Tiada perbandingan' : `${dViews >= 0 ? '+' : ''}${dViews.toFixed(0)}% berbanding purata ${picked.platform}`} />
          <Stat label="Engagement" value={fmtNum(engagement(m))} hint="Suka + komen + kongsi + simpan" />
          <Stat label="Kadar engagement" value={er == null ? '—' : `${er.toFixed(2)}%`} tone={dEr != null && dEr < -20 ? 'red' : undefined} hint={peerEr == null ? 'Tiada perbandingan' : `Purata ${picked.platform}: ${peerEr.toFixed(2)}%`} />
          <Stat label={`Kedudukan di ${picked.platform}`} value={rank ? `#${rank}` : '—'} hint={`daripada ${ranked.length} content ada data`} />
        </div>
        {dEr != null && (
          <div className={dEr >= 0 ? 'okbox' : 'warnbox'}>
            <div><strong>{dEr >= 0 ? 'Di atas purata' : 'Di bawah purata'}</strong>
              <span>Kadar engagement {Math.abs(dEr).toFixed(0)}% {dEr >= 0 ? 'lebih tinggi' : 'lebih rendah'} daripada purata {peers.length} content {picked.platform} lain.</span></div>
          </div>
        )}
        <div className="split">
          <Card title="Pecahan interaksi" subtitle={`Data ${fmtDate(m.date)} · diisi oleh ${m.enteredByName || '—'}`} className="side">
            <HBars items={[
              { label: 'Suka', value: m.likes || 0, color: PALETTE[0] },
              { label: 'Komen', value: m.comments || 0, color: PALETTE[0] },
              { label: 'Kongsi', value: m.shares || 0, color: PALETTE[0] },
              { label: 'Simpan', value: m.saves || 0, color: PALETTE[0] },
            ]} />
            <div className="keyval" style={{ marginTop: 14 }}>
              {METRIC_FIELDS.filter(([k]) => ['reach', 'clicks', 'conversions', 'sales'].includes(k)).map(([k, label]) => (
                <div key={k}><div className="muted small">{label}</div><div className="kv-value">{m[k] != null ? fmtNum(m[k]) : '—'}</div></div>
              ))}
            </div>
          </Card>
          <Card title="Sejarah tontonan" subtitle={history.length > 1 ? `${history.length} rekod. Rekod angka beberapa kali (contoh hari 1, 3, 7) untuk lihat pertumbuhan.` : 'Baru ada satu rekod. Rekod lagi pada hari lain untuk lihat pertumbuhan.'} className="main">
            <LineChart labels={history.map((h) => fmtDate(h.date))} series={[{ name: 'Tontonan', color: PALETTE[6], values: history.map((h) => h.views ?? null) }]} height={200} />
            {history.length > 1 && <p className="small strong" style={{ marginTop: 6 }}>Kadar engagement</p>}
            {history.length > 1 && <LineChart labels={history.map((h) => fmtDate(h.date))} series={[{ name: 'Kadar engagement', color: PALETTE[1], values: history.map((h) => engagementRate(h)) }]} unit="%" height={150} />}
          </Card>
        </div>
      </>}
      {picked.review?.comment && <Card title="Nota semakan"><Pill tone="gray">{picked.review.byName}</Pill> <span className="pre-line">{picked.review.comment}</span></Card>}
      <MetricsModal open={metricsOpen} onClose={() => setMetricsOpen(false)} target={{ type: 'content', id: picked.id, campaignId: picked.campaignId }} />
    </div>
  );
}
