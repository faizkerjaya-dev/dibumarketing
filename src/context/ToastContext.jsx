// Mesej berjaya / ralat di bucu skrin. run() membungkus tindakan async dan papar ralat yang mudah difahami.
import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { explainError } from '../lib/errors';
import { log } from '../lib/log';

const ToastContext = createContext(null);
let seq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((toast) => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-3), { id, ...toast }]);
    setTimeout(() => dismiss(id), toast.kind === 'error' ? 9000 : 3500);
  }, [dismiss]);

  const success = useCallback((title) => push({ kind: 'success', title }), [push]);
  const error = useCallback((err) => {
    const e = explainError(err);
    push({ kind: 'error', title: e.title, detail: e.detail, code: e.code, link: e.link });
  }, [push]);

  const run = useCallback(async (fn, okMessage) => {
    try {
      const result = await fn();
      if (okMessage) success(okMessage);
      return result === undefined ? true : result;
    } catch (e) {
      log.error('action failed', e);
      error(e);
      return false;
    }
  }, [success, error]);

  return (
    <ToastContext.Provider value={{ success, error, run }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <div className="toast-body">
              <strong>{t.title}</strong>
              {t.detail && <span>{t.detail}</span>}
              {t.link && <a href={t.link} target="_blank" rel="noreferrer">Buka link cipta index</a>}
              {t.code && t.kind === 'error' && <code>Kod: {t.code}</code>}
            </div>
            <button type="button" className="icon-btn" aria-label="Tutup" onClick={() => dismiss(t.id)}><X size={16} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
