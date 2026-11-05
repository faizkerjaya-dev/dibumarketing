// useState yang diingat dalam pelayar (localStorage). Digunakan untuk penapis supaya pilihan
// kekal selepas tukar halaman atau refresh. Jika storan tidak tersedia, ia bertindak seperti useState biasa.
import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'dibu_f_';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    // Objek: gabung dengan nilai asal supaya medan baharu sentiasa wujud.
    if (fallback && typeof fallback === 'object' && !Array.isArray(fallback) && v && typeof v === 'object') return { ...fallback, ...v };
    if (typeof fallback !== 'object' && typeof v !== typeof fallback) return fallback;
    return v;
  } catch { return fallback; }
}

export function usePersistentState(key, initial) {
  const fallbackRef = useRef(typeof initial === 'function' ? initial() : initial);
  const [value, setValue] = useState(() => read(key, fallbackRef.current));
  useEffect(() => {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storan penuh / disekat */ }
  }, [key, value]);
  const reset = useCallback(() => setValue(fallbackRef.current), []);
  return [value, setValue, reset];
}

// Padam semua penapis yang diingat (cth. butang "Set semula" global).
export function clearPersistedFilters() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* abaikan */ }
}
