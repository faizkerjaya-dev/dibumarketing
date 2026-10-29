// Warna kategori untuk membezakan PEMILIK content dan JENIS content.
// Lapan warna ini sudah disemak supaya boleh dibezakan oleh pembaca rabun warna.
// Warna hanya penanda (titik / jalur); nama sentiasa ditulis sebagai teks di sebelahnya.
// Urutan tetap: warna mengikut entiti, bukan kedudukan. Lebih dari 8 → kelabu "Lain-lain".
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const OTHER = '#a8a29e';

// Warna status content mengikut ton yang sudah ada dalam app.
export const TONE_FILL = {
  gray: '#C7C2BA', blue: '#7FA6EC', violet: '#B98AE0', amber: '#EBB75F', teal: '#6FBCAE', green: '#82C495', red: '#EB8E8A', brand: '#F5961E',
};

const at = (i) => (i >= 0 && i < PALETTE.length ? PALETTE[i] : OTHER);

// Warna staf: staff.color (indeks 0-7, dipilih dalam Pasukan) jika ada, jika tidak ikut susunan nama.
export function staffColorMap(staff) {
  const map = {};
  const used = new Set();
  staff.forEach((s) => {
    if (Number.isInteger(s.color) && s.color >= 0 && s.color < PALETTE.length) { map[s.id] = PALETTE[s.color]; used.add(s.color); }
  });
  const free = PALETTE.map((_, i) => i).filter((i) => !used.has(i));
  [...staff].filter((s) => !map[s.id]).sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach((s, i) => {
    map[s.id] = i < free.length ? PALETTE[free[i]] : OTHER;
  });
  return map;
}

export const typeColor = (config, type) => (type ? at((config.contentTypes || []).indexOf(type)) : OTHER);
