// Senarai tetap. Status content TIDAK di sini kerana ia boleh diubah oleh Admin:
// lihat src/lib/statuses.js dan Settings > Status.
import { DEFAULT_STATUSES } from './statuses';

export const ROLES = {
  admin: 'Admin',
  marketing_manager: 'Marketing Manager',
  content_manager: 'Content Manager',
  content_creator: 'Content Creator',
  creator_manager: 'Creator Manager',
  viewer: 'Pemerhati',
};

export const PRIORITIES = [
  { key: 'high', label: 'Tinggi', tone: 'red' },
  { key: 'medium', label: 'Sederhana', tone: 'amber' },
  { key: 'low', label: 'Rendah', tone: 'gray' },
];

export const TASK_ROLES = [
  { key: 'script', label: 'Skrip' },
  { key: 'shooting', label: 'Shooting' },
  { key: 'editing', label: 'Editing' },
  { key: 'design', label: 'Design' },
  { key: 'caption', label: 'Caption' },
  { key: 'approval', label: 'Approval' },
  { key: 'publishing', label: 'Terbit' },
  { key: 'adjustment', label: 'Pembetulan' },
  { key: 'other', label: 'Lain-lain' },
];

export const TASK_STATUSES = [
  { key: 'todo', label: 'Belum mula', tone: 'gray' },
  { key: 'in_progress', label: 'Sedang buat', tone: 'blue' },
  { key: 'done', label: 'Siap', tone: 'green' },
];

export const REVIEW_OUTCOMES = [
  { key: 'fyp', label: 'FYP', hint: 'Masuk For You Page', tone: 'green' },
  { key: 'not_fyp', label: 'Tak FYP', hint: 'Tak naik, simpan sahaja', tone: 'gray' },
  { key: 'adjust', label: 'Perlu dibaiki', hint: 'Ubah dan post semula', tone: 'amber' },
];

export const CAMPAIGN_STATUSES = [
  { key: 'planning', label: 'Perancangan', tone: 'teal' },
  { key: 'active', label: 'Aktif', tone: 'green' },
  { key: 'paused', label: 'Ditangguh', tone: 'gray' },
  { key: 'completed', label: 'Selesai', tone: 'blue' },
  { key: 'archived', label: 'Arkib', tone: 'gray' },
];

export const CAMPAIGN_TEAM_ROLES = ['Campaign Manager', 'Content Lead', 'Creator Manager', 'Pasukan Produksi', 'Publishing Manager'];

export const CREATOR_STATUSES = [
  { key: 'new', label: 'Baharu', tone: 'gray' },
  { key: 'shortlisted', label: 'Disenarai pendek', tone: 'gray' },
  { key: 'contacted', label: 'Dihubungi', tone: 'blue' },
  { key: 'negotiating', label: 'Rundingan', tone: 'amber' },
  { key: 'confirmed', label: 'Disahkan', tone: 'teal' },
  { key: 'active', label: 'Aktif', tone: 'green' },
  { key: 'paused', label: 'Ditangguh', tone: 'gray' },
  { key: 'archived', label: 'Arkib', tone: 'gray' },
];

export const DELIVERABLE_STATUSES = [
  { key: 'brief_sent', label: 'Brief dihantar', tone: 'gray' },
  { key: 'in_production', label: 'Dalam produksi', tone: 'blue' },
  { key: 'submitted', label: 'Draf dihantar', tone: 'violet' },
  { key: 'revision', label: 'Pembetulan', tone: 'amber' },
  { key: 'approved', label: 'Diluluskan', tone: 'green' },
  { key: 'scheduled', label: 'Dijadual', tone: 'teal' },
  { key: 'published', label: 'Terbit', tone: 'green' },
  { key: 'completed', label: 'Selesai', tone: 'green' },
];
export const DELIVERABLE_DONE = ['published', 'completed'];

export const CONTRACT_STATUSES = [
  { key: 'none', label: 'Tiada kontrak', tone: 'gray' },
  { key: 'draft', label: 'Draf', tone: 'gray' },
  { key: 'sent', label: 'Dihantar', tone: 'blue' },
  { key: 'signed', label: 'Ditandatangan', tone: 'green' },
  { key: 'expired', label: 'Tamat', tone: 'red' },
];

export const PAYMENT_STATUSES = [
  { key: 'unpaid', label: 'Belum bayar', tone: 'gray' },
  { key: 'partial', label: 'Bayar sebahagian', tone: 'amber' },
  { key: 'paid', label: 'Sudah bayar', tone: 'green' },
];

export const STAFF_STATUSES = [
  { key: 'active', label: 'Aktif', tone: 'green' },
  { key: 'leave', label: 'Bercuti', tone: 'gray' },
  { key: 'inactive', label: 'Tidak aktif', tone: 'gray' },
];

export const METRIC_FIELDS = [
  ['views', 'Tontonan'], ['reach', 'Capaian'], ['likes', 'Suka'], ['comments', 'Komen'], ['shares', 'Kongsi'],
  ['saves', 'Simpan'], ['clicks', 'Klik'], ['conversions', 'Conversion'], ['sales', 'Jualan (RM)'],
];

export const DEFAULT_CONFIG = {
  brandName: 'Dibu Marketing',
  contentStatuses: DEFAULT_STATUSES,
  platforms: ['TikTok', 'Instagram', 'Facebook', 'YouTube'],
  pillars: ['Parenting', 'Baby Nutrition', 'Produk', 'Hiburan', 'Jenama', 'Promosi', 'UGC'],
  contentTypes: ['Video pendek', 'Reel', 'Carousel', 'Story', 'Post statik', 'Live', 'Video panjang'],
  products: ['Chicken Soup', 'Nasi Lemak', 'Oatmeal Kurma'],
  checklist: ['Brief siap', 'Skrip siap', 'Maklumat produk disemak', 'Shooting siap', 'Editing siap', 'Caption siap', 'Approval siap', 'Sudah terbit'],
  creatorTags: ['KOL', 'Influencer', 'UGC Creator', 'Affiliate', 'Parenting', 'Baby Food', 'Family', 'Lifestyle', 'Makanan', 'Product Reviewer'],
  deliverableTypes: ['Video', 'Reel', 'Story', 'Sesi live', 'Video UGC', 'Post statik'],
  linkCategories: ['Skrip', 'Brief', 'Raw footage', 'Draf', 'Final', 'Rujukan', 'Aset produk'],
  defaultWeeklyCapacity: 40,
  slotLabels: ['Slot pagi', 'Slot petang', 'Slot malam'],
};

// Singkatan platform untuk ruang sempit (kalendar, bank idea).
const PLATFORM_SHORT = { tiktok: 'TT', instagram: 'IG', facebook: 'FB', youtube: 'YT', threads: 'TH', twitter: 'X', x: 'X', linkedin: 'LI', shopee: 'SP', lemon8: 'L8' };
export const platformShort = (p) => (p ? PLATFORM_SHORT[String(p).toLowerCase()] || String(p).slice(0, 2).toUpperCase() : '');

export const findOpt = (list, key) => list.find((x) => x.key === key) || { key, label: key || '—', tone: 'gray' };
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const uid = () => Math.random().toString(36).slice(2, 10);
export const money = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 })}`;
export const num = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-MY'));
