// Prestasi: ambil rekod terkini bagi setiap content/deliverable (bukan jumlah semua rekod),
// sebab setiap rekod ialah "snapshot" angka pada tarikh tertentu.

export function latestByTarget(metrics) {
  const map = {};
  metrics.forEach((m) => {
    const cur = map[m.targetId];
    const key = `${m.date || ''}${m.createdAtIso || ''}`;
    if (!cur || key > `${cur.date || ''}${cur.createdAtIso || ''}`) map[m.targetId] = m;
  });
  return map;
}

export const engagement = (m) => (m ? (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0) : 0);

export function engagementRate(m) {
  if (!m || !m.views) return null;
  return (engagement(m) / m.views) * 100;
}

export function sumMetrics(list) {
  const t = { views: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, conversions: 0, sales: 0, count: 0 };
  list.filter(Boolean).forEach((m) => {
    t.count += 1;
    Object.keys(t).forEach((k) => { if (k !== 'count') t[k] += Number(m[k]) || 0; });
  });
  return t;
}

export const pct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);
