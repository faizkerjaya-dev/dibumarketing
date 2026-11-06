// Akaun media sosial dan pos silang.
//
// Satu content (video) boleh dipos ke banyak akaun: akaun UTAMA (publishAccount + platform) dan
// akaun tambahan dalam `crossPosts` (contoh TikTok utama, kemudian IG Reels, FB, Threads).
// Senarai akaun disimpan dalam settings/social (boleh diurus oleh Admin, Marketing Manager dan SMM).
// Jika belum ditetapkan, satu akaun bagi setiap platform dalam Tetapan digunakan.
import { PALETTE, OTHER } from './colors';
import { slug } from './constants';
import { stageOf, statusForStage } from './statuses';
import { progressOf, videoApprovalOn } from './progress';

export function accountsOf(config) {
  const saved = config?.social?.accounts;
  if (Array.isArray(saved) && saved.length) return saved.filter((a) => a && a.id && !a.archived);
  return (config?.platforms || []).map((p) => ({ id: slug(p), platform: p, name: p }));
}

export function accountById(config, id) {
  return accountsOf(config).find((a) => a.id === id) || null;
}

// Akaun utama content: ikut publishAccount (ID atau nama lama), jika tiada ikut platform.
export function accountOf(config, c) {
  const list = accountsOf(config);
  const pa = c?.publishAccount || '';
  return list.find((a) => a.id === pa)
    || (pa && list.find((a) => a.name.toLowerCase() === pa.toLowerCase()))
    || list.find((a) => a.platform === c?.platform)
    || { id: '-', platform: c?.platform || '', name: c?.platform || 'Tiada akaun' };
}

