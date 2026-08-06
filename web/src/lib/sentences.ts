/**
 * Sentence-level position mapping. Azure's REST endpoint returns audio with
 * no timestamps, but neural TTS pace is steady enough that apportioning the
 * clip's duration by sentence character count tracks real position within a
 * second or two — plenty for follow-along highlighting and tap-to-seek.
 */
// MUST stay in sync with server/src/sentences.ts — stored timings are
// matched to this split by index.
export function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
}

export function activeFromTimings(timings: number[], time: number): number {
  let i = 0;
  while (i + 1 < timings.length && time >= timings[i + 1]) i++;
  return i;
}

export function activeSentence(sentences: string[], time: number, duration: number): number {
  if (!duration || sentences.length === 0) return 0;
  const total = sentences.reduce((a, s) => a + s.length, 0);
  const target = (time / duration) * total;
  let acc = 0;
  for (let i = 0; i < sentences.length; i++) {
    acc += sentences[i].length;
    if (target < acc) return i;
  }
  return sentences.length - 1;
}

export function sentenceStartTime(sentences: string[], index: number, duration: number): number {
  const total = sentences.reduce((a, s) => a + s.length, 0);
  if (!total || !duration) return 0;
  let acc = 0;
  for (let i = 0; i < index; i++) acc += sentences[i].length;
  return (acc / total) * duration;
}
