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

export function accountColor(config, id) {
  const i = accountsOf(config).findIndex((a) => a.id === id);
  return i >= 0 && i < PALETTE.length ? PALETTE[i] : OTHER;
}

export const accountLabel = (a) => (a ? (a.handle ? `${a.platform} ${a.handle}` : a.name) : 'Tiada akaun');

export const creatorCanPost = (config) => !!config?.social?.creatorCanPost;

// Senarai pos bagi satu content: utama + silang. Setiap pos ada tarikh/masa sendiri (lalai = utama).
export function postsOf(config, c) {
  if (!c) return [];
  const pr = progressOf(config, c);
  const main = {
    key: `${c.id}:main`, content: c, primary: true, idx: -1, account: accountOf(config, c),
    date: c.publishDate || '', time: c.publishTime || '', posted: pr.posted, url: c.publishUrl || '',
    postedAt: c.progress?.posted?.at || (pr.posted ? c.publishedDate : ''), postedBy: c.progress?.posted?.by || '',
  };
  const cross = (c.crossPosts || []).map((x, i) => ({
    key: `${c.id}:x${i}`, content: c, primary: false, idx: i,
    account: accountById(config, x.accountId) || { id: x.accountId, platform: '', name: x.accountId },
    date: x.date || c.publishDate || '', time: x.time || c.publishTime || '', posted: !!x.postedAt, url: x.url || '',
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
