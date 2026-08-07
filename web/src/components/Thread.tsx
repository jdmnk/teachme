import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, LevelOption, ModelOption, Thread, api, beaconPosition } from '../lib/api';
import {
  activeFromTimings,
  activeSentence,
  sentenceStartTime,
  splitSentences,
} from '../lib/sentences';
import { Chevron } from './Chevron';

const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

function fmt(t: number): string {
  if (!Number.isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ThreadView({ threadId, onBack }: { threadId: string; onBack: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [idx, setIdx] = useState(0);
  const [preparing, setPreparing] = useState(true);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(() => Number(localStorage.getItem('tm_speed')) || 1);
  const [steerText, setSteerText] = useState('');
  const [steering, setSteering] = useState(false);
  const [steered, setSteered] = useState(false);
  const [listening, setListening] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [showSections, setShowSections] = useState(false);
  const [showText, setShowText] = useState(() => localStorage.getItem('tm_show_text') !== '0');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);

  useEffect(() => {
    api.models().then(setModels).catch(() => {});
    api.levels().then(setLevels).catch(() => {});
  }, []);
  const activeSentenceRef = useRef<HTMLSpanElement | null>(null);
  const scrollSuppress = useRef(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const wantPlay = useRef(false);
  const pendingSeek = useRef<number | null>(null);
  const recRef = useRef<any>(null);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  // ---- thread load + light polling (section statuses change while generating)
  useEffect(() => {
    let alive = true;
    api.thread(threadId).then((t) => {
      if (!alive) return;
      setThread(t);
      const start = Math.min(t.position.section, t.sections.length - 1);
      pendingSeek.current = t.position.time > 3 ? t.position.time : null;
      setIdx(start);
    }).catch(() => onBack());
    const poll = setInterval(() => {
      api.thread(threadId).then((t) => alive && setThread(t)).catch(() => {});
    }, 4000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [threadId]);

  // ---- prepare current section, then point the audio element at it
  useEffect(() => {
    if (!thread) return;
    let cancelled = false;
    let attempts = 0;
    const a = audioRef.current!;
    const url = api.audioUrl(threadId, idx);
    a.pause();
    setPreparing(true);
    setPrepError(null);
    setTime(0);
    setDuration(0);
    const loadAudio = () => {
      if (a.src.endsWith(url)) return;
      a.src = url;
      a.load();
    };
    const attempt = () => {
      api.prepare(threadId, idx)
        .then(() => {
          if (cancelled) return;
          setPreparing(false);
          loadAudio();
        })
        .catch((e) => {
          if (cancelled) return;
          attempts++;
          // network drops (Safari's "Load failed") and gateway errors are
          // transient — the server keeps generating even if the connection
          // died, so retry quietly; real server errors surface immediately
          const transient = !(e instanceof ApiError) || e.status >= 502;
          if (transient && attempts < 4) {
            setTimeout(() => !cancelled && attempt(), 2500);
          } else {
            setPreparing(false);
            setPrepError((e as Error).message);
          }
        });
    };
    attempt();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, idx, retry, thread ? 1 : 0]);

  // ---- safety net: the 4s thread poll sees the section turn ready even if
  // every prepare request's connection died — load the audio from status
  const polledStatus = thread?.sections[idx]?.status;
  useEffect(() => {
    if (polledStatus !== 'ready' || (!preparing && !prepError)) return;
    const a = audioRef.current!;
    const url = api.audioUrl(threadId, idx);
    setPreparing(false);
    setPrepError(null);
    if (!a.src.endsWith(url)) {
      a.src = url;
      a.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polledStatus, preparing, prepError]);

  // ---- audio element events; the <audio> only mounts once the thread has
  // loaded (early-return render), so bail until the ref exists
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onLoaded = () => {
      setDuration(a.duration);
      a.playbackRate = Number(localStorage.getItem('tm_speed')) || 1;
      if (pendingSeek.current != null) {
        a.currentTime = Math.min(pendingSeek.current, Math.max(0, a.duration - 1));
        pendingSeek.current = null;
      }
      if (wantPlay.current) {
        wantPlay.current = false;
        a.play().catch(() => {});
      }
    };
    const onTime = () => setTime(a.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      wantPlay.current = true;
      setIdx((i) => i + 1 < (thread?.sections.length ?? 0) ? i + 1 : (wantPlay.current = false, i));
    };
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
    };
  }, [thread?.sections.length]);

  // ---- position persistence
  useEffect(() => {
    const save = () => {
      const a = audioRef.current;
      if (a && thread) api.savePosition(threadId, idxRef.current, a.currentTime).catch(() => {});
    };
    const iv = setInterval(() => {
      if (!audioRef.current?.paused) save();
    }, 5000);
    const onHide = () => {
      const a = audioRef.current;
      if (a && thread) beaconPosition(threadId, idxRef.current, a.currentTime);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(iv);
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, [threadId, thread ? 1 : 0]);

  const next = useCallback(() => {
    if (!thread) return;
    if (idxRef.current + 1 < thread.sections.length) {
      wantPlay.current = true;
      setIdx(idxRef.current + 1);
    }
  }, [thread]);

  const prev = useCallback(() => {
    const a = audioRef.current!;
    if (a.currentTime > 5 || idxRef.current === 0) {
      a.currentTime = 0;
    } else {
      wantPlay.current = true;
      setIdx(idxRef.current - 1);
    }
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current!;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);

  // ---- desktop: space toggles play/pause (unless typing or on a control)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement;
      if (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'BUTTON' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable
      )
        return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // ---- lock screen / headphone controls
  useEffect(() => {
    if (!('mediaSession' in navigator) || !thread) return;
    const section = thread.sections[idx];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: section?.title ?? thread.title,
      artist: thread.title,
      album: 'TeachMe',
    });
    navigator.mediaSession.setActionHandler('play', toggle);
    navigator.mediaSession.setActionHandler('pause', toggle);
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      audioRef.current!.currentTime = Math.max(0, audioRef.current!.currentTime - 15);
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      audioRef.current!.currentTime += 30;
    });
  }, [thread, idx, next, prev, toggle]);

  function cycleSpeed() {
    const cur = SPEEDS.indexOf(speed);
    const nextSpeed = SPEEDS[(cur + 1) % SPEEDS.length];
    setSpeed(nextSpeed);
    localStorage.setItem('tm_speed', String(nextSpeed));
    audioRef.current!.playbackRate = nextSpeed;
  }

  async function submitSteer(e?: React.FormEvent) {
    e?.preventDefault();
    const instruction = steerText.trim();
    if (!instruction || steering) return;
    setSteering(true);
    try {
      const t = await api.steer(threadId, instruction);
      setThread(t);
      setSteerText('');
      setSteered(true);
      setTimeout(() => setSteered(false), 3500);
    } catch (err) {
      alert(`Steering failed: ${(err as Error).message}`);
    } finally {
      setSteering(false);
    }
  }

  function toggleMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Voice input is not supported in this browser — type instead.');
      return;
    }
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.onresult = (ev: any) => {
      const text = Array.from(ev.results).map((r: any) => r[0].transcript).join(' ');
      setSteerText(text);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onerror = rec.onend;
    setListening(true);
    rec.start();
  }

  const section = thread?.sections[idx];
  const sentences = useMemo(
    () => (section?.script ? splitSentences(section.script) : []),
    [section?.script],
  );
  // exact per-sentence timings ship with newly generated sections; older
  // ones fall back to the proportional estimate
  const timings =
    section?.timings && section.timings.length === sentences.length ? section.timings : null;
  const activeIdx = sentences.length
    ? timings
      ? activeFromTimings(timings, time)
      : activeSentence(sentences, time, duration)
    : 0;
  const words = section?.words ?? null;
  let activeWord = -1;
  if (words) for (let i = 0; i < words.length && time >= words[i][1]; i++) activeWord = i;
  const sentenceStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const s of sentences) {
      starts.push(acc);
      acc += s.length;
    }
    return starts;
  }, [sentences]);

  // word-level updates need finer clock than the ~4Hz timeupdate event
  useEffect(() => {
    if (!playing || !words) return;
    const iv = setInterval(() => {
      const a = audioRef.current;
      if (a) setTime(a.currentTime);
    }, 100);
    return () => clearInterval(iv);
  }, [playing, words != null ? 1 : 0]);

  // active sentence rendered word-by-word; the current word lights up
  function renderSentence(i: number) {
    const raw = sentences[i];
    const text = raw.trim();
    if (i !== activeIdx || !words) return text;
    const lead = raw.length - raw.trimStart().length;
    const start = sentenceStarts[i] + lead;
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (let wi = 0; wi < words.length; wi++) {
      const rel = words[wi][0] - start;
      if (rel < cursor || rel >= text.length) continue;
      const match = text.slice(rel).match(/^\S+/);
      if (!match) continue;
      if (rel > cursor) parts.push(text.slice(cursor, rel));
      parts.push(
        <span key={wi} className={`word${wi === activeWord ? ' on' : ''}`}>
          {match[0]}
        </span>,
      );
      cursor = rel + match[0].length;
    }
    parts.push(text.slice(cursor));
    return parts;
  }

  // follow the reading position, but yield to a user who is scrolling around
  useEffect(() => {
    if (!playing || Date.now() < scrollSuppress.current) return;
    activeSentenceRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx, playing]);

  function seekToSentence(i: number) {
    const a = audioRef.current!;
    if (!duration) return;
    // land a hair inside the sentence: the element rounds currentTime down
    // to a frame boundary, which would map the highlight to the previous one
    const start = timings ? timings[i] : sentenceStartTime(sentences, i, duration);
    const t = Math.min(start + (timings ? 0.05 : 0.15), duration);
    a.currentTime = t;
    setTime(t);
  }

  if (!thread) return <div className="center-fill" />;

  return (
    <div className="thread">
      <header className="thread-header">
        <button className="ghost-btn back" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <div className="thread-header-text">
          <div className="thread-title">{thread.title}</div>
          <div className="thread-sub">
            {models.length > 0 && (
              <span className="thread-model">
                {models.find((m) => m.id === (thread.modelId ?? 'default'))?.label ??
                  thread.modelId}
              </span>
            )}
            {thread.level && thread.level !== 'balanced' && (
              <span className="thread-model">
                {levels.find((l) => l.id === thread.level)?.label ?? thread.level}
              </span>
            )}
            <span className="thread-topic">{thread.topic}</span>
          </div>
        </div>
      </header>

      <button className="sections-toggle" onClick={() => setShowSections((s) => !s)}>
        Sections
        <span className="sections-count">
          {idx + 1} / {thread.sections.length}
        </span>
        <Chevron open={showSections} />
      </button>
      {showSections && (
      <ol className="sections">
        {thread.sections.map((s, i) => (
          <li
            key={s.id}
            className={[
              'section',
              i === idx ? 'current' : '',
              s.status,
              i < idx ? 'past' : '',
            ].join(' ')}
          >
            <div
              className="section-row"
              onClick={() => {
                if (i === idx) return;
                wantPlay.current = true;
                setIdx(i);
              }}
            >
              <span className="section-num">
                {i === idx && playing ? (
                  <span className="eq">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  i + 1
                )}
              </span>
              <span className="section-title">{s.title}</span>
              <span className="section-state">
                {s.status === 'generating' && <span className="dot pulse" />}
                {s.status === 'error' && '!'}
              </span>
              <button
                className="ghost-btn section-expand"
                aria-label="Show text"
                onClick={(e) => {
                  e.stopPropagation();
                  setTitleDraft(null);
                  setExpanded(expanded === s.id ? null : s.id);
                }}
              >
                <Chevron open={expanded === s.id} />
              </button>
            </div>
            {expanded === s.id && (
              <div className="section-panel">
                {titleDraft !== null ? (
                  <form
                    className="rename-row"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const title = titleDraft.trim();
                      if (!title) return;
                      const updated = await api.renameSection(threadId, i, title).catch(() => null);
                      if (updated) {
                        setThread((t) =>
                          t
                            ? {
                                ...t,
                                sections: t.sections.map((x) =>
                                  x.id === s.id ? { ...x, title } : x,
                                ),
                              }
                            : t,
                        );
                      }
                      setTitleDraft(null);
                    }}
                  >
                    <input
                      autoFocus
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      enterKeyHint="done"
                    />
                    <button type="submit" disabled={!titleDraft.trim()}>
                      Save
                    </button>
                    <button type="button" className="ghost-btn" onClick={() => setTitleDraft(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button className="rename-btn" onClick={() => setTitleDraft(s.title)}>
                    ✎ Rename
                  </button>
                )}
                {s.script ? (
                  <p className="section-script">{s.script}</p>
                ) : s.status === 'ready' ? (
                  <p className="section-script dim">
                    Text wasn't stored for sections generated before this update — only newer
                    sections keep their transcript.
                  </p>
                ) : (
                  <p className="section-script dim">
                    Not written yet. Planned focus: {s.focus}
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      )}

      <button
        className="sections-toggle"
        onClick={() =>
          setShowText((s) => {
            localStorage.setItem('tm_show_text', s ? '0' : '1');
            return !s;
          })
        }
      >
        Text
        <Chevron open={showText} />
      </button>
      {!showText && <div className="fill" />}
      {showText && (
      <div
        className="reading"
        onWheel={() => (scrollSuppress.current = Date.now() + 5000)}
        onTouchMove={() => (scrollSuppress.current = Date.now() + 5000)}
      >
        {sentences.length > 0 ? (
          <p className="reading-text">
            {sentences.map((sn, i) => (
              <span
                key={i}
                ref={i === activeIdx ? activeSentenceRef : undefined}
                className={`sentence${i === activeIdx ? ' active' : i < activeIdx ? ' read' : ''}`}
                onClick={() => seekToSentence(i)}
              >
                {renderSentence(i)}
              </span>
            ))}
          </p>
        ) : preparing ? (
          <>
            <p className="reading-hint pulse">Writing &amp; recording this section…</p>
            {section?.focus && <p className="reading-hint">{section.focus}</p>}
          </>
        ) : section?.status === 'ready' ? (
          <p className="reading-hint">
            Text wasn't stored for sections generated before transcripts shipped — the audio still
            plays fine.
          </p>
        ) : (
          <p className="reading-hint">{section?.focus ?? ''}</p>
        )}
      </div>
      )}

      {steered && <div className="toast">Got it — the series bends from the next section on.</div>}

      <form className="steer" onSubmit={submitSteer}>
        <button
          type="button"
          className={`mic ${listening ? 'listening' : ''}`}
          onClick={toggleMic}
          aria-label={listening ? 'Stop recording' : 'Speak'}
        >
          <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
            {listening ? (
              <rect x="7" y="7" width="10" height="10" rx="2" />
            ) : (
              <>
                <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
                <path d="M17 11a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V20h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.07A7 7 0 0 1 5 11a1 1 0 1 1 2 0 5 5 0 0 0 10 0z" />
              </>
            )}
          </svg>
        </button>
        <input
          type="text"
          placeholder="Ask a question or steer the series…"
          value={steerText}
          onChange={(e) => setSteerText(e.target.value)}
          enterKeyHint="send"
        />
        <button type="submit" disabled={!steerText.trim() || steering} aria-label="Send">
          {steering ? <span className="spinner" /> : '→'}
        </button>
      </form>

      <div className="player">
        <div className="player-section">
          <span className="player-count">
            {idx + 1} / {thread.sections.length}
          </span>
          <span className="player-title">{section?.title}</span>
        </div>

        {prepError ? (
          <div className="prep-error">
            <span>Generation failed: {prepError}</span>
            <button className="ghost-btn" onClick={() => setRetry((r) => r + 1)}>
              Retry
            </button>
          </div>
        ) : preparing ? (
          <div className="preparing pulse">Writing &amp; recording this section…</div>
        ) : (
          <div className="seek-row">
            <span className="time">{fmt(time)}</span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={Math.min(time, duration || 1)}
              onChange={(e) => {
                audioRef.current!.currentTime = Number(e.target.value);
              }}
            />
            <span className="time">{fmt(duration)}</span>
          </div>
        )}

        <div className="controls">
          <button className="speed" onClick={cycleSpeed}>
            {speed}×
          </button>
          <button className="skip" onClick={prev} aria-label="Previous" disabled={preparing}>
            ⏮
          </button>
          <button
            className="play"
            onClick={toggle}
            disabled={preparing || !!prepError}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            className="skip"
            onClick={next}
            aria-label="Next"
            disabled={idx + 1 >= thread.sections.length}
          >
            ⏭
          </button>
          <span className="speed-spacer" />
        </div>
      </div>

      <audio ref={audioRef} preload="auto" />
    </div>
  );
}
