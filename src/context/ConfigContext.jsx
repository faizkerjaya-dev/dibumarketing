// Tetapan boleh ubah (platform, pillar, produk, checklist...) dari Firestore settings/config.
// Jika dokumen belum wujud, DEFAULT_CONFIG digunakan.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_CONFIG } from '../lib/constants';
import { log } from '../lib/log';

const ConfigContext = createContext(DEFAULT_CONFIG);

export function ConfigProvider({ children }) {
  const [base, setBase] = useState(DEFAULT_CONFIG);
  const [social, setSocial] = useState({});
  useEffect(() => onSnapshot(
    doc(db, 'settings', 'config'),
    (snap) => setBase({ ...DEFAULT_CONFIG, ...(snap.exists() ? snap.data() : {}) }),
    (e) => log.warn('settings/config tidak dapat dibaca, guna default', e),
  ), []);
  // settings/social: akaun media sosial + siapa boleh tanda Pos (diurus oleh SMM).
  useEffect(() => onSnapshot(
    doc(db, 'settings', 'social'),
    (snap) => setSocial(snap.exists() ? snap.data() : {}),
    (e) => log.warn('settings/social tidak dapat dibaca', e),
  ), []);
  const config = useMemo(() => ({ ...base, social }), [base, social]);
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => useContext(ConfigContext);
