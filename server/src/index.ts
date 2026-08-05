import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { assertConfig, config } from './config.js';
import { isAuthed, login, requireAuth } from './auth.js';
import { threads } from './threads.js';
import { modelsWithPrices } from './models.js';

assertConfig();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.post('/api/login', login);
app.get('/api/me', (req, res) => {
  if (isAuthed(req)) return res.json({ ok: true });
  res.status(401).json({ error: 'unauthorized' });
});
app.get('/api/models', requireAuth, (_req, res, next) => {
  modelsWithPrices().then((m) => res.json(m), next);
});
app.use('/api/threads', requireAuth, threads);

// express 4 sync error handling misses async throws; routes that can throw
// (LLM calls) are wrapped here so the client gets JSON, not a hang
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('unhandled:', err);
  if (!res.headersSent) res.status(500).json({ error: err.message });
});

if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(config.webDist, 'index.html'));
  });
}

app.listen(config.port, config.host, () => {
  console.log(`teachme listening on ${config.host}:${config.port}`);
});
