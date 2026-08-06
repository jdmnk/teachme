/**
 * Azure Speech TTS via the SDK websocket path (same account and voice as the
 * old REST calls, same CBR mp3) — chosen over REST because synthesis emits
 * word-boundary events with exact audio offsets, which become per-sentence
 * start times for follow-along highlighting and precise tap-to-seek.
 *
 * Scripts run ~450 words; we still chunk on sentence boundaries at 3000
 * chars to stay inside limits — same-format CBR mp3 buffers concatenate into
 * a playable stream, and chunk durations offset the later chunks' timings.
 */
import sdk from 'microsoft-cognitiveservices-speech-sdk';
import { config } from './config.js';
import { splitSentences } from './sentences.js';

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

function chunk(text: string, max = 3000): string[] {
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length > max) {
      chunks.push(cur);
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

interface WordEvent {
  text: string;
  sec: number;
}

function speakChunk(
  text: string,
): Promise<{ audio: Buffer; words: WordEvent[]; durationSec: number }> {
  const cfg = sdk.SpeechConfig.fromSubscription(config.azureSpeechKey, config.azureSpeechRegion);
  cfg.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
  cfg.setProperty(sdk.PropertyId.SpeechServiceResponse_RequestWordBoundary, 'true');
  const synth = new sdk.SpeechSynthesizer(cfg, null as unknown as sdk.AudioConfig);
  const words: WordEvent[] = [];
  synth.wordBoundary = (_s, e) => {
    if ((e as any).boundaryType === 'WordBoundary')
      words.push({ text: e.text, sec: e.audioOffset / 1e7 });
  };
  const locale = config.voice.split('-').slice(0, 2).join('-');
  const ssml = `<speak version='1.0' xml:lang='${locale}'><voice name='${config.voice}'>${escapeXml(text)}</voice></speak>`;
  return new Promise((resolve, reject) => {
    synth.speakSsmlAsync(
      ssml,
      (result) => {
        synth.close();
        if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted)
          return reject(new Error(`azure tts: ${result.errorDetails || `reason ${result.reason}`}`));
        resolve({
          audio: Buffer.from(result.audioData),
          words,
          durationSec: result.audioDuration / 1e7,
        });
      },
      (err) => {
        synth.close();
        reject(new Error(`azure tts: ${err}`));
      },
    );
  });
}

/**
 * Match each spoken word to its char position in the raw script by ordered
 * search (robust against SSML escaping and tokenizer quirks).
 */
function matchEvents(script: string, words: WordEvent[]): { char: number; sec: number }[] {
  const events: { char: number; sec: number }[] = [];
  let ptr = 0;
  for (const w of words) {
    const at = script.indexOf(w.text, ptr);
    if (at === -1) continue;
    events.push({ char: at, sec: w.sec });
    ptr = at + w.text.length;
  }
  return events;
}

/** First word at/after each sentence start = that sentence's start time. */
function sentenceTimings(script: string, events: { char: number; sec: number }[]): number[] {
  const sentences = splitSentences(script);
  const timings: number[] = [];
  let charStart = 0;
  let ei = 0;
  for (const s of sentences) {
    while (ei < events.length && events[ei].char < charStart) ei++;
    timings.push(events[ei]?.sec ?? timings[timings.length - 1] ?? 0);
    charStart += s.length;
  }
  timings[0] = 0;
  return timings;
}

export async function speak(
  text: string,
): Promise<{ audio: Buffer; timings: number[]; words: [number, number][] }> {
  const buffers: Buffer[] = [];
  const allWords: WordEvent[] = [];
  let base = 0;
  for (const c of chunk(text)) {
    const r = await speakChunk(c);
    buffers.push(r.audio);
    for (const w of r.words) allWords.push({ text: w.text, sec: base + w.sec });
    base += r.durationSec;
  }
  const events = matchEvents(text, allWords);
  return {
    audio: Buffer.concat(buffers),
    timings: sentenceTimings(text, events),
    words: events.map((e) => [e.char, Math.round(e.sec * 100) / 100]),
  };
}
