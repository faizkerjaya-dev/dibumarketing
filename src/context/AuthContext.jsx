// Login dan profil pengguna. Profil disimpan dalam Firestore: users/{uid}
// { name, email, roles: [...], staffId, active: true }
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { log } from '../lib/log';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | signedOut | noProfile | inactive | ready | error
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubProfile = () => {};
    const unsub = onAuthStateChanged(auth, (u) => {
      unsubProfile();
      setUser(u);
      setError(null);
      if (!u) {
        setProfile(null);
        setStatus('signedOut');
        return;
      }
      log.info('signed in', u.uid, u.email);
      setStatus('loading');
      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        { includeMetadataChanges: true },
        (snap) => {
          // fromCache + tiada dokumen = app belum dapat sambung ke server Firestore (internet / ad blocker / extension).
          // Jangan terus anggap profil tiada; tunggu jawapan server.
          if (!snap.exists() && snap.metadata.fromCache) {
            log.warn('Firestore belum sambung ke server (fromCache). Semak internet / ad blocker.');
            setStatus('offline');
            return;
          }
          if (!snap.exists()) {
            log.warn('users doc tiada di SERVER untuk uid', u.uid);
            setProfile(null);
            setStatus('noProfile');
            return;
          }
          const p = { uid: u.uid, email: u.email, ...snap.data() };
          p.roles = Array.isArray(p.roles) ? p.roles : [];
          setProfile(p);
          setStatus(p.active === false ? 'inactive' : 'ready');
        },
        (e) => {
          log.error('gagal baca profil', e);
          setError(e);
          setStatus('error');
        },
      );
    });
    return () => { unsub(); unsubProfile(); };
  }, []);

  const value = {
    user,
    profile,
    status,
    error,
    login: (email, password) => signInWithEmailAndPassword(auth, email.trim(), password),
    logout: () => signOut(auth),
    resetPassword: (email) => sendPasswordResetEmail(auth, email.trim()),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
