/**
 * Single-user JSON store. Threads are small (outline + scripts + file refs;
 * audio lives as mp3 files next to it), so one atomically-rewritten db.json
 * beats a database here. Writes are serialized through a promise chain.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export type SectionStatus = 'planned' | 'generating' | 'ready' | 'error';

export interface Section {
  id: string;
  title: string;
  focus: string;
  status: SectionStatus;
  summary?: string;
  audioFile?: string;
  chars?: number;
  error?: string;
}

export interface Steering {
  afterSection: number;
  instruction: string;
  at: string;
}

export interface Thread {
  id: string;
  topic: string;
  title: string;
  modelId?: string;
  createdAt: string;
  updatedAt: string;
  sections: Section[];
  steering: Steering[];
  position: { section: number; time: number };
}

interface Db {
  threads: Thread[];
}

const dbFile = path.join(config.dataDir, 'db.json');
export const audioDir = path.join(config.dataDir, 'audio');

fs.mkdirSync(audioDir, { recursive: true });

const db: Db = fs.existsSync(dbFile)
  ? (JSON.parse(fs.readFileSync(dbFile, 'utf8')) as Db)
  : { threads: [] };

// interrupted mid-generation states from a previous run are stale
for (const t of db.threads)
  for (const s of t.sections) if (s.status === 'generating') s.status = 'planned';

let writeChain: Promise<void> = Promise.resolve();

export function save(): Promise<void> {
  // recover from a failed write: chain on the settled previous attempt so
  // one error doesn't poison every save after it
  writeChain = writeChain.catch(() => {}).then(async () => {
    const tmp = dbFile + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(db, null, 2));
    await fsp.rename(tmp, dbFile);
  });
  return writeChain;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function allThreads(): Thread[] {
  return [...db.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getThread(id: string): Thread | undefined {
  return db.threads.find((t) => t.id === id);
}

export function addThread(t: Thread) {
  db.threads.push(t);
}

export async function removeThread(id: string) {
  const t = getThread(id);
  if (!t) return;
  db.threads.splice(db.threads.indexOf(t), 1);
  await Promise.all(
    t.sections
      .filter((s) => s.audioFile)
      .map((s) => fsp.rm(path.join(audioDir, s.audioFile!), { force: true })),
  );
  await save();
}

export function touch(t: Thread) {
  t.updatedAt = new Date().toISOString();
}
