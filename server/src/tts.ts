/**
 * Azure Speech TTS (same account as interline). Scripts run ~450 words; the
 * v1 endpoint handles that in one request, but we still chunk on sentence
 * boundaries at 3000 chars to stay well inside limits — same-format CBR mp3
 * buffers concatenate into a playable stream.
 */
import { config } from './config.js';

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

function chunk(text: string, max = 3000): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|.+$/g) ?? [text];
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

async function speakChunk(text: string): Promise<Buffer> {
  const locale = config.voice.split('-').slice(0, 2).join('-');
  const ssml = `<speak version='1.0' xml:lang='${locale}'><voice name='${config.voice}'>${escapeXml(text)}</voice></speak>`;
  const res = await fetch(
    `https://${config.azureSpeechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.azureSpeechKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'teachme',
      },
      body: ssml,
    },
  );
  if (!res.ok) throw new Error(`azure tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function speak(text: string): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (const c of chunk(text)) parts.push(await speakChunk(c));
  return Buffer.concat(parts);
}
