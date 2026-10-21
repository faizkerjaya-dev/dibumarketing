// Tangkap ralat React supaya skrin tidak jadi putih. Papar mesej + butang salin diagnostik.
import { Component } from 'react';
import { getLogs } from '../lib/log';

export function diagnostics(extra = {}) {
  return JSON.stringify({
    time: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    ...extra,
    recentLogs: getLogs().slice(-40),
  }, null, 2);
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Dibu] UI crash', error, info?.componentStack);
  }

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    const text = diagnostics({ error: `${error.name}: ${error.message}`, stack: error.stack });
    return (
      <div className="crash">
        <h1>Halaman ini mengalami ralat</h1>
        <p>Cuba refresh. Jika berulang, tekan “Copy diagnostics” dan hantar kepada IT.</p>
        <code className="crash-msg">{error.message}</code>
        <div className="row gap-sm wrap">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Refresh</button>
          <button type="button" className="btn btn-secondary" onClick={() => { navigator.clipboard?.writeText(text); this.setState({ copied: true }); }}>{copied ? 'Copied' : 'Copy diagnostics'}</button>
          <a className="btn btn-secondary" href="/">Go to home</a>
        </div>
        <details><summary>Technical details</summary><pre>{text}</pre></details>
      </div>
    );
  }
}