// Warna rasmi setiap platform (lencana + jalur). Platform lain guna palet aplikasi.
export const PLATFORM_STYLES = {
  tiktok: { code: 'TT', bg: '#000000', ink: '#25F4EE', ring: '#000000', shadow: '1px 1px 0 #FE2C55', bar: '#FE2C55', tint: '#F3F3F3' },
  instagram: { code: 'IG', bg: 'linear-gradient(45deg, #FEDA75, #FA7E1E, #D62976, #962FBF, #4F5BD5)', ink: '#FFFFFF', ring: 'transparent', shadow: 'none', bar: '#D62976', tint: '#FCEEF5' },
  facebook: { code: 'FB', bg: '#1877F2', ink: '#FFFFFF', ring: 'transparent', shadow: 'none', bar: '#1877F2', tint: '#EBF3FE' },
  threads: { code: 'TH', bg: '#FFFFFF', ink: '#000000', ring: '#000000', shadow: 'none', bar: '#000000', tint: '#F5F5F4' },
  youtube: { code: 'YT', bg: '#FF0000', ink: '#FFFFFF', ring: 'transparent', shadow: 'none', bar: '#FF0000', tint: '#FDECEC' },
  x: { code: 'X', bg: '#000000', ink: '#FFFFFF', ring: 'transparent', shadow: 'none', bar: '#44403C', tint: '#F3F3F3' },
  linkedin: { code: 'IN', bg: '#0A66C2', ink: '#FFFFFF', ring: 'transparent', shadow: 'none', bar: '#0A66C2', tint: '#EAF2FB' },
  shopee: { code: 'SP', bg: '#EE4D2D', ink: '#FFFFFF', ring: 'transparent', shadow: 'none', bar: '#EE4D2D', tint: '#FDEFEB' },
  lemon8: { code: 'L8', bg: '#FFE500', ink: '#1C1917', ring: 'transparent', shadow: 'none', bar: '#D4BE00', tint: '#FFFBE0' },
};
export function platformStyle(platform) {
  const k = String(platform || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const hit = PLATFORM_STYLES[k] || Object.entries(PLATFORM_STYLES).find(([key]) => k.startsWith(key))?.[1];
  if (hit) return hit;
  let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const col = k ? PALETTE[h % PALETTE.length] : OTHER;
  return { code: (platform || '?').slice(0, 2).toUpperCase(), bg: col, ink: '#FFFFFF', ring: 'transparent', shadow: 'none', bar: col, tint: '#F4F2ED' };
}

export function accountColor(config, id) {
  const a = accountsOf(config).find((x) => x.id === id);
  return a ? platformStyle(a.platform).bar : OTHER;
}

// Platform bagi item kalendar (akaun pos utama / silang).
export const platformOfItem = (config, c) => accountOf(config, c).platform || c.platform || 'Tiada platform';

// Susunan platform: ikut senarai akaun, kemudian selebihnya.
export function platformOrder(config) {
  const out = [];
  accountsOf(config).forEach((a) => { if (a.platform && !out.includes(a.platform)) out.push(a.platform); });
  (config?.platforms || []).forEach((p) => { if (!out.includes(p)) out.push(p); });
  return out;
}

export const accountLabel = (a) => (a ? (a.handle ? `${a.platform} ${a.handle}` : a.name) : 'Tiada akaun');

export const creatorCanPost = (config) => !!config?.social?.creatorCanPost;

// Senarai pos bagi satu content: utama + silang. Setiap pos ada tarikh/masa sendiri (lalai = utama).
export function postsOf(config, c) {
  if (!c) return [];
  const pr = progressOf(config, c);
  const main = {
    key: `${c.id}:main`, content: c, primary: true, idx: -1, account: accountOf(config, c),
    date: c.publishDate || '', planned: c.plannedPublishDate || '', time: c.publishTime || '', posted: pr.posted, url: c.publishUrl || '',
    postedTime: c.publishedTime || '',
    postedAt: c.progress?.posted?.at || (pr.posted ? c.publishedDate : ''), postedBy: c.progress?.posted?.by || '',
  };
  const cross = (c.crossPosts || []).map((x, i) => ({
    key: `${c.id}:x${i}`, content: c, primary: false, idx: i,
    account: accountById(config, x.accountId) || { id: x.accountId, platform: '', name: x.accountId },
    date: x.date || c.publishDate || '', planned: x.date ? '' : (c.plannedPublishDate || ''), time: x.time || c.publishTime || '', posted: !!x.postedAt, url: x.url || '',
    postedTime: x.postedTime || '',
    postedAt: x.postedAt || '', postedBy: x.postedBy || '',
  }));
  return [main, ...cross];
}

// Status pos untuk Jadual pos.
//   done     : sudah dipos
//   ready    : video lulus (atau kelulusan dimatikan dan sudah siap edit) → sedia dipos
//   waiting  : menunggu kelulusan video
//   notready : belum siap shoot / edit
//   slot     : slot kosong tanpa content
export function postState(config, post) {
  const c = post.content;
  if (post.posted) return 'done';
  if (c.isSlot) return 'slot';
  const st = stageOf(config, c.status);
  const pr = progressOf(config, c);
  if (st === 'ready' || st === 'published') return 'ready';
  if (st === 'review') return videoApprovalOn(config) ? 'waiting' : 'ready';
  if (!videoApprovalOn(config) && pr.edited) return 'ready';
  return 'notready';
}

export const POST_STATES = {
  done: { label: 'Sudah dipos', tone: 'green' },
  ready: { label: 'Sedia dipos', tone: 'teal' },
  waiting: { label: 'Menunggu lulus', tone: 'amber' },
  notready: { label: 'Video belum siap', tone: 'red' },
  slot: { label: 'Slot kosong', tone: 'red' },
};

// Untuk kalendar mod Pos: setiap pos silang dipaparkan sebagai item tersendiri pada tarikhnya.
export function expandCrossPosts(config, list) {
  const out = [];
  list.forEach((c) => {
    out.push(c);
    (c.crossPosts || []).forEach((x, i) => {
      const acc = accountById(config, x.accountId);
      out.push({
        ...c, _key: `${c.id}#x${i}`, _cross: i, publishAccount: x.accountId, platform: acc?.platform || c.platform,
        publishDate: x.date || c.publishDate, publishTime: x.time || c.publishTime,
        progress: { ...(c.progress || {}), posted: x.postedAt ? { at: x.postedAt, by: x.postedBy || '' } : null },
        // Pos silang belum dipos walaupun pos utama sudah terbit: papar sebagai Sedia terbit.
        status: !x.postedAt && stageOf(config, c.status) === 'published' ? statusForStage(config, 'ready', c.status) : c.status,
      });
    });
  });
  return out;
}

/* ---------------- Tepat masa ---------------- */

// Tarikh sebenar dipos bagi satu pos.
export const postedDayOf = (p) => (p.primary ? (p.content.publishedDate || String(p.postedAt || '').slice(0, 10)) : String(p.postedAt || '').slice(0, 10));

// Tarikh sasaran untuk kira tepat masa = tarikh pos ASAL (plannedPublishDate) jika tarikh pos
// pernah dianjak ke hari kemudian selepas pelan diluluskan; jika tidak, tarikh pos semasa.
// Pos dikira LEWAT jika tarikh sebenar dipos selepas tarikh sasaran. Bila ia ditanda tidak penting:
// pos malam yang ditanda esok pagi dengan "Tarikh dipos" = tarikh jadual tetap tepat masa.
export function onTimeDeadline(config, p) {
  return p.planned && p.planned < p.date ? p.planned : p.date;
}

// Keputusan tepat masa: pelarasan manual (Admin/SMM) mengatasi kiraan automatik.
//   timing: 'ontime' | 'late' | '' (auto)
export function timingOf(p) {
  return p.primary ? (p.content.postTiming || '') : (p.content.crossPosts?.[p.idx]?.timing || '');
}
export function autoOnTime(config, p) {
  const d = postedDayOf(p);
  return !!d && d <= onTimeDeadline(config, p);
}
export function isOnTime(config, p) {
  const t = timingOf(p);
  if (t === 'ontime') return true;
  if (t === 'late') return false;
  return autoOnTime(config, p);
}

// Bila tarikh pos dianjak ke hari KEMUDIAN selepas pelan diluluskan, simpan tarikh asal
// supaya pos itu dikira lewat (Admin / manager masih boleh laras).
export function rescheduleFields(config, c, newDate) {
  if (!c || !c.publishDate || !newDate || newDate <= c.publishDate || c.plannedPublishDate) return {};
  if (stageOf(config, c.status) === 'idea') return {};
  return { plannedPublishDate: c.publishDate };
}
