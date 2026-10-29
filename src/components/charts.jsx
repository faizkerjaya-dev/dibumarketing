// Graf SVG ringkas tanpa library luar. Satu paksi Y sahaja (tiada paksi berganda).
// Garis 2px, bar hujung bulat 4px, grid samar, tooltip bila hover. Warna siri ikut PALETTE (urutan tetap).
import { useEffect, useMemo, useRef, useState } from 'react';
import { PALETTE } from '../lib/colors';

const PAD = { l: 48, r: 14, t: 14, b: 30 };

// Lebar sebenar kotak graf (px), supaya teks paksi kekal 11px pada skrin kecil atau kad sempit.
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Label paksi Y: tambah titik perpuluhan bila jarak tick kecil (contoh 25.5k, 26k), supaya tiada label berulang.
const fmtTick = (v, step, unit) => {
  if (unit === '%') return `${v.toFixed(step < 1 ? 1 : 0)}%`;
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(step < 1e6 ? 1 : 0)}j`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(step < 1000 ? 1 : 0)}k`;
  return Math.round(v).toLocaleString('ms-MY');
};

// Pilih label paksi X yang tidak bertindih (kira-kira 70px setiap label).
const labelEvery = (n, width) => Math.max(1, Math.ceil(n / Math.max(2, Math.floor((width - PAD.l - PAD.r) / 70))));

function niceMax(v) {
  if (!v || v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
// Julat paksi Y dengan 4 jarak yang kemas. integer = untuk kiraan (tiada 0.25 content).
function niceRange(min, max, integer) {
  const zero = min >= 0 && min < max * 0.6;
  const lo0 = zero ? 0 : min;
  let step = niceMax(((max - lo0) || Math.abs(max) || 1) / 4);
  if (integer) step = Math.max(1, Math.ceil(step));
  const lo = zero ? 0 : Math.floor(min / step) * step;
  let hi = lo + step * 4;
  while (hi < max) hi += step;
  return [lo, hi, step];
}
export const fmtNum = (v, unit = '') => {
  if (v == null || Number.isNaN(v)) return '—';
  if (unit === '%') return `${v.toFixed(1)}%`;
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}j`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(0)}k`;
  return Math.round(v).toLocaleString('ms-MY');
};

function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <div className="chart-legend">
      {series.map((s, k) => <span key={s.name}><span className="chart-swatch" style={{ background: s.color || PALETTE[k] }} />{s.name}</span>)}
    </div>
  );
}

function Tip({ x, w, label, rows }) {
  return (
    <div className="chart-tip" style={{ left: Math.min(Math.max(x, 70), w - 70) }}>
      <strong>{label}</strong>
      {rows.map((r) => <span key={r.name}><span className="chart-swatch" style={{ background: r.color }} />{r.name ? `${r.name}: ` : ''}<b>{r.value}</b></span>)}
    </div>
  );
}

