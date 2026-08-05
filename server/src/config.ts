import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3200),
  dataDir: process.env.DATA_DIR || path.join(root, 'data'),
  webDist: process.env.WEB_DIST || path.join(root, 'web/dist'),
  accessCode: process.env.ACCESS_CODE || '',
  openrouterKey: process.env.OPENROUTER_API_KEY || '',
  model: process.env.TEACHME_MODEL || 'google/gemini-2.5-flash',
  azureSpeechKey: process.env.AZURE_SPEECH_KEY || '',
  azureSpeechRegion: process.env.AZURE_SPEECH_REGION || '',
  voice: process.env.TEACHME_VOICE || 'en-US-AndrewMultilingualNeural',
};

export function assertConfig() {
  const missing = ['accessCode', 'openrouterKey', 'azureSpeechKey', 'azureSpeechRegion']
    .filter((k) => !(config as Record<string, unknown>)[k]);
  if (missing.length) throw new Error(`missing config: ${missing.join(', ')} (see .env.example)`);
}
