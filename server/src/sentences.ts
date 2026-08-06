// Sentence splitting — MUST stay in sync with web/src/lib/sentences.ts,
// since stored per-sentence timings are matched to the client's split by index.
export function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
}
