// Penunjuk kemajuan ringkas bagi setiap video: Shoot → Edit → Pos.
// Ini lapisan mudah di atas status. Bila staf tanda satu langkah, status content dan tugasan
// berkaitan dikemas kini sendiri (lihat markProgress dalam db.js), jadi tiada siapa perlu ingat
// untuk tukar status secara berasingan.
import { stageOf } from './statuses';
import { today } from './dates';

export const STEPS = [
  { key: 'shot', label: 'Shoot', doneLabel: 'Siap shoot', taskRoles: ['shooting'] },
  { key: 'edited', label: 'Edit', doneLabel: 'Siap edit', taskRoles: ['editing', 'design', 'caption'] },
  { key: 'posted', label: 'Pos', doneLabel: 'Sudah dipos', taskRoles: ['publishing'] },
];

// Langkah dikira siap jika ditanda, ATAU jika status content sudah melepasi langkah itu.
// Contoh: content yang sudah "Terbit" dikira siap shoot, edit dan pos walaupun tidak ditanda.
export function progressOf(config, c) {
  const st = stageOf(config, c?.status);
  const p = c?.progress || {};
  const posted = !!p.posted || st === 'published';
  const edited = posted || !!p.edited || st === 'review' || st === 'ready';
  const shot = edited || !!p.shot;
  return { shot, edited, posted };
}

export const doneCount = (pr) => STEPS.filter((s) => pr[s.key]).length;

export function nextStep(config, c) {
  const pr = progressOf(config, c);
  return STEPS.find((s) => !pr[s.key]) || null;
}

// Langkah yang sudah lewat: belum shoot selepas tarikh shoot, atau belum pos selepas tarikh pos.
export function lateSteps(config, c, t0 = today()) {
  const pr = progressOf(config, c);
  const out = [];
  if (!pr.shot && c.shootDate && c.shootDate < t0) out.push('shot');
  if (!pr.posted && c.publishDate && c.publishDate < t0) out.push('posted');
  return out;
}

// Ringkasan satu baris untuk kad dan senarai, contoh "Seterusnya: Edit".
export function progressText(config, c) {
  const n = nextStep(config, c);
  return n ? `Seterusnya: ${n.label}` : 'Selesai';
}

// Kelulusan idea (pelan) dibuat lebih awal; kelulusan video dibuat selepas edit.
export const videoApprovalOn = (config) => config?.videoApproval !== false;
export const planApproved = (config, c) => !!c?.planApproval?.at || !['idea'].includes(stageOf(config, c?.status));
