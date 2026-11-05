// Laporan prestasi content yang praktikal: SATU rekod bagi setiap video, pada Hari ke-7 selepas pos.
//
// Kenapa Hari ke-7? Kebanyakan tontonan TikTok / Reels berlaku dalam 7 hari pertama, jadi angka
// Hari ke-7 cukup stabil untuk dibandingkan antara video, dan staf hanya perlu isi sekali.
//
// Gred dikira berbanding MEDIAN tontonan platform yang sama (90 hari terakhir), bukan angka tetap,
// supaya adil walaupun akaun membesar:
//   Hebat     ≥ 2× median
//   Baik      ≥ 1× median
//   Sederhana ≥ 0.5× median
//   Lemah     < 0.5× median
import { addDays, today } from './dates';

export const D7_FIELDS = [
  ['views', 'Tontonan'], ['likes', 'Suka'], ['comments', 'Komen'], ['shares', 'Kongsi'], ['saves', 'Simpan'],
];
export const EXTRA_FIELDS = [['reach', 'Capaian'], ['clicks', 'Klik'], ['conversions', 'Conversion'], ['sales', 'Jualan (RM)']];

export const GRADES = [
  { key: 'A', label: 'Hebat', min: 2, tone: 'green' },
  { key: 'B', label: 'Baik', min: 1, tone: 'teal' },
  { key: 'C', label: 'Sederhana', min: 0.5, tone: 'amber' },
  { key: 'D', label: 'Lemah', min: 0, tone: 'red' },
];

export const postedOn = (c) => c.publishedDate || c.publishDate || '';
export const engagementOf = (m) => (m ? (Number(m.likes) || 0) + (Number(m.comments) || 0) + (Number(m.shares) || 0) + (Number(m.saves) || 0) : 0);
export const erOf = (m) => (m && Number(m.views) > 0 ? (engagementOf(m) / Number(m.views)) * 100 : null);

export function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Pilih rekod untuk setiap content: rekod Hari ke-7 jika ada, jika tidak rekod manual terkini.
export function metricsByContent(metrics) {
  const out = {};
  metrics.filter((m) => m.targetType === 'content' || !m.targetType).forEach((m) => {
    const cur = out[m.targetId];
    if (m.checkpoint === 'd7') { out[m.targetId] = m; return; }
    if (cur?.checkpoint === 'd7') return;
    const key = `${m.date || ''}${m.createdAtIso || ''}`;
    if (!cur || key > `${cur.date || ''}${cur.createdAtIso || ''}`) out[m.targetId] = m;
  });
  return out;
}

// Median tontonan bagi setiap platform, 90 hari terakhir (asas gred).
export function baselines(rows, t0 = today()) {
  const from = addDays(t0, -90);
  const by = {};
  rows.filter((r) => r.m && Number(r.m.views) > 0 && postedOn(r.c) >= from).forEach((r) => {
    const k = r.c.platform || '-';
    (by[k] = by[k] || { views: [], er: [] }).views.push(Number(r.m.views));
    const er = erOf(r.m);
    if (er != null) by[k].er.push(er);
  });
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { views: median(v.views), er: median(v.er), n: v.views.length }]));
}

export function gradeOf(m, base) {
  if (!m || !(Number(m.views) > 0) || !base?.views) return null;
  const ratio = Number(m.views) / base.views;
  const g = GRADES.find((x) => ratio >= x.min) || GRADES[GRADES.length - 1];
  return { ...g, ratio };
}

/* ---------------- Import fail eksport (TikTok Studio / Meta / Excel sendiri) ---------------- */

const COLS = {
  // Susunan penting: lajur angka dikenal pasti dahulu, tajuk paling akhir (perkataan "video" terlalu umum).
  views: [/view/, /tontonan/, /play/, /main/],
  likes: [/like/, /suka/],
  comments: [/comment/, /komen/],
  shares: [/share/, /kongsi/],
  saves: [/save/, /simpan/, /favou?rite/, /bookmark/],
  reach: [/reach/, /capaian/],
  url: [/link/, /url/, /pautan/],
  code: [/^id$/, /^kod/, /^code/, /content id/],
  title: [/title/, /tajuk/, /caption/, /description/, /keterangan/, /video/],
};
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
export const parseCount = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim().toLowerCase().replace(/,/g, '');
  const m = s.match(/^([\d.]+)\s*([km])?$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
};
export const videoIdOf = (url) => (String(url || '').match(/\/(?:video|reel|reels|p|shorts)\/([A-Za-z0-9_-]+)/) || [])[1] || '';

// Cari baris tajuk (header) dan lajur yang dikenali dalam setiap sheet.
export function detectMetricSheet(sheets) {
  for (const sh of sheets) {
    for (let r = 0; r < Math.min(sh.rows.length, 15); r += 1) {
      const head = (sh.rows[r] || []).map(norm);
      const map = {};
      Object.entries(COLS).forEach(([k, pats]) => {
        const i = head.findIndex((h, idx) => h && pats.some((p) => p.test(h)) && !Object.values(map).includes(idx));
        if (i >= 0) map[k] = i;
      });
      if (map.views != null && (map.url != null || map.title != null || map.code != null)) {
        return { sheet: sh.name, headerRow: r, map, rows: sh.rows.slice(r + 1).filter((row) => row.some((v) => v != null && v !== '')) };
      }
    }
  }
  return null;
}

// Padankan setiap baris fail dengan content: ikut ID video dalam link, link penuh, kod DBU, atau tajuk.
export function matchRows(detected, contentList) {
  const { map, rows } = detected;
  const byVid = {}; const byUrl = {}; const byCode = {}; const byTitle = {};
  contentList.forEach((c) => {
    const vid = videoIdOf(c.publishUrl); if (vid) byVid[vid] = c;
    if (c.publishUrl) byUrl[norm(c.publishUrl).replace(/[?#].*$/, '')] = c;
    if (c.code) byCode[norm(c.code)] = c;
    if (c.title) byTitle[norm(c.title)] = c;
  });
  return rows.map((row) => {
    const get = (k) => (map[k] != null ? row[map[k]] : null);
    const url = get('url'); const title = get('title'); const code = get('code');
    let c = null; let how = '';
    const vid = videoIdOf(url);
    if (vid && byVid[vid]) { c = byVid[vid]; how = 'ID video'; }
    else if (url && byUrl[norm(url).replace(/[?#].*$/, '')]) { c = byUrl[norm(url).replace(/[?#].*$/, '')]; how = 'Link'; }
    else if (code && byCode[norm(code)]) { c = byCode[norm(code)]; how = 'Kod'; }
    else {
      const t = norm(title);
      const codeIn = t.match(/[a-z]{2,4}-\d{3,}/);
      if (codeIn && byCode[codeIn[0]]) { c = byCode[codeIn[0]]; how = 'Kod dalam caption'; }
      else if (t && byTitle[t]) { c = byTitle[t]; how = 'Tajuk'; }
      else if (t.length >= 12) {
        const hit = Object.entries(byTitle).find(([k]) => k.length >= 12 && (t.startsWith(k) || k.startsWith(t)));
        if (hit) { c = hit[1]; how = 'Tajuk (hampir)'; }
      }
    }
    const values = {};
    ['views', 'likes', 'comments', 'shares', 'saves', 'reach'].forEach((k) => { const n = parseCount(get(k)); if (n != null) values[k] = n; });
    return { content: c, how, label: title || url || code || '—', values };
  });
}
