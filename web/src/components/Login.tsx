import { useState } from 'react';
import { api } from '../lib/api';

export function Login({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setErr(false);
    try {
      await api.login(code);
      onDone();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app center-fill">
      <form className="login" onSubmit={submit}>
        <div className="wordmark">
          Teach<span>Me</span>
        </div>
        <p className="tagline">Say a topic. Start listening.</p>
        <input
          type="password"
          inputMode="text"
          autoFocus
          placeholder="Access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={err ? 'shake' : ''}
        />
        <button type="submit" disabled={!code || busy}>
          Enter
        </button>
        {err && <p className="error-text">Wrong code.</p>}
      </form>
    </div>
  );
}
