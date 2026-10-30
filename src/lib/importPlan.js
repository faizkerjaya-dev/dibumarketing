// Import pelan content dari Excel (.xlsx) atau CSV.
//
// Dua format disokong:
//  1. PELAN MATRIKS (seperti "Pelan 30 Hari"): satu baris = satu hari. Lajur = jenis content.
//     Lajur dengan email di kepala (contoh irdina@gmail.com) berisi huruf A / B: set mana orang itu
//     buat hari tersebut. Baris di atas kepala ("Creator A · ...", "Creator B · ...") menentukan
//     jenis mana milik set A dan set B. Jika tiada, tab "Jenis Content" (lajur Creator) digunakan.
//  2. SENARAI (templat): satu baris = satu content. Kepala: Tarikh pos, Tajuk, Jenis content,
//     Kategori, Platform, Pemilik, Tarikh shoot, Masa, Hook, Nota.
//
// Fail ini tidak menulis ke database. Ia hanya tukar fail → senarai baris untuk dipratonton.
// Pembaca .xlsx ditulis sendiri (src/lib/xlsx.js), tiada library luar atau CDN.

import { readXlsx, readCsv } from './xlsx';

// Baca fail → [{ name, rows: any[][], fills: { 'r,c': 'RRGGBB' } }]
export async function readWorkbook(file) {
  if (/\.csv$/i.test(file.name)) return readCsv(await file.text());
  if (/\.xls$/i.test(file.name)) throw Object.assign(new Error('Format .xls lama tidak disokong. Buka dalam Excel dan simpan sebagai .xlsx atau .csv.'), { code: 'validation' });
  return readXlsx(await file.arrayBuffer());
}

/* ---------------- Tarikh ---------------- */

const MONTHS = { jan: 0, januari: 0, feb: 1, februari: 1, mac: 2, mar: 2, apr: 3, april: 3, mei: 4, may: 4, jun: 5, jul: 6, julai: 6, ogo: 7, ogos: 7, aug: 7, sep: 8, sept: 8, september: 8, okt: 9, oct: 9, oktober: 9, nov: 10, november: 10, dis: 11, dec: 11, disember: 11 };
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Terima Date, nombor siri Excel, 'YYYY-MM-DD', 'DD/MM/YYYY', atau teks seperti 'Isnin 30 Nov'.
// Untuk teks tanpa tahun, `ctx.year` digunakan dan tahun naik bila bulan "berpusing" (Dis → Jan).
export function parseDay(v, ctx = {}) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return iso(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  m = s.toLowerCase().match(/(\d{1,2})\s+([a-z]+)\.?(?:\s+(\d{4}))?/);
  if (m && MONTHS[m[2]] !== undefined) {
    const month = MONTHS[m[2]];
    if (m[3]) return iso(+m[3], month, +m[1]);
    // Tiada tahun: guna ctx.year, dan naikkan tahun bila bulan berpusing (contoh Dis → Jan).
    if (ctx.year == null) ctx.year = new Date().getFullYear();
    if (ctx.lastMonth != null && month < ctx.lastMonth - 6) ctx.year += 1;
    ctx.lastMonth = month;
    return iso(ctx.year, month, +m[1]);
  }
  return '';
}

export function addDaysIso(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return iso(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
const weekday = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
// Sabtu/Ahad → Jumaat sebelumnya (shoot hanya hari bekerja).
export const toWeekday = (s) => (weekday(s) === 6 ? addDaysIso(s, -1) : weekday(s) === 0 ? addDaysIso(s, -2) : s);

/* ---------------- Pengesanan format ---------------- */

const txt = (v) => (v == null ? '' : String(v).trim());
const low = (v) => txt(v).toLowerCase();
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt(v));
const DATE_HEAD = /^(tarikh\s*(pos|post|terbit)|post\s*date|publish\s*date)/i;

function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 30); r += 1) {
    const c = (rows[r] || []).findIndex((v) => DATE_HEAD.test(txt(v)));
    if (c >= 0) return { r, c };
  }
  return null;
}

