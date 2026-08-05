/**
 * Model catalog shown in the UI. Two engines: OpenRouter (pay per token) and
 * the codex CLI (flat subscription, mounted into the container together with
 * CODEX_HOME). Deliberately mid-tier — outline/script writing doesn't need
 * frontier models, and the default Flash has proven good enough.
 */
import { config } from './config.js';

export interface ModelOption {
  id: string;
  label: string;
  note: string;
  engine: 'openrouter' | 'codex';
  model: string;
  effort?: string;
}

export const MODELS: ModelOption[] = [
  { id: 'default', label: 'Gemini 2.5 Flash', note: 'fast · default', engine: 'openrouter', model: config.model },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', note: 'newer Flash, stronger', engine: 'openrouter', model: 'google/gemini-3.5-flash' },
  { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6', note: 'strong writing', engine: 'openrouter', model: 'anthropic/claude-sonnet-4.6' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', note: 'cheap, capable', engine: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
  { id: 'codex-sol-low', label: 'Sol · low', note: 'Codex plan', engine: 'codex', model: 'gpt-5.6-sol', effort: 'low' },
  { id: 'codex-sol-medium', label: 'Sol · medium', note: 'Codex plan', engine: 'codex', model: 'gpt-5.6-sol', effort: 'medium' },
  { id: 'codex-terra', label: 'Terra', note: 'Codex plan', engine: 'codex', model: 'gpt-5.6-terra', effort: 'medium' },
  { id: 'codex-luna', label: 'Luna', note: 'Codex plan', engine: 'codex', model: 'gpt-5.6-luna', effort: 'medium' },
];

export function resolveModel(id?: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}
