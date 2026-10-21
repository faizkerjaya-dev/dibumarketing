// Firebase setup.
// Config projek "dibu-marketing" dimasukkan terus di bawah, jadi fail .env TIDAK diperlukan.
// Config web Firebase memang awam (dimuatkan dalam browser); keselamatan data dikawal oleh firestore.rules.
// Jika env var VITE_FIREBASE_* diisi (contoh di Vercel), nilai env var itu yang digunakan.
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const DEFAULT_CONFIG = {
  apiKey: 'AIzaSyCjz6C8znAuUoLA0PlGG4YvpEghOdtP5ps',
  authDomain: 'dibu-marketing.firebaseapp.com',
  projectId: 'dibu-marketing',
  storageBucket: 'dibu-marketing.firebasestorage.app',
  messagingSenderId: '513574871449',
  appId: '1:513574871449:web:7f8d3b5684f18a6f213308',
};

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || DEFAULT_CONFIG.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_CONFIG.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || DEFAULT_CONFIG.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_CONFIG.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_CONFIG.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || DEFAULT_CONFIG.appId,
};

const REQUIRED = { VITE_FIREBASE_API_KEY: 'apiKey', VITE_FIREBASE_AUTH_DOMAIN: 'authDomain', VITE_FIREBASE_PROJECT_ID: 'projectId', VITE_FIREBASE_APP_ID: 'appId' };
export const missingEnv = Object.entries(REQUIRED).filter(([, k]) => !firebaseConfig[k]).map(([name]) => name);

export const app = missingEnv.length ? null : initializeApp(firebaseConfig);
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

// App kedua untuk admin cipta akaun staf baru tanpa log keluar admin sendiri.
export function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === 'secondary');
  return getAuth(existing || initializeApp(firebaseConfig, 'secondary'));
}
