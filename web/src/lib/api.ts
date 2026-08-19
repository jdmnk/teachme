export type SectionStatus = 'planned' | 'generating' | 'ready' | 'error';

export interface Section {
  id: string;
  title: string;
  focus: string;
  status: SectionStatus;
  summary?: string;
  script?: string;
  timings?: number[];
  words?: [number, number][];
  audioFile?: string;
  error?: string;
}

export interface ModelOption {
  id: string;
  label: string;
  note: string;
  engine: 'openrouter' | 'codex' | 'claude';
  price?: string;
}

export interface LevelOption {
  id: string;
  label: string;
  note: string;
}

export interface Thread {
  id: string;
  topic: string;
  title: string;
  modelId?: string;
  level?: string;
  createdAt: string;
  updatedAt: string;
  sections: Section[];
  steering: { afterSection: number; instruction: string; at: string }[];
  position: { section: number; time: number };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => req<{ ok: boolean }>('/api/me'),
  login: (code: string) =>
    req<{ ok: boolean }>('/api/login', { method: 'POST', body: JSON.stringify({ code }) }),
  models: () => req<ModelOption[]>('/api/models'),
  levels: () => req<LevelOption[]>('/api/levels'),
  suggestions: () =>
    req<{ topics: string[]; from: 'library' | 'starters' }>('/api/suggestions'),
  threads: () => req<Thread[]>('/api/threads'),
  thread: (id: string) => req<Thread>(`/api/threads/${id}`),
  createThread: (topic: string, modelId: string, level: string) =>
    req<Thread>('/api/threads', {
      method: 'POST',
      body: JSON.stringify({ topic, modelId, level }),
    }),
  deleteThread: (id: string) => req<{ ok: boolean }>(`/api/threads/${id}`, { method: 'DELETE' }),
  prepare: (id: string, idx: number) =>
    req<Section>(`/api/threads/${id}/sections/${idx}/prepare`, { method: 'POST' }),
  renameSection: (id: string, idx: number, title: string) =>
    req<Section>(`/api/threads/${id}/sections/${idx}/title`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  audioUrl: (id: string, idx: number) => `/api/threads/${id}/sections/${idx}/audio`,
  savePosition: (id: string, section: number, time: number) =>
    req<{ ok: boolean }>(`/api/threads/${id}/position`, {
      method: 'POST',
      body: JSON.stringify({ section, time }),
    }),
  steer: (id: string, instruction: string) =>
    req<Thread>(`/api/threads/${id}/steer`, {
      method: 'POST',
      body: JSON.stringify({ instruction }),
    }),
};

export function beaconPosition(id: string, section: number, time: number) {
  navigator.sendBeacon?.(
    `/api/threads/${id}/position`,
    new Blob([JSON.stringify({ section, time })], { type: 'application/json' }),
  );
}
