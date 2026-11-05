// Satu tempat untuk semua listener Firestore utama (real-time).
// Pengurus nampak semua rekod. Content Creator hanya dengar content & tugasan yang ditugaskan kepadanya.
// Status setiap koleksi (loading / error) dipaparkan dalam Settings > System check.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { isCreatorOnly, can } from '../lib/permissions';
import { syncOwnerUids } from '../lib/db';
import { log } from '../lib/log';
import { staffColorMap } from '../lib/colors';

const DataContext = createContext(null);
const NAMES = ['content', 'tasks', 'staff', 'campaigns', 'creators', 'campaignCreators', 'deliverables'];

export function DataProvider({ children }) {
  const { profile } = useAuth();
  const [data, setData] = useState(() => Object.fromEntries(NAMES.map((n) => [n, []])));
  const [loading, setLoading] = useState(() => Object.fromEntries(NAMES.map((n) => [n, true])));
  const [errors, setErrors] = useState({});

  const creatorOnly = isCreatorOnly(profile);
  const uidKey = profile?.uid;

  useEffect(() => {
    if (!uidKey) return undefined;
    const queries = creatorOnly
      ? {
          content: query(collection(db, 'content'), where('ownerUid', '==', uidKey)),
          tasks: query(collection(db, 'tasks'), where('staffUid', '==', uidKey)),
          staff: collection(db, 'staff'),
        }
      : Object.fromEntries(NAMES.map((n) => [n, collection(db, n)]));

    NAMES.filter((n) => !queries[n]).forEach((n) => setLoading((l) => ({ ...l, [n]: false })));

    const unsubs = Object.entries(queries).map(([name, q]) => onSnapshot(
      q,
      (snap) => {
        log.debug('snapshot', name, snap.size);
        setData((d) => ({ ...d, [name]: snap.docs.map((x) => ({ id: x.id, ...x.data() })) }));
        setLoading((l) => ({ ...l, [name]: false }));
        setErrors((e) => (e[name] ? { ...e, [name]: null } : e));
      },
      (err) => {
        log.error(`listener ${name} gagal`, err);
        setErrors((e) => ({ ...e, [name]: err }));
        setLoading((l) => ({ ...l, [name]: false }));
      },
    ));
    return () => unsubs.forEach((u) => u());
  }, [uidKey, creatorOnly]);

  // Pengurus membetulkan ownerUid secara automatik (rekod lama, pemilik ditukar, staf baru dipautkan),
  // supaya Content Creator sentiasa nampak content milik dia SAHAJA.
  const canFix = !creatorOnly && can(profile, 'content.edit');
  const fixing = useRef(false);
  useEffect(() => {
    if (!canFix || loading.content || loading.staff || fixing.current) return undefined;
    const t = setTimeout(async () => {
      fixing.current = true;
      try {
        const map = Object.fromEntries(data.staff.map((s) => [s.id, s]));
        await syncOwnerUids(data.content, map);
      } catch (e) { log.warn('ownerUid sync gagal', e); }
      fixing.current = false;
    }, 1500);
    return () => clearTimeout(t);
  }, [canFix, data.content, data.staff, loading.content, loading.staff]);

  const value = useMemo(() => {
    const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
    return {
      ...data,
      loading,
      errors,
      ready: NAMES.every((n) => !loading[n]),
      staffById: byId(data.staff),
      contentById: byId(data.content),
      campaignById: byId(data.campaigns),
      creatorById: byId(data.creators),
      myStaff: data.staff.find((s) => s.id === profile?.staffId) || null,
      staffColor: staffColorMap(data.staff),
    };
  }, [data, loading, errors, profile?.staffId]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
