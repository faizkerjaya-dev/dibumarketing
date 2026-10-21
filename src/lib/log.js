// Logger ringkas. Simpan 200 log terakhir dalam memori untuk butang "Copy diagnostics".
// Log debug/info hanya keluar di Console bila debug aktif:
//   - tambah ?debug=1 pada URL, atau
//   - jalankan localStorage.setItem('dibu_debug','1') dalam Console.
const buffer = [];

function debugOn() {
  try {
    return localStorage.getItem('dibu_debug') === '1' || window.location.search.includes('debug=1');
  } catch {
    return false;
  }
}

function stringify(a) {
  try {
    if (a instanceof Error) return `${a.name}: ${a.message}${a.code ? ` (${a.code})` : ''}`;
    if (typeof a === 'string') return a;
    return JSON.stringify(a).slice(0, 500);
  } catch {
    return String(a);
  }
}

function push(level, args) {
  buffer.push({ t: new Date().toISOString(), level, msg: args.map(stringify).join(' ') });
  if (buffer.length > 200) buffer.shift();
}

export const log = {
  debug: (...a) => { push('debug', a); if (debugOn()) console.debug('[Dibu]', ...a); },
  info: (...a) => { push('info', a); if (debugOn()) console.info('[Dibu]', ...a); },
  warn: (...a) => { push('warn', a); console.warn('[Dibu]', ...a); },
  error: (...a) => { push('error', a); console.error('[Dibu]', ...a); },
};

export function getLogs() {
  return [...buffer];
}

export function isDebug() {
  return debugOn();
}
