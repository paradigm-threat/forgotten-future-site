#!/usr/bin/env node
/**
 * Smoke: legacy API routes must not proxy (404/410).
 * Usage: BASE_URL=http://localhost:3000 node scripts/verify-zero-api.mjs
 */
const base = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const checks = [
  { path: '/api/image?path=/media/teaser/ff-title.png&w=100', expect: [404] },
  { path: '/api/browser/', expect: [404] },
  { path: '/api/manuscript/?edition=13plus', expect: [404] },
  { path: '/api/versions?repo=ff-story', expect: [404] },
  { path: '/api/tts/piper/voices', expect: [410] },
  { path: '/api/comments/submit', method: 'POST', expect: [410], body: '{}' },
];

let failed = 0;

for (const c of checks) {
  const url = `${base}${c.path}`;
  const res = await fetch(url, {
    method: c.method || 'GET',
    headers: c.body ? { 'Content-Type': 'application/json' } : undefined,
    body: c.body,
  });
  if (!c.expect.includes(res.status)) {
    console.error(`FAIL ${c.path}: got ${res.status}, want ${c.expect.join('|')}`);
    failed++;
  } else {
    console.log(`OK ${c.path} → ${res.status}`);
  }
}

if (failed > 0) process.exit(1);
console.log('verify-zero-api: all checks passed');
