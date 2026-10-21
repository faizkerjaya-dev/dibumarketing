// Tetapan boleh ubah (platform, pillar, produk, checklist...) dari Firestore settings/config.
// Jika dokumen belum wujud, DEFAULT_CONFIG digunakan.
import { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_CONFIG } from '../lib/constants';
import { log } from '../lib/log';

const ConfigContext = createContext(DEFAULT_CONFIG);

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  useEffect(() => onSnapshot(
    doc(db, 'settings', 'config'),
    (snap) => setConfig({ ...DEFAULT_CONFIG, ...(snap.exists() ? snap.data() : {}) }),
    (e) => log.warn('settings/config tidak dapat dibaca, guna default', e),
  ), []);
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => useContext(ConfigContext);
