import { useCallback, useEffect, useRef, useState } from 'react';
import { Thread, api, beaconPosition } from '../lib/api';

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
    const a = audioRef.current!;
    a.pause();
    setPreparing(true);
    setPrepError(null);
    setTime(0);
    setDuration(0);
    api.prepare(threadId, idx)
      .then(() => {
        if (cancelled) return;
        setPreparing(false);
        a.src = api.audioUrl(threadId, idx);
        a.load();
      })
      .catch((e) => {
        if (cancelled) return;
        setPreparing(false);
        setPrepError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, idx, retry, thread ? 1 : 0]);

  // ---- audio element events
  useEffect(() => {
    const a = audioRef.current!;
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

  if (!thread) return <div className="center-fill" />;
  const section = thread.sections[idx];

  return (
    <div className="thread">
      <header className="thread-header">
        <button className="ghost-btn back" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <div className="thread-header-text">
          <div className="thread-title">{thread.title}</div>
          <div className="thread-topic">{thread.topic}</div>
        </div>
      </header>

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
          </li>
        ))}
      </ol>

      {steered && <div className="toast">Got it — the series bends from the next section on.</div>}

      <form className="steer" onSubmit={submitSteer}>
        <button
          type="button"
          className={`mic ${listening ? 'listening' : ''}`}
          onClick={toggleMic}
          aria-label="Speak"
        >
          {listening ? '■' : '🎙'}
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
