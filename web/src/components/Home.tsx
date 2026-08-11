import { useEffect, useMemo, useRef, useState } from 'react';
import { LevelOption, ModelOption, Thread, api } from '../lib/api';
import { seriesHue } from '../lib/cover';
import { Cover } from './Cover';
import { Sheet } from './Sheet';

const PLANNING_LINES = [
  'Planning your series…',
  'Sketching the arc…',
  'Naming the sections…',
  'Cueing the narrator…',
];

const STARTERS = [
  'the fall of Rome',
  'how transformers work',
  'why bridges stand up',
  'wine tasting',
  'interest rates',
  'the metric system',
  'negotiation',
  'how vaccines work',
  'the physics of climbing',
  'chess engines',
  'sourdough',
  'black holes',
];

function PlanningOverlay({ topic }: { topic: string }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setLine((l) => (l + 1) % PLANNING_LINES.length), 2200);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="overlay" style={{ ['--h' as string]: seriesHue(topic) }}>
      <div className="overlay-art">
        <Cover seed={topic} />
      </div>
      <div className="overlay-topic">{topic}</div>
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
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [level, setLevel] = useState('balanced');
  const [sheet, setSheet] = useState<'level' | 'model' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // fresh suggestions each visit, so the starters never feel like fixed furniture
  const starters = useMemo(
    () => [...STARTERS].sort(() => Math.random() - 0.5).slice(0, 3),
    [],
  );

  useEffect(() => {
    api.threads().then(setThreads).catch(() => setThreads([]));
    api.models().then(setModels).catch(() => {});
    api.levels().then(setLevels).catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const t = topic.trim();
    if (!t || creating) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    setCreating(true);
    setErr(null);
    try {
      const thread = await api.createThread(t, modelId, level);
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

  const levelLabel = levels.find((l) => l.id === level)?.label ?? 'Balanced';
  const modelLabel = models.find((m) => m.id === modelId)?.label ?? 'Default';

  return (
    <div className="home">
      <header className="home-top">
        <span className="wordmark">TeachMe</span>
        {threads && threads.length > 0 && (
          <span className="count">{threads.length} series</span>
        )}
      </header>

      <h1 className="hero">
        What do you
        <br />
        want to learn?
      </h1>

      <form className="topic-form" onSubmit={create}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a topic…"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={creating}
          enterKeyHint="go"
        />
        <button type="submit" disabled={!topic.trim() || creating} aria-label="Start">
          {creating ? <span className="spinner" /> : '→'}
        </button>
      </form>

      <div className="starters">
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            onClick={() => {
              setTopic(s);
              inputRef.current?.focus();
            }}
            disabled={creating}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="opts">
        <button type="button" className="opt" onClick={() => setSheet('level')} disabled={creating}>
          {levelLabel} <span className="cv">▾</span>
        </button>
        <button type="button" className="opt" onClick={() => setSheet('model')} disabled={creating}>
          {modelLabel} <span className="cv">▾</span>
        </button>
      </div>

      {err && <p className="error-text">{err}</p>}

      {threads && threads.length > 0 && (
        <section className="shelf">
          <h2>Your shelf</h2>
          <div className="rows">
            {threads.map((t) => {
              const done = t.position.section + 1;
              const finished = done >= t.sections.length;
              return (
                <div
                  key={t.id}
                  className="row"
                  style={{ ['--h' as string]: seriesHue(t.topic) }}
                  onClick={() => openThread(t.id)}
                >
                  <Cover seed={t.topic} />
                  <div className="meta">
                    <b>{t.title}</b>
                    <s>
                      {finished ? `Finished · ${t.sections.length} sections` : `Section ${done} of ${t.sections.length}`}
                    </s>
                    <div className="progress">
                      <i style={{ width: `${(done / t.sections.length) * 100}%` }} />
                    </div>
                  </div>
                  <button
                    className="ghost-btn"
                    aria-label="Delete series"
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
        </section>
      )}

      {threads && threads.length === 0 && !creating && (
        <p className="hint">Pick one above, or type anything at all — it becomes a spoken series in about a minute.</p>
      )}

      {sheet === 'level' && (
        <Sheet title="How well do you know the topic?" onClose={() => setSheet(null)}>
          {levels.map((l) => (
            <button
              key={l.id}
              className={`sheet-opt${l.id === level ? ' selected' : ''}`}
              onClick={() => {
                setLevel(l.id);
                setSheet(null);
              }}
            >
              <b>{l.label}</b>
              <s>{l.note}</s>
            </button>
          ))}
        </Sheet>
      )}

      {sheet === 'model' && (
        <Sheet title="Which model writes it?" onClose={() => setSheet(null)}>
          {models.map((m) => (
            <button
              key={m.id}
              className={`sheet-opt${m.id === modelId ? ' selected' : ''}`}
              onClick={() => {
                setModelId(m.id);
                localStorage.setItem('tm_model', m.id);
                setSheet(null);
              }}
            >
              <b>{m.label}</b>
              <s>
                {m.note}
                {m.price ? ` · ${m.price} tokens` : ''}
              </s>
            </button>
          ))}
        </Sheet>
      )}

      {creating && <PlanningOverlay topic={topic.trim()} />}
    </div>
  );
}
