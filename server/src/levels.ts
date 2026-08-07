/**
 * Listener-familiarity levels. The label/note pair renders in the UI picker;
 * the prompt is injected verbatim into outline, script, and replan calls.
 */
export interface LevelOption {
  id: string;
  label: string;
  note: string;
  prompt: string;
}

export const LEVELS: LevelOption[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    note: 'completely new to this — everyday words, analogies, nothing assumed',
    prompt:
      'The listener is completely new to this topic. Use everyday language and vivid analogies, define every term the moment it first appears, and build up from first principles — never assume prior knowledge.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    note: 'curious adult — jargon gets a quick explanation as it appears',
    prompt:
      'Assume a curious adult with no special background; explain jargon briefly the moment it appears.',
  },
  {
    id: 'informed',
    label: 'Informed',
    note: 'knows the basics — skip the 101, go deeper',
    prompt:
      'The listener already knows the basics of this topic. Skip introductory definitions, move quickly past fundamentals, and spend the time on mechanisms, nuance, and second-order effects.',
  },
  {
    id: 'expert',
    label: 'Expert',
    note: 'works in or around the field — technical depth, edge cases, open questions',
    prompt:
      'The listener is deeply familiar with this field. Use precise technical vocabulary freely and focus on advanced material, edge cases, open questions, and current debates — no basic explanations.',
  },
];

export function resolveLevel(id?: string): LevelOption {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[1];
}
