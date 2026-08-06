import { useEffect, useState } from 'react';
import { ModelOption, Thread, api } from '../lib/api';
import { Chevron } from './Chevron';

const PLANNING_LINES = [
  'Planning your series…',
  'Sketching the arc…',
  'Naming the sections…',
  'Cueing the narrator…',
];

function PlanningOverlay({ topic }: { topic: string }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setLine((l) => (l + 1) % PLANNING_LINES.length), 2200);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="overlay">
      <span className="eq eq-big">
        <i />
        <i />
        <i />
      </span>
      <div className="overlay-topic">“{topic}”</div>
      <div className="overlay-line pulse">{PLANNING_LINES[line]}</div>
    </div>
  );
}

export function Home({ openThread }: { openThread: (id: string) => void }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [topic, setTopic] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelId, setModelId] = useState(() => localStorage.getItem('tm_model') || 'default');
  const [showModel, setShowModel] = useState(false);

  useEffect(() => {
    api.threads().then(setThreads).catch(() => setThreads([]));
    api.models().then(setModels).catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const t = topic.trim();
    if (!t || creating) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    setCreating(true);
    setErr(null);
    try {
      const thread = await api.createThread(t, modelId);
      openThread(thread.id);
    } catch (error) {
      setErr((error as Error).message);
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this series?')) return;
    await api.deleteThread(id).catch(() => {});
    setThreads((ts) => ts?.filter((t) => t.id !== id) ?? null);
  }

  return (
    <div className="home">
      <div className="wordmark home-wordmark">
        Teach<span>Me</span>
      </div>

      <form className="topic-form" onSubmit={create}>
        <input
          type="text"
          placeholder="What do you want to learn?"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={creating}
          enterKeyHint="go"
        />
        <button type="submit" disabled={!topic.trim() || creating} aria-label="Start">
          {creating ? <span className="spinner" /> : '→'}
        </button>
      </form>
      {models.length > 0 && (
        <div className="model-box">
          <button
            type="button"
            className="model-toggle"
            onClick={() => setShowModel((s) => !s)}
          >
            Model: <strong>{(models.find((m) => m.id === modelId) ?? models[0]).label}</strong>
            <Chevron open={showModel} />
          </button>
          {showModel && (
            <div className="model-list">
              {models.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={`model-option ${m.id === modelId ? 'selected' : ''}`}
                  onClick={() => {
                    setModelId(m.id);
                    localStorage.setItem('tm_model', m.id);
                    setShowModel(false);
                  }}
                >
                  <span className="model-name">{m.label}</span>
                  <span className="model-meta">
                    {m.note}
                    {m.price ? ` · ${m.price} tokens` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {creating && <PlanningOverlay topic={topic.trim()} />}
      {err && <p className="error-text">{err}</p>}

      {threads && threads.length > 0 && (
        <div className="thread-list">
          <h2>Continue listening</h2>
          {threads.map((t) => {
            const done = t.position.section + 1;
            return (
              <div key={t.id} className="thread-card" onClick={() => openThread(t.id)}>
                <div className="thread-card-main">
                  <div className="thread-card-title">{t.title}</div>
                  <div className="thread-card-sub">
                    Section {done} of {t.sections.length}
                  </div>
                  <div className="progress">
                    <div
                      className="progress-fill"
                      style={{ width: `${(done / t.sections.length) * 100}%` }}
                    />
                  </div>
                </div>
                <button
                  className="ghost-btn"
                  aria-label="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(t.id);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
      {threads && threads.length === 0 && !creating && (
        <p className="hint">Type anything — the fall of Rome, how transformers work, wine tasting basics — and press go.</p>
      )}
    </div>
  );
}
