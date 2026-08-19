/**
 * Content generation, dispatched per thread model. Two engines:
 * - openrouter: plain chat completion (Gemini Flash default keeps the
 *   outline call fast enough that listening starts within seconds)
 * - codex: shells out to `codex exec` headless, billing the flat Codex
 *   subscription instead of tokens; the final message lands in -o file
 * All calls ask for JSON and parse leniently (models love code fences).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { ModelOption, resolveModel } from './models.js';
import { resolveLevel } from './levels.js';
import type { Thread } from './store.js';

const execFileP = promisify(execFile);

async function codexText(prompt: string, model: string, effort: string): Promise<string> {
  const out = path.join(os.tmpdir(), `codex-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  try {
    const pending = execFileP(
      'codex',
      [
        'exec',
        '-m', model,
        '-c', `model_reasoning_effort=${effort}`,
        '-s', 'read-only',
        '--skip-git-repo-check',
        '-o', out,
        prompt,
      ],
      { timeout: 300_000, cwd: os.tmpdir(), maxBuffer: 16 * 1024 * 1024 },
    );
    // codex appends piped stdin to the prompt and blocks until EOF — close it
    pending.child.stdin?.end();
    await pending;
    return await fsp.readFile(out, 'utf8');
  } finally {
    void fsp.rm(out, { force: true }).catch(() => {});
  }
}

async function openrouterText(system: string, user: string, model: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouterKey}`,
      'Content-Type': 'application/json',
      // optional OpenRouter app attribution — set TEACHME_APP_URL to your deployment
      ...(config.appUrl ? { 'HTTP-Referer': config.appUrl, 'X-Title': 'TeachMe' } : {}),
    },
    body: JSON.stringify({
      model,
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
  return body.choices?.[0]?.message?.content ?? '';
}

const ATTEMPTS = 3;

/**
 * One generation = up to 3 fresh completions. Models occasionally return
 * prose around (or instead of) the JSON, truncate it, or the API hiccups —
 * all transient, so retry with backoff before surfacing anything. `validate`
 * runs inside the loop so shape problems retry too, not just parse errors.
 */
async function chatJSON<T>(
  opt: ModelOption,
  system: string,
  user: string,
  validate: (out: any) => T,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const text =
        opt.engine === 'codex'
          ? await codexText(
              `${system}\n\n${user}\n\nReturn ONLY the JSON object — no prose, no code fences, no tool use.`,
              opt.model,
              opt.effort ?? 'low',
            )
          : await openrouterText(system, user, opt.model);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`no JSON in model output: ${text.slice(0, 200)}`);
      return validate(JSON.parse(match[0]));
    } catch (err) {
      lastErr = err;
      console.error(`chatJSON ${opt.id} attempt ${attempt}/${ATTEMPTS}:`, (err as Error).message);
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw lastErr;
}

const OUTLINE_SYSTEM = `You plan spoken audio learning series — think of a sharp, engaging podcast miniseries that teaches one topic to a curious adult, listened to on the go. Respond with JSON only.`;

export async function generateOutline(
  topic: string,
  modelId?: string,
  level?: string,
): Promise<{ title: string; sections: { title: string; focus: string }[] }> {
  return chatJSON(
    resolveModel(modelId),
    OUTLINE_SYSTEM,
    `Topic requested by the listener: "${topic}"
Listener familiarity: ${resolveLevel(level).prompt}

Design the series. Arc: start with a hook/overview episode that makes the topic feel alive and maps the terrain, then fundamentals, then depth, then applications or common misconceptions, and end with a compact recap that cements the mental model. 6 to 9 sections; each roughly 3 minutes of speech.

Section titles must be plainly descriptive, like textbook headings: state exactly what the section covers so a listener scanning the list knows what's inside (e.g. "How attention weighs each word", not "Inside the Language Machine"). No clever, poetic, editorial or book-chapter titles.

Return JSON: {"title": "<short series title, no 'Episode'/'Series' words>", "sections": [{"title": "<plain descriptive section title>", "focus": "<1 sentence: exactly what this section covers and why it comes here>"}]}`,
    (out) => {
      if (!out.title || !Array.isArray(out.sections) || out.sections.length < 2)
        throw new Error('bad outline shape');
      return out as { title: string; sections: { title: string; focus: string }[] };
    },
  );
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

  return chatJSON(
    resolveModel(thread.modelId),
    SCRIPT_SYSTEM,
    `Series: "${thread.title}" — about: ${thread.topic}
Listener familiarity: ${resolveLevel(thread.level).prompt}
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
    (out) => {
      if (!out.script || !out.summary) throw new Error('bad script shape');
      return out as { script: string; summary: string };
    },
  );
}

/** Short follow-on topics for the home screen, always on the fast default. */
export async function suggestTopics(listened: string[]): Promise<string[]> {
  return chatJSON(
    resolveModel('default'),
    'You suggest what a curious person should learn about next. Respond with JSON only.',
    `Someone has listened to audio learning series on these topics:
${listened.map((t) => `- ${t}`).join('\n')}

Suggest 3 topics they would likely enjoy next. Each must be a genuinely DIFFERENT subject that
someone with those interests would find fascinating — a neighbouring field, a surprising
application, an underlying mechanism from another discipline.

The hard rule: if a suggestion could be described as one of the topics above in different words, or
as a chapter inside one of them, it is wrong — throw it out and think further afield. Given "the
history of the metric system", "history of measurement units" is wrong (same subject renamed) and
"how atomic clocks keep time" is right. Given "how transformers actually work", "attention
mechanisms" is wrong (a chapter of it) and "how image compression works" is right.

Each topic must be 2 to 6 words, lowercase, no punctuation, phrased the way someone would type it
into a search box.

Return JSON: {"topics": ["...", "...", "..."]}`,
    (out) => {
      if (!Array.isArray(out.topics) || out.topics.length < 1) throw new Error('bad suggestions shape');
      return out.topics.map((t: unknown) => String(t).trim()).filter(Boolean);
    },
  );
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
  return chatJSON(
    resolveModel(thread.modelId),
    OUTLINE_SYSTEM,
    `An audio learning series "${thread.title}" about "${thread.topic}" is mid-flight. Listener familiarity: ${resolveLevel(thread.level).prompt}
Sections already heard (fixed, do not change):
${kept}

The listener just said: "${instruction}"

Replan only the REMAINING sections (2 to 7 of them) so the series honors this. If it's a question, the very next section should answer it directly, then continue the arc. Keep the series coherent and still end with a recap. Section titles must be plainly descriptive, like textbook headings — no clever or editorial titles.

Return JSON: {"sections": [{"title": "...", "focus": "..."}]}`,
    (out) => {
      if (!Array.isArray(out.sections) || out.sections.length < 1)
        throw new Error('bad replan shape');
      return out.sections as { title: string; focus: string }[];
    },
  );
}
