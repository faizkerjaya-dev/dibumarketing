// Pembaca dan penulis Excel (.xlsx) ringkas, tanpa library luar.
// .xlsx ialah fail ZIP berisi XML. Kita guna DecompressionStream (terbina dalam Chrome, Safari 16.4+,
// Firefox 113+, Edge) untuk buka ZIP, dan DOMParser untuk baca XML.
// Cukup untuk baca nilai sel, tarikh dan warna latar sel. Formula dibaca sebagai nilai terakhir yang disimpan.

const td = new TextDecoder();

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser ini terlalu lama untuk membaca Excel. Guna Chrome, Edge atau Safari terkini, atau simpan fail sebagai CSV.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Baca semua fail dalam ZIP → { 'path/file.xml': Uint8Array }
export async function unzip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Fail ini bukan Excel (.xlsx) yang sah.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let n = 0; n < count; n += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nameLen));
    const lName = dv.getUint16(local + 26, true);
    const lExtra = dv.getUint16(local + 28, true);
    const start = local + 30 + lName + lExtra;
    const data = u8.subarray(start, start + csize);
    // eslint-disable-next-line no-await-in-loop
    files[name] = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const xml = (bytes) => new DOMParser().parseFromString(td.decode(bytes), 'application/xml');
const kids = (el, tag) => [...el.getElementsByTagName(tag)];
const textOf = (el) => kids(el, 't').map((t) => t.textContent).join('');

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const DATE_FMT_IDS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const serialToDate = (v) => { const d = new Date(Math.round((v - 25569) * 86400000)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

// → [{ name, rows: any[][], fills: { 'r,c': 'RRGGBB' } }]  (indeks bermula 0)
export async function readXlsx(buf) {
  const files = await unzip(buf);
  const get = (p) => files[p] || files[p.replace(/^\//, '')];
  if (!get('xl/workbook.xml')) throw new Error('Tiada workbook dalam fail ini. Simpan semula sebagai .xlsx.');

  const shared = get('xl/sharedStrings.xml') ? kids(xml(get('xl/sharedStrings.xml')), 'si').map(textOf) : [];

  // Gaya: indeks gaya → { fill: 'RRGGBB', date: bool }
  const styles = [];
  if (get('xl/styles.xml')) {
    const st = xml(get('xl/styles.xml'));
    const customDate = new Set(kids(st, 'numFmt').filter((f) => /[dmy]/i.test((f.getAttribute('formatCode') || '').replace(/"[^"]*"|\[[^\]]*\]/g, ''))).map((f) => +f.getAttribute('numFmtId')));
    const fills = kids(st, 'fill').map((f) => {
      const pf = f.getElementsByTagName('patternFill')[0];
      if (!pf || pf.getAttribute('patternType') !== 'solid') return null;
      const fg = pf.getElementsByTagName('fgColor')[0];
      const rgb = fg?.getAttribute('rgb');
      return rgb ? rgb.slice(-6).toUpperCase() : null;
    });
    const xfs = st.getElementsByTagName('cellXfs')[0];
    if (xfs) kids(xfs, 'xf').forEach((x) => {
      const nf = +x.getAttribute('numFmtId');
      styles.push({ fill: fills[+x.getAttribute('fillId')] || null, date: DATE_FMT_IDS.has(nf) || customDate.has(nf) });
    });
  }

  const wb = xml(get('xl/workbook.xml'));
  const rels = {};
  if (get('xl/_rels/workbook.xml.rels')) {
    kids(xml(get('xl/_rels/workbook.xml.rels')), 'Relationship').forEach((r) => {
      const t = r.getAttribute('Target');
      rels[r.getAttribute('Id')] = t.startsWith('/') ? t.slice(1) : `xl/${t}`;
    });
  }

  return kids(wb, 'sheet').map((sh, i) => {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const path = rels[rid] || `xl/worksheets/sheet${i + 1}.xml`;
    const rows = []; const fills = {};
    if (!get(path)) return { name: sh.getAttribute('name'), rows, fills };
    kids(xml(get(path)), 'c').forEach((c) => {
      const ref = c.getAttribute('r');
      if (!ref) return;
      const r = +ref.match(/\d+$/)[0] - 1;
      const col = colIndex(ref);
      const t = c.getAttribute('t');
      const style = styles[+(c.getAttribute('s') || 0)];
      const vEl = c.getElementsByTagName('v')[0];
      let v = null;
      if (t === 's') v = shared[+vEl?.textContent] ?? null;
      else if (t === 'inlineStr') v = textOf(c);
      else if (t === 'str' || t === 'e') v = vEl ? vEl.textContent : null;
      else if (t === 'b') v = vEl ? vEl.textContent === '1' : null;
      else if (vEl) { v = Number(vEl.textContent); if (style?.date && !Number.isNaN(v)) v = serialToDate(v); }
      if (style?.fill) fills[`${r},${col}`] = style.fill;
      if (v === null || v === '') return;
      while (rows.length <= r) rows.push([]);
      rows[r][col] = v;
    });
    const width = Math.max(0, ...rows.map((r) => r.length));
    return { name: sh.getAttribute('name'), rows: rows.map((r) => Array.from({ length: width }, (_, k) => (r[k] === undefined ? null : r[k]))), fills };
  });
}

// CSV ringkas (koma atau titik koma, sokong "petikan").
export function readCsv(text) {
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let cur = ''; let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cur); rows.push(row.map((x) => (x === '' ? null : x))); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row.map((x) => (x === '' ? null : x))); }
  return [{ name: 'CSV', rows, fills: {} }];
}

/* ---------------- Penulis .xlsx (untuk templat) ---------------- */

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i += 1) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zipStore(entries) {
  const te = new TextEncoder();
  const parts = []; const central = []; let offset = 0;
  entries.forEach(([name, text]) => {
    const nameB = te.encode(name); const data = te.encode(text); const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nameB.length, true);
    parts.push(new Uint8Array(h.buffer), nameB, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nameB.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  });
  const size = central.reduce((n, x) => n + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i) => { let s = ''; let n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// rows: string[][] (baris pertama = kepala, ditebalkan). widths: lebar lajur dalam aksara.
export function writeXlsx(rows, { sheetName = 'Pelan', widths = [] } = {}) {
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v == null || v === '' ? '' : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`)).join('')}</row>`).join('');
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  return zipStore([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${ns}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${sheetRows}</sheetData></worksheet>`],
  ]);
}