// series: [{ name, color?, values: [number|null] }]; labels: ['1 Okt', ...]
export function LineChart({ labels, series, height = 220, unit = '', integer = false, empty = 'Tiada data' }) {
  const [box, W] = useWidth();
  const [i, setI] = useState(null);
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const [lo, hi, step] = useMemo(() => (all.length ? niceRange(Math.min(...all), Math.max(...all), integer) : [0, 1, 0.25]), [all.join(','), integer]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = labels.length;
  const x = (k) => PAD.l + (n === 1 ? (W - PAD.l - PAD.r) / 2 : (k * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (height - PAD.t - PAD.b);
  const ticks = []; for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);
  const every = labelEvery(n, W);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const step2 = (W - PAD.l - PAD.r) / Math.max(n - 1, 1);
    setI(Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - PAD.l) / step2))));
  };
  return (
    <div className="chart">
      <Legend series={series} />
      <div className="chart-box" ref={box}>
        {!all.length ? <div className="chart-empty">{empty}</div> : <>
          <svg width={W} height={height} role="img" aria-label={series.map((s) => s.name).join(', ')} onMouseMove={onMove} onMouseLeave={() => setI(null)}>
            {ticks.map((t) => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="chart-grid" /><text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">{fmtTick(t, step, unit)}</text></g>)}
            {labels.map((l, k) => k % every === 0 && <text key={l + k} x={x(k)} y={height - 8} textAnchor="middle" className="chart-tick">{l}</text>)}
            {i != null && <line x1={x(i)} x2={x(i)} y1={PAD.t} y2={height - PAD.b} className="chart-cross" />}
            {series.map((s, si) => {
              const color = s.color || PALETTE[si];
              const pts = s.values.map((v, k) => (v == null ? null : [x(k), y(v)]));
              const d = pts.reduce((acc, p, k) => (p ? `${acc}${acc && pts[k - 1] ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}` : acc), '');
              const lone = (k) => !pts[k - 1] && !pts[k + 1];
              return (
                <g key={s.name}>
                  <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p, k) => p && (k === i || lone(k) || n <= 14) && <circle key={k} cx={p[0]} cy={p[1]} r={k === i ? 5 : 4} fill={color} stroke="var(--surface)" strokeWidth="2" />)}
                </g>
              );
            })}
          </svg>
          {i != null && <Tip x={x(i)} w={W} label={labels[i]} rows={series.map((s, si) => ({ name: series.length > 1 ? s.name : '', color: s.color || PALETTE[si], value: fmtNum(s.values[i], unit) }))} />}
        </>}
      </div>
    </div>
  );
}

// Bar tunggal (satu siri). values: [number]
export function BarChart({ labels, values, height = 200, unit = '', integer = false, color = PALETTE[0], name = '', empty = 'Tiada data' }) {
  const [box, W] = useWidth();
  const [i, setI] = useState(null);
  const has = values.some((v) => v);
  const n = labels.length;
  const [, hi, step] = niceRange(0, Math.max(...values, 0) || 1, integer);
  const slot = (W - PAD.l - PAD.r) / Math.max(n, 1);
  const gap = slot > 8 ? 2 : 1;
  const bw = Math.max(Math.min(slot - gap, 34), 2);
  const cx = (k) => PAD.l + slot * k + slot / 2;
  const y = (v) => PAD.t + (1 - v / hi) * (height - PAD.t - PAD.b);
  const ticks = []; for (let t = 0; t <= hi + step / 2; t += step) ticks.push(t);
  const every = labelEvery(n, W);
  const base = height - PAD.b;
  return (
    <div className="chart">
      <div className="chart-box" ref={box}>
        {!has ? <div className="chart-empty">{empty}</div> : <>
          <svg width={W} height={height} role="img" aria-label={name} onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setI(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - PAD.l) / slot))));
          }} onMouseLeave={() => setI(null)}>
            {ticks.map((t) => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="chart-grid" /><text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">{fmtTick(t, step, unit)}</text></g>)}
            {values.map((v, k) => {
              if (!v) return null;
              const top = y(v); const h = base - top; const r = Math.min(4, bw / 2, h);
              const x0 = cx(k) - bw / 2;
              const d = `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${base}Z`;
              return <path key={k} d={d} fill={color} opacity={i == null || i === k ? 1 : 0.55} />;
            })}
            {labels.map((l, k) => k % every === 0 && <text key={l + k} x={cx(k)} y={height - 8} textAnchor="middle" className="chart-tick">{l}</text>)}
          </svg>
          {i != null && <Tip x={cx(i)} w={W} label={labels[i]} rows={[{ name, color, value: fmtNum(values[i], unit) }]} />}
        </>}
      </div>
    </div>
  );
}

// Bar mendatar untuk pecahan (contoh suka / komen / kongsi / simpan). items: [{ label, value }]
export function HBars({ items, unit = '', color = PALETTE[0] }) {
  const max = Math.max(...items.map((x) => x.value || 0), 1);
  return (
    <div className="hbars">
      {items.map((x) => (
        <div key={x.label} className="hbar-row">
          <span className="hbar-label">{x.label}</span>
          <span className="hbar-track"><span style={{ width: `${((x.value || 0) / max) * 100}%`, background: x.color || color }} /></span>
          <span className="hbar-val">{fmtNum(x.value, unit)}</span>
        </div>
      ))}
    </div>
  );
}
