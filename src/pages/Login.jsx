import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { explainError } from '../lib/errors';
import { Button, Field, Input } from '../components/ui';

export default function Login() {
  const { login, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await login(email, password);
    } catch (err) {
      setMsg({ kind: 'error', ...explainError(err) });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email) { setMsg({ kind: 'error', title: 'Isi email dahulu.' }); return; }
    try {
      await resetPassword(email);
      setMsg({ kind: 'ok', title: 'Email reset kata laluan telah dihantar.' });
    } catch (err) {
      setMsg({ kind: 'error', ...explainError(err) });
    }
  };

  return (
    <div className="login-screen">
      <form className="card card-pad login-card" onSubmit={submit}>
        <div>
          <h1>Dibu Marketing</h1>
          <p className="muted">Log masuk ke ruang kerja content anda</p>
        </div>
        <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nama@email.com" /></Field>
        <Field label="Kata laluan"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {msg && (
          <div className={msg.kind === 'error' ? 'errorbox' : 'okbox'}>
            <div><strong>{msg.title}</strong>{msg.code && <code className="small block">Kod: {msg.code}</code>}</div>
          </div>
        )}
        <Button variant="primary" type="submit" busy={busy}>Log masuk</Button>
        <button type="button" className="link-btn" onClick={reset}>Lupa kata laluan?</button>
      </form>
    </div>
  );
}
