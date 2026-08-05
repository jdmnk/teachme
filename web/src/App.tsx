import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { Login } from './components/Login';
import { Home } from './components/Home';
import { ThreadView } from './components/Thread';

type View = { name: 'home' } | { name: 'thread'; id: string };

function viewFromHash(): View {
  const m = location.hash.match(/^#\/t\/([\w]+)$/);
  return m ? { name: 'thread', id: m[1] } : { name: 'home' };
}

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>(viewFromHash);

  useEffect(() => {
    api.me().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (authed === null) return <div className="app center-fill" />;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  return (
    <div className="app">
      {view.name === 'home' ? (
        <Home openThread={(id) => (location.hash = `#/t/${id}`)} />
      ) : (
        <ThreadView key={view.id} threadId={view.id} onBack={() => (location.hash = '')} />
      )}
    </div>
  );
}
