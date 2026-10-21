// Komponen UI asas yang digunakan di semua halaman.
import { useEffect, useState, useCallback, forwardRef } from 'react';
import { X, Loader2, AlertTriangle, Search } from 'lucide-react';
import { explainError } from '../lib/errors';

export function Button({ variant = 'secondary', size, icon: Icon, children, className = '', busy, disabled, ...props }) {
  return (
    <button type="button" className={`btn btn-${variant}${size ? ` btn-${size}` : ''} ${className}`} {...props} disabled={busy || disabled}>
      {busy ? <Loader2 size={16} className="spin" /> : Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, ...props }) {
  return <button type="button" className="icon-btn" aria-label={label} title={label} {...props}><Icon size={18} /></button>;
}

export function Pill({ tone = 'gray', children, strong }) {
  return <span className={`pill tone-${tone}${strong ? ' pill-strong' : ''}`}>{children}</span>;
}

export function Card({ title, subtitle, actions, children, className = '', pad = true }) {
  return (
    <section className={`card ${pad ? 'card-pad' : ''} ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          {actions && <div className="row gap-sm wrap">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, crumb, actions, children }) {
  return (
    <div className="page-header">
      <div className="grow min0">
        {crumb && <div className="crumb">{crumb}</div>}
        <h1>{title}</h1>
        {children}
      </div>
      {actions && <div className="row gap-sm wrap">{actions}</div>}
    </div>
  );
}

// group: guna untuk kumpulan butang (MultiChips) supaya klik pada label tidak menekan butang pertama.
export function Field({ label, hint, required, children, full, group }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={`field${full ? ' field-full' : ''}`} role={group ? 'group' : undefined} aria-label={group ? label : undefined}>
      <span className="field-label">{label}{required && <span className="req"> *</span>}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </Tag>
  );
}

export const Input = forwardRef((props, ref) => <input ref={ref} className="input" {...props} />);
Input.displayName = 'Input';
export const Textarea = (props) => <textarea className="input" rows={3} {...props} />;

export function Select({ options = [], placeholder, ...props }) {
  return (
    <select className="input" {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : { value: o.value ?? o.key ?? o.id, label: o.label ?? o.name };
        return <option key={opt.value} value={opt.value}>{opt.label}</option>;
      })}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Cari', className = '' }) {
  return (
    <label className={`search ${className}`}>
      <Search size={16} aria-hidden="true" />
      <span className="sr-only">{placeholder}</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <IconButton icon={X} label="Tutup" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// Pengesahan sebelum tindakan penting. Guna: const [confirm, confirmEl] = useConfirm();
export function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = useCallback((message, { title = 'Sahkan', okLabel = 'Sahkan', danger } = {}) => new Promise((resolve) => {
    setState({ message, title, okLabel, danger, resolve });
  }), []);
  const close = (v) => { state?.resolve(v); setState(null); };
  const el = (
    <Modal
      open={!!state}
      title={state?.title}
      onClose={() => close(false)}
      footer={<>
        <Button onClick={() => close(false)}>Batal</Button>
        <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.okLabel}</Button>
      </>}
    >
      <p className="pre-line">{state?.message}</p>
    </Modal>
  );
  return [confirm, el];
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key} className={`tab${value === t.key ? ' active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}{t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.key} type="button" className={value === o.key ? 'on' : ''} onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Empty({ title, text, action }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Loading({ text = 'Memuatkan…' }) {
  return <div className="loading"><Loader2 size={20} className="spin" /> {text}</div>;
}

export function ErrorBox({ error, title }) {
  if (!error) return null;
  const e = explainError(error);
  return (
    <div className="errorbox">
      <AlertTriangle size={18} />
      <div>
        <strong>{title || e.title}</strong>
        {title && <div>{e.title}</div>}
        {e.detail && <div className="small">{e.detail}</div>}
        {e.link && <a href={e.link} target="_blank" rel="noreferrer">Cipta index yang diperlukan</a>}
        <code className="small">Kod: {e.code}</code>
      </div>
    </div>
  );
}

export function Avatar({ name = '', size = 32, warn }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return <span className={`avatar${warn ? ' avatar-warn' : ''}`} style={{ width: size, height: size, fontSize: size * 0.36 }} title={name}>{ini}</span>;
}

export function Bar({ pct = 0, tone = 'brand', height = 6 }) {
  return (
    <div className="bar" style={{ height }}>
      <div className={`bar-fill fill-${tone}`} style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

// Pilih banyak nilai (tags, platform, skills). Boleh tambah nilai baru jika allowNew.
export function MultiChips({ options = [], value = [], onChange, allowNew }) {
  const [draft, setDraft] = useState('');
  const all = [...new Set([...options, ...value])];
  const toggle = (o) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="chips">
      {all.map((o) => (
        <button key={o} type="button" className={`chip${value.includes(o) ? ' on' : ''}`} onClick={() => toggle(o)} aria-pressed={value.includes(o)}>{o}</button>
      ))}
      {allowNew && (
        <input
          className="chip-input"
          value={draft}
          placeholder="+ Add"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              if (!value.includes(draft.trim())) onChange([...value, draft.trim()]);
              setDraft('');
            }
          }}
        />
      )}
    </div>
  );
}

export function KeyVal({ items }) {
  return (
    <div className="keyval">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k}><div className="muted small">{k}</div><div className="kv-value">{v || '—'}</div></div>
      ))}
    </div>
  );
}
