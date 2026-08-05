import { Router } from 'express';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  Thread,
  addThread,
  allThreads,
  audioDir,
  getThread,
  newId,
  removeThread,
  save,
  touch,
} from './store.js';
import { generateOutline, generateScript, replanRemaining } from './llm.js';
import { speak } from './tts.js';

/**
 * Section generation is script (LLM) + synthesis (TTS) and takes 10–30 s, so
 * everything is ensure-based with in-flight dedup: the client "prepares" the
 * section it wants, and each successful generation prefetches the next one so
 * pressing Next never waits in the normal listening flow.
 */
const inflight = new Map<string, Promise<void>>();

function ensureSection(thread: Thread, idx: number): Promise<void> {
  const section = thread.sections[idx];
  if (!section) return Promise.reject(new Error('no such section'));
  if (section.status === 'ready') return Promise.resolve();
  const key = `${thread.id}:${section.id}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = (async () => {
    section.status = 'generating';
    section.error = undefined;
    await save();
    try {
      const { script, summary } = await generateScript(thread, idx);
      const audio = await speak(script);
      const file = `${thread.id}-${section.id}.mp3`;
      await fsp.writeFile(path.join(audioDir, file), audio);
      section.summary = summary;
      section.audioFile = file;
      section.chars = script.length;
      section.status = 'ready';
      touch(thread);
      await save();
    } catch (err) {
      section.status = 'error';
      section.error = String((err as Error).message ?? err).slice(0, 300);
      await save();
      throw err;
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

function prefetch(thread: Thread, idx: number) {
  if (idx < thread.sections.length)
    ensureSection(thread, idx).catch((err) =>
      console.error(`prefetch ${thread.id}[${idx}]:`, err.message),
    );
}

export const threads = Router();

// express 4 drops rejected async handlers; route through next() so the
// error middleware answers with JSON instead of hanging the request
const wrap =
  (fn: (req: any, res: any) => Promise<any>) => (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

threads.get('/', (_req, res) => {
  res.json(allThreads());
});

threads.post('/', wrap(async (req, res) => {
  const topic = String(req.body?.topic ?? '').trim();
  if (!topic) return res.status(400).json({ error: 'topic required' });
  const outline = await generateOutline(topic);
  const now = new Date().toISOString();
  const thread: Thread = {
    id: newId(),
    topic,
    title: outline.title,
    createdAt: now,
    updatedAt: now,
    steering: [],
    position: { section: 0, time: 0 },
    sections: outline.sections.map((s) => ({
      id: newId(),
      title: s.title,
      focus: s.focus,
      status: 'planned',
    })),
  };
  addThread(thread);
  await save();
  // get the first two sections into the pipe so play starts fast and
  // the first Next press is instant
  ensureSection(thread, 0)
    .then(() => prefetch(thread, 1))
    .catch((err) => console.error(`gen ${thread.id}[0]:`, err.message));
  res.json(thread);
}));

function withThread(req: any, res: any): Thread | undefined {
  const thread = getThread(req.params.id);
  if (!thread) res.status(404).json({ error: 'thread not found' });
  return thread;
}

threads.get('/:id', (req, res) => {
  const thread = withThread(req, res);
  if (thread) res.json(thread);
});

threads.delete('/:id', wrap(async (req, res) => {
  await removeThread(req.params.id);
  res.json({ ok: true });
}));

// resolves when the section's audio exists (generating it if needed)
threads.post('/:id/sections/:idx/prepare', wrap(async (req, res) => {
  const thread = withThread(req, res);
  if (!thread) return;
  const idx = Number(req.params.idx);
  try {
    await ensureSection(thread, idx);
    prefetch(thread, idx + 1);
    res.json(thread.sections[idx]);
  } catch (err) {
    res.status(502).json({ error: String((err as Error).message) });
  }
}));

threads.get('/:id/sections/:idx/audio', (req, res) => {
  const thread = withThread(req, res);
  if (!thread) return;
  const section = thread.sections[Number(req.params.idx)];
  if (!section?.audioFile) return res.status(409).json({ error: 'not generated yet' });
  res.sendFile(path.join(audioDir, section.audioFile), {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400' },
  });
});

threads.post('/:id/position', wrap(async (req, res) => {
  const thread = withThread(req, res);
  if (!thread) return;
  const section = Number(req.body?.section);
  const time = Number(req.body?.time);
  if (Number.isFinite(section) && Number.isFinite(time)) {
    thread.position = {
      section: Math.max(0, Math.min(section, thread.sections.length - 1)),
      time: Math.max(0, time),
    };
    touch(thread);
    await save();
  }
  res.json({ ok: true });
}));

threads.post('/:id/steer', wrap(async (req, res) => {
  const thread = withThread(req, res);
  if (!thread) return;
  const instruction = String(req.body?.instruction ?? '').trim();
  if (!instruction) return res.status(400).json({ error: 'instruction required' });
  const current = Math.max(0, Math.min(thread.position.section, thread.sections.length - 1));
  const fresh = await replanRemaining(thread, current, instruction);
  const dropped = thread.sections.slice(current + 1);
  thread.sections = [
    ...thread.sections.slice(0, current + 1),
    ...fresh.map((s) => ({ id: newId(), title: s.title, focus: s.focus, status: 'planned' as const })),
  ];
  thread.steering.push({ afterSection: current, instruction, at: new Date().toISOString() });
  touch(thread);
  await save();
  await Promise.all(
    dropped
      .filter((s) => s.audioFile)
      .map((s) => fsp.rm(path.join(audioDir, s.audioFile!), { force: true })),
  );
  prefetch(thread, current + 1);
  res.json(thread);
}));