// Huruf set (A/B) bagi setiap jenis, dari tab "Jenis Content" jika ada.
function setFromGuideSheet(sheets) {
  const g = sheets.find((s) => /jenis\s*content/i.test(s.name));
  const map = {};
  if (!g) return map;
  const h = g.rows.findIndex((row) => (row || []).some((v) => /^jenis$/i.test(txt(v))) && (row || []).some((v) => /^creator$/i.test(txt(v))));
  if (h < 0) return map;
  const cj = g.rows[h].findIndex((v) => /^jenis$/i.test(txt(v)));
  const cc = g.rows[h].findIndex((v) => /^creator$/i.test(txt(v)));
  g.rows.slice(h + 1).forEach((row) => {
    const letter = txt(row?.[cc]).match(/^([A-Z])$/)?.[1];
    if (row?.[cj] && letter) map[low(row[cj]).split(/[\s/(]/)[0]] = letter;
  });
  return map;
}

function guideLead(sheets) {
  const p = sheets.find((s) => /panduan/i.test(s.name));
  const row = p?.rows.find((r) => (r || []).some((v) => /lead/i.test(txt(v))) && (r || []).some((v) => typeof v === 'number'));
  const n = row?.find((v) => typeof v === 'number');
  return n && n > 0 && n < 120 ? n : null;
}

const FILL_LABEL = { F6C431: 'Beg kuning: wajib', FCEBB0: 'Beg kuning: pilihan' };

function parseMatrix(sheet, head, sheets) {
  const { rows, fills } = sheet;
  const header = rows[head.r];
  const titleText = rows.slice(0, head.r).flat().filter(Boolean).map(txt).join(' ');
  const year = +(titleText.match(/(20\d{2})(?!.*20\d{2})/)?.[1] || new Date().getFullYear());
  const cTema = header.findIndex((v) => /^tema|^theme/i.test(txt(v)));
  const cDay = header.findIndex((v) => /^hari$/i.test(txt(v)));
  const personCols = header.map((v, i) => (isEmail(v) ? i : -1)).filter((i) => i >= 0);
  const firstPerson = personCols.length ? Math.min(...personCols) : header.length;
  const typeStart = Math.max(head.c, cTema, cDay) + 1;
  const typeCols = [];
  for (let c = typeStart; c < firstPerson; c += 1) if (txt(header[c])) typeCols.push(c);

  // Set A/B bagi setiap lajur jenis: label kumpulan di baris atas kepala, atau tab Jenis Content.
  const groupRow = rows[head.r - 1] || [];
  const guide = setFromGuideSheet(sheets);
  let current = null;
  const setOf = {};
  for (let c = typeStart; c < firstPerson; c += 1) {
    const g = txt(groupRow[c]).match(/creator\s+([A-Z])\b/i);
    if (g) current = g[1].toUpperCase();
    const fromGuide = guide[low(header[c]).split(/[\s/(]/)[0]];
    setOf[c] = current || fromGuide || null;
  }

  const ctx = { year, lastMonth: null };
  const out = [];
  const issues = [];
  for (let r = head.r + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    if (!row.some((v) => txt(v))) continue;
    const date = parseDay(row[head.c], ctx);
    if (!date) { if (typeCols.some((c) => txt(row[c]))) issues.push(`Baris ${r + 1}: tarikh “${txt(row[head.c])}” tidak dapat dibaca`); continue; }
    const tema = cTema >= 0 ? txt(row[cTema]) : '';
    // Siapa buat set A / B hari ini.
    const who = {};
    personCols.forEach((pc) => { const L = txt(row[pc]).toUpperCase(); if (/^[A-Z]$/.test(L)) who[L] = txt(header[pc]); });
    typeCols.forEach((c) => {
      const idea = txt(row[c]);
      if (!idea) return;
      const flags = [];
      if (/\*\s*$/.test(idea) || idea.includes('*')) flags.push('Perlu disahkan dengan label produk');
      const fill = FILL_LABEL[fills[`${r},${c}`]];
      if (fill) flags.push(fill);
      out.push({
        key: `${r}-${c}`,
        publishDate: date,
        title: idea.replace(/\*+/g, '').trim(),
        type: txt(header[c]),
        set: setOf[c],
        owner: setOf[c] ? who[setOf[c]] || '' : '',
        topic: tema,
        flags,
        sourceRow: r + 1,
      });
    });
  }
  return {
    format: 'matrix',
    sheet: sheet.name,
    title: txt(rows[0]?.[0]),
    types: typeCols.map((c) => ({ name: txt(header[c]), set: setOf[c] })),
    people: personCols.map((c) => txt(header[c])),
    lead: guideLead(sheets),
    rows: out,
    issues,
  };
}

const LIST_COLS = {
  publishDate: DATE_HEAD,
  title: /^(tajuk|title|hook\s*\/\s*tajuk|idea)/i,
  type: /^(jenis(\s*content)?|type|format)$/i,
  pillar: /^(kategori|pillar|pilar)/i,
  platform: /^platform/i,
  owner: /^(pemilik|owner|ahli|assign|pic|staf|email)/i,
  shootDate: /^(tarikh\s*shoot|shoot\s*date)/i,
  publishTime: /^(masa|time)/i,
  hook: /^hook$/i,
  notes: /^(nota|notes|catatan)/i,
  topic: /^(tema|topik|topic)/i,
};

function parseList(sheet, head) {
  const { rows } = sheet;
  const header = rows[head.r];
  const col = {};
  Object.entries(LIST_COLS).forEach(([k, re]) => { const i = header.findIndex((v) => re.test(txt(v))); if (i >= 0) col[k] = i; });
  const ctx = { year: new Date().getFullYear(), lastMonth: null };
  const out = []; const issues = [];
  for (let r = head.r + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    if (!row.some((v) => txt(v))) continue;
    const g = (k) => (col[k] != null ? row[col[k]] : null);
    const title = txt(g('title'));
    const publishDate = parseDay(g('publishDate'), ctx);
    if (!title) { issues.push(`Baris ${r + 1}: tiada tajuk, dilangkau`); continue; }
    if (!publishDate && txt(g('publishDate'))) issues.push(`Baris ${r + 1}: tarikh “${txt(g('publishDate'))}” tidak dapat dibaca (dimasukkan ke Bank idea)`);
    const time = g('publishTime');
    out.push({
      key: `${r}`,
      publishDate,
      title: title.replace(/\*+/g, '').trim(),
      type: txt(g('type')),
      pillar: txt(g('pillar')),
      platform: txt(g('platform')),
      owner: txt(g('owner')),
      shootDate: parseDay(g('shootDate'), { ...ctx }),
      publishTime: typeof time === 'number' && time < 1 ? `${pad(Math.floor(time * 24))}:${pad(Math.round((time * 1440) % 60))}` : txt(time).slice(0, 5),
      hook: txt(g('hook')),
      notes: txt(g('notes')),
      topic: txt(g('topic')),
      flags: title.includes('*') ? ['Perlu disahkan dengan label produk'] : [],
      sourceRow: r + 1,
    });
  }
  const types = [...new Set(out.map((x) => x.type).filter(Boolean))].map((name) => ({ name, set: null }));
  return { format: 'list', sheet: sheet.name, title: sheet.name, types, people: [...new Set(out.map((x) => x.owner).filter(Boolean))], lead: null, rows: out, issues };
}

// Pilih tab terbaik: tab dengan kepala "Tarikh post" dan paling banyak baris content.
export function detectPlan(sheets) {
  const candidates = sheets.map((sh) => {
    const head = findHeader(sh.rows);
    if (!head) return null;
    const header = sh.rows[head.r];
    const hasTitle = header.some((v) => LIST_COLS.title.test(txt(v)));
    const parsed = hasTitle ? parseList(sh, head) : parseMatrix(sh, head, sheets);
    return parsed.rows.length ? parsed : null;
  }).filter(Boolean);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.rows.length - a.rows.length)[0];
}

// Lajur templat senarai, untuk butang "Muat turun templat".
export const TEMPLATE_HEADER = ['Tarikh pos', 'Masa', 'Tajuk', 'Jenis content', 'Kategori', 'Platform', 'Pemilik (email)', 'Tarikh shoot', 'Hook', 'Nota'];
export const TEMPLATE_EXAMPLE = [
  ['2026-12-01', '20:00', '3 tanda baby dah sedia makan', 'Edukasi', 'Parenting', 'TikTok', 'nama@email.com', '2026-11-03', 'Bukan sekadar cukup 6 bulan', ''],
  ['2026-12-01', '21:00', 'Bancuh suapan pertama: nisbah serbuk dan air', 'Cara guna', 'Produk', 'TikTok', 'nama2@email.com', '', '', 'Shot tangan sahaja'],
];
