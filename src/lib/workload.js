// Kiraan beban kerja: jumlah jam anggaran tugasan terbuka (hingga hujung minggu dipilih) ÷ kapasiti mingguan.
import { addDays, inRange, today, startOfWeek } from './dates';

export const BANDS = {
  over: { label: 'Melebihi kapasiti', tone: 'red' },
  near: { label: 'Hampir penuh', tone: 'amber' },
  normal: { label: 'Normal', tone: 'blue' },
  available: { label: 'Masih lapang', tone: 'green' },
  leave: { label: 'Bercuti', tone: 'gray' },
  inactive: { label: 'Tidak aktif', tone: 'gray' },
  unknown: { label: 'Tiada anggaran jam', tone: 'gray' },
};

export function staffWorkload(staff, tasks, weekStart = startOfWeek(today())) {
  const weekEnd = addDays(weekStart, 6);
  const t0 = today();
  const open = tasks.filter((t) => t.staffId === staff.id && t.status !== 'done');
  const counted = open.filter((t) => !t.deadline || t.deadline <= weekEnd);
  const hours = counted.reduce((s, t) => s + (Number(t.estHours) || 0), 0);
  const hasHours = counted.some((t) => Number(t.estHours) > 0);
  const cap = Number(staff.weeklyCapacity) || 0;
  const pct = cap && hasHours ? Math.round((hours / cap) * 100) : null;

  let band = 'unknown';
  if (staff.status === 'leave') band = 'leave';
  else if (staff.status === 'inactive') band = 'inactive';
  else if (pct != null) band = pct > 100 ? 'over' : pct >= 90 ? 'near' : pct >= 50 ? 'normal' : 'available';
  else if (counted.length === 0) band = 'available';

  return {
    active: open.length,
    overdue: open.filter((t) => t.deadline && t.deadline < t0).length,
    dueWeek: open.filter((t) => inRange(t.deadline, weekStart, weekEnd)).length,
    counted: counted.length,
    hours,
    cap,
    pct,
    hasHours,
    band,
    free: cap ? Math.max(cap - hours, 0) : 0,
  };
}

// Amaran sebelum assign tugasan. Tidak menyekat; pengguna boleh teruskan.
export function assignWarnings(staff, deadline, estHours, tasks, ignoreTaskId) {
  if (!staff) return [];
  const warnings = [];
  if (staff.status === 'leave') warnings.push(`${staff.name} sedang bercuti.`);
  if (staff.status === 'inactive') warnings.push(`${staff.name} tidak aktif.`);
  (staff.unavailable || []).forEach((u) => {
    if (deadline && inRange(deadline, u.from, u.to)) warnings.push(`${staff.name} tidak available ${u.from} hingga ${u.to}${u.note ? ` (${u.note})` : ''}.`);
  });
  const others = tasks.filter((t) => t.id !== ignoreTaskId);
  const week = startOfWeek(deadline || today());
  const w = staffWorkload(staff, others, week);
  const cap = Number(staff.weeklyCapacity) || 0;
  const after = w.hours + (Number(estHours) || 0);
  if (cap && after > cap) warnings.push(`Beban ${staff.name} minggu itu jadi ${Math.round((after / cap) * 100)}% (${after}h daripada ${cap}h).`);
  return warnings;
}
