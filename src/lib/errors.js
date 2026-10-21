// Terjemah ralat Firebase kepada mesej yang mudah difahami, dengan kod asal untuk troubleshoot.

export class AppError extends Error {
  constructor(message, code = 'validation') {
    super(message);
    this.code = code;
  }
}

const MESSAGES = {
  'permission-denied': 'Akses ditolak. Role akaun anda tidak dibenarkan buat tindakan ini, atau Firestore rules belum di-deploy.',
  unavailable: 'Tiada sambungan ke Firebase. Semak internet dan cuba lagi.',
  'not-found': 'Rekod tidak dijumpai. Mungkin sudah dipadam.',
  'already-exists': 'Rekod ini sudah wujud.',
  unauthenticated: 'Sesi tamat. Sila log masuk semula.',
  'resource-exhausted': 'Had penggunaan Firebase dicapai. Semak kuota dalam Firebase Console.',
  'auth/invalid-credential': 'Email atau kata laluan salah.',
  'auth/wrong-password': 'Email atau kata laluan salah.',
  'auth/user-not-found': 'Email atau kata laluan salah.',
  'auth/invalid-email': 'Format email tidak sah.',
  'auth/too-many-requests': 'Terlalu banyak cubaan. Tunggu sebentar dan cuba lagi.',
  'auth/email-already-in-use': 'Email ini sudah ada akaun.',
  'auth/weak-password': 'Kata laluan terlalu lemah. Minimum 6 aksara.',
  'auth/network-request-failed': 'Tiada sambungan internet.',
  'auth/user-disabled': 'Akaun ini telah dinyahaktifkan.',
  'auth/operation-not-allowed': 'Log masuk Email/Password belum diaktifkan dalam Firebase Authentication.',
  'auth/invalid-api-key': 'API key Firebase salah. Semak VITE_FIREBASE_API_KEY.',
};

export function explainError(err) {
  if (!err) return { title: 'Ralat tidak diketahui', detail: '', code: 'unknown', link: null };
  const code = err.code || 'unknown';
  const raw = err.message || String(err);
  const link = (raw.match(/https:\/\/console\.firebase\.google\.com\S+/) || [null])[0];

  if (code === 'failed-precondition' && /index/i.test(raw)) {
    return {
      title: 'Firestore perlukan index untuk paparan ini.',
      detail: 'Klik link di bawah (atau dalam Console F12) untuk cipta index. Tunggu 1 hingga 5 minit, kemudian refresh.',
      code,
      link,
    };
  }
  if (code === 'validation') return { title: raw, detail: '', code, link: null };
  return { title: MESSAGES[code] || raw, detail: MESSAGES[code] ? raw : '', code, link };
}
