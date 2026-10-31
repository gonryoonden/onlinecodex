#!/usr/bin/env node
// Temporary HTTPS tunnel origin. No credentials in URLs or logs.
import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const digest = value => createHash('sha256').update(value).digest();
export function privateProxy({ username, password, port = 3000 }) {
  if (!username || username.includes(':') || !password || password.length < 16)
    throw new Error('A username and password of at least 16 characters are required.');
  const expected = digest(`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
  return http.createServer((req, res) => {
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    if (!timingSafeEqual(digest(req.headers.authorization ?? ''), expected)) {
      res.writeHead(401, { ...headers, 'WWW-Authenticate': 'Basic realm="Personal Magic Studio", charset="UTF-8"' });
      res.end('개인용 Studio입니다. 사용자 이름과 비밀번호를 입력하세요.');
      return;
    }
    const host = req.headers.host;
    let badOrigin = false;
    if (req.headers.origin) {
      try { badOrigin = new URL(req.headers.origin).host !== host; }
      catch { badOrigin = true; }
    }
    if (badOrigin || req.headers['sec-fetch-site'] === 'cross-site' || !req.url?.startsWith('/') || req.url.startsWith('//')) {
      res.writeHead(403, headers); res.end('교차 사이트 요청은 허용하지 않습니다.'); return;
    }
    const forwarded = { ...req.headers, host: `127.0.0.1:${port}` };
    for (const key of Object.keys(forwarded)) {
      if (key === 'authorization' || key.startsWith('x-forwarded-') || key === 'forwarded') delete forwarded[key];
    }
    if (req.headers.origin) forwarded.origin = `http://127.0.0.1:${port}`;
    const upstream = http.request({ hostname: '127.0.0.1', port, method: req.method, path: req.url, headers: forwarded }, response => {
      res.writeHead(response.statusCode ?? 502, { ...response.headers, ...headers });
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    upstream.setTimeout(190000, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, headers); res.end('앱 연결이 중단되었습니다.'); });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.env.STUDIO_PREVIEW_CREDENTIAL_FILE;
  if (!file) throw new Error('Set STUDIO_PREVIEW_CREDENTIAL_FILE to a private JSON file.');
  const credentials = JSON.parse(readFileSync(file, 'utf8'));
  const server = privateProxy(credentials);
  server.listen(3100, '127.0.0.1', () => console.log('Authenticated tunnel origin ready on 127.0.0.1:3100'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit()));
}
