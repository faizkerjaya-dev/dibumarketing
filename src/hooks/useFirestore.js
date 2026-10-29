// Hook untuk query yang hanya diperlukan di halaman tertentu (komen, metrics, aktiviti, notifikasi).
import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { log } from '../lib/log';

// makeQuery mesti dibina dalam useMemo / bergantung pada deps supaya listener tidak dicipta semula setiap render.
export function useQuery(q, deps = []) {
  const [state, setState] = useState({ data: [], loading: true, error: null });
  useEffect(() => {
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, error: null }),
      (error) => {
        log.error('query gagal', error);
        setState({ data: [], loading: false, error });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// Dengar satu dokumen. ref mesti dibina dalam useMemo; key = nilai yang menukar dokumen.
export function useDoc(ref, key) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    if (!ref) { setState({ data: null, loading: false, error: null }); return undefined; }
    setState({ data: null, loading: true, error: null });
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? snap.data() : null, loading: false, error: null }),
      (error) => { log.error('dokumen gagal dibaca', error); setState({ data: null, loading: false, error }); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
