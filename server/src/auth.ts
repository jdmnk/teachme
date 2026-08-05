/**
 * Single shared access code → HMAC-derived session cookie. This app fronts
 * paid LLM/TTS keys on a public VPS, so every /api route and all audio is
 * behind the gate; there is exactly one user, so no accounts.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

const COOKIE = 'tm_auth';

function token(): string {
  return createHmac('sha256', 'teachme-cookie-v1').update(config.accessCode).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function cookieValue(req: Request): string {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return '';
}

export function isAuthed(req: Request): boolean {
  return safeEqual(cookieValue(req), token());
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'unauthorized' });
}

export function login(req: Request, res: Response) {
  const code = String(req.body?.code ?? '');
  if (!code || !safeEqual(code, config.accessCode)) {
    return res.status(401).json({ error: 'wrong code' });
  }
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
  );
  res.json({ ok: true });
}
