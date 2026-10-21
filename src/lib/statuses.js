// Status content boleh ditetapkan sendiri oleh Admin (Settings > Status).
// Supaya laporan tidak rosak bila nama status ditukar, SETIAP status mesti dipetakan
// ke salah satu enam peringkat tetap di bawah. Laporan sentiasa guna peringkat, bukan nama.

export const STAGES = [
  { key: 'idea', label: 'Idea', tone: 'gray' },
  { key: 'production', label: 'Produksi', tone: 'blue' },
  { key: 'review', label: 'Semakan', tone: 'amber' },
  { key: 'ready', label: 'Sedia terbit', tone: 'teal' },
  { key: 'published', label: 'Terbit', tone: 'green' },
  { key: 'archived', label: 'Arkib', tone: 'gray' },
];

export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

// Status lalai. Admin boleh ubah dalam Settings; ini hanya titik permulaan.
export const DEFAULT_STATUSES = [
  { key: 'idea', label: 'Idea', tone: 'gray', stage: 'idea' },
  { key: 'production', label: 'Produksi', tone: 'blue', stage: 'production' },
  { key: 'approval', label: 'Approval', tone: 'amber', stage: 'review' },
  { key: 'scheduled', label: 'Dijadual', tone: 'teal', stage: 'ready' },
  { key: 'published', label: 'Terbit', tone: 'green', stage: 'published' },
  { key: 'archived', label: 'Arkib', tone: 'gray', stage: 'archived' },
];

// Status lama yang mungkin ada dalam rekod sedia ada, supaya tidak jadi "tiada nama".
const LEGACY = {
  planned: 'idea', script: 'production', shooting: 'production', editing: 'production',
};

export function statusList(config) {
  const list = Array.isArray(config?.contentStatuses) && config.contentStatuses.length
    ? config.contentStatuses
    : DEFAULT_STATUSES;
  return list.filter((s) => s && s.key);
}

// Sentiasa pulangkan objek status, walaupun key tidak dikenali.
export function findStatus(config, key) {
  const list = statusList(config);
  const hit = list.find((s) => s.key === key);
  if (hit) return hit;
  const mapped = LEGACY[key] && list.find((s) => s.stage === LEGACY[key]);
  if (mapped) return mapped;
  return { key: key || '', label: key || 'Tiada status', tone: 'gray', stage: 'production', unknown: true };
}

export const stageOf = (config, key) => findStatus(config, key).stage;
export const isStage = (config, key, stage) => stageOf(config, key) === stage;
export const isPublished = (config, key) => stageOf(config, key) === 'published';
export const isArchived = (config, key) => stageOf(config, key) === 'archived';
export const isDone = (config, key) => ['published', 'archived'].includes(stageOf(config, key));

// Status pertama bagi sesuatu peringkat. Digunakan bila sistem perlu pilih sendiri,
// contohnya bila idea diseret ke tarikh atau slot baharu dicipta.
export function statusForStage(config, stage, fallback = '') {
  const hit = statusList(config).find((s) => s.stage === stage);
  return hit ? hit.key : fallback || statusList(config)[0]?.key || '';
}

export const openStatuses = (config) => statusList(config).filter((s) => !['published', 'archived'].includes(s.stage));

// Settings memerlukan sekurang-kurangnya satu status Terbit dan satu Arkib,
// kerana aliran kerja dan laporan bergantung kepada kedua-duanya.
export function validateStatuses(list) {
  const errors = [];
  if (!list.length) errors.push('Mesti ada sekurang-kurangnya satu status.');
  if (!list.some((s) => s.stage === 'published')) errors.push('Mesti ada satu status dengan peringkat Terbit.');
  if (!list.some((s) => s.stage === 'archived')) errors.push('Mesti ada satu status dengan peringkat Arkib.');
  const keys = list.map((s) => s.key);
  if (new Set(keys).size !== keys.length) errors.push('Ada kod status berulang.');
  if (list.some((s) => !s.label?.trim())) errors.push('Setiap status mesti ada nama.');
  return errors;
}
