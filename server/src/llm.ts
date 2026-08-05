/**
 * Content generation via OpenRouter. Gemini Flash keeps the outline call
 * fast enough that listening can start within seconds of typing a topic.
 * All calls ask for JSON and parse leniently (models love code fences).
 */
import { config } from './config.js';
import type { Section, Steering, Thread } from './store.js';

async function chatJSON(system: string, user: string): Promise<any> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://teachme.jdmnk.dev',
      'X-Title': 'TeachMe',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as any;
  const text: string = body.choices?.[0]?.message?.content ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON in model output: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

const OUTLINE_SYSTEM = `You plan spoken audio learning series — think of a sharp, engaging podcast miniseries that teaches one topic to a curious adult, listened to on the go. Respond with JSON only.`;

export async function generateOutline(
  topic: string,
): Promise<{ title: string; sections: { title: string; focus: string }[] }> {
  const out = await chatJSON(
    OUTLINE_SYSTEM,
    `Topic requested by the listener: "${topic}"

Design the series. Arc: start with a hook/overview episode that makes the topic feel alive and maps the terrain, then fundamentals, then depth, then applications or common misconceptions, and end with a compact recap that cements the mental model. 6 to 9 sections; each roughly 3 minutes of speech.

Return JSON: {"title": "<short series title, no 'Episode'/'Series' words>", "sections": [{"title": "<short section title>", "focus": "<1 sentence: exactly what this section covers and why it comes here>"}]}`,
  );
  if (!out.title || !Array.isArray(out.sections) || out.sections.length < 2)
    throw new Error('bad outline shape');
  return out;
}

const SCRIPT_SYSTEM = `You write scripts for a spoken audio learning series, read verbatim by a text-to-speech voice. You are a brilliant teacher: concrete, vivid, zero fluff, genuinely engaging — like the best explainer podcasts. Respond with JSON only.`;

export async function generateScript(
  thread: Thread,
  idx: number,
): Promise<{ script: string; summary: string }> {
  const section = thread.sections[idx];
  const outline = thread.sections
    .map((s, i) => `${i + 1}. ${s.title}`)
    .join('\n');
  const covered = thread.sections
    .slice(0, idx)
    .filter((s) => s.summary)
    .map((s, i) => `${i + 1}. ${s.title}: ${s.summary}`)
    .join('\n');
  const steering = thread.steering
    .filter((st) => st.afterSection < idx)
    .map((st) => `- ${st.instruction}`)
    .join('\n');
  const isLast = idx === thread.sections.length - 1;

  const out = await chatJSON(
    SCRIPT_SYSTEM,
    `Series: "${thread.title}" — about: ${thread.topic}
Full outline:
${outline}

${covered ? `Already covered (do not repeat):\n${covered}\n` : ''}${
      steering ? `Listener steering — follow these from here on (if one is a question, answer it head-on in this section):\n${steering}\n` : ''
    }
Write section ${idx + 1} of ${thread.sections.length}: "${section.title}" (focus: ${section.focus}).

Hard rules for the script:
- Spoken prose only: no markdown, no headings, no lists, no stage directions, no "[pause]".
- 380–450 words.
- Jump straight into the material — no "welcome back", no re-introducing the series.${
      isLast ? '\n- This is the final section: end with a satisfying wrap-up of the whole series.' : '\n- End with a single short sentence that bridges to the next section.'
    }
- Write numbers, symbols, formulas and acronyms exactly as they should be spoken aloud.
- Concrete examples over abstractions; one or two rhetorical questions max.

Return JSON: {"script": "<the script>", "summary": "<one line: what this section established>"}`,
  );
  if (!out.script || !out.summary) throw new Error('bad script shape');
  return out;
}

export async function replanRemaining(
  thread: Thread,
  keepThrough: number,
  instruction: string,
): Promise<{ title: string; focus: string }[]> {
  const kept = thread.sections
    .slice(0, keepThrough + 1)
    .map((s, i) => `${i + 1}. ${s.title}${s.summary ? ` — ${s.summary}` : ''}`)
    .join('\n');
  const out = await chatJSON(
    OUTLINE_SYSTEM,
    `An audio learning series "${thread.title}" about "${thread.topic}" is mid-flight. Sections already heard (fixed, do not change):
${kept}

The listener just said: "${instruction}"

Replan only the REMAINING sections (2 to 7 of them) so the series honors this. If it's a question, the very next section should answer it directly, then continue the arc. Keep the series coherent and still end with a recap.

Return JSON: {"sections": [{"title": "...", "focus": "..."}]}`,
  );
  if (!Array.isArray(out.sections) || out.sections.length < 1)
    throw new Error('bad replan shape');
  return out.sections;
}
