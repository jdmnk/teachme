import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Speech dictation, shared by the topic field and the steer bar.
 * Interim results stream out as they arrive, so the field fills while talking.
 */
export function speechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  );
}

export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  // kept in a ref so a re-rendered callback never leaves the recogniser
  // writing into a stale closure
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => () => recRef.current?.stop?.(), []);

  const toggle = useCallback(() => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      alert('Voice input is not supported in this browser — type instead.');
      return;
    }
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.onresult = (ev: any) => {
      const text = Array.from(ev.results)
        .map((r: any) => r[0].transcript)
        .join(' ')
        .trim();
      cb.current(text);
    };
    const done = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onend = done;
    rec.onerror = done;
    setListening(true);
    rec.start();
  }, []);

  return { listening, toggle, supported: speechSupported() };
}
