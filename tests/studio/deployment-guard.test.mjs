import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source = await readFile(new URL('../../apps/studio/src/lib/server-guard.ts', import.meta.url), 'utf8');
const { guard } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source.replace('import "server-only";', ''))).toString('base64'));
const keys = ['STUDIO_ACCESS_TOKEN', 'STUDIO_AUTH_MODE', 'VERCEL', 'VERCEL_PROJECT_ID', 'STUDIO_PROTECTED_PROJECT_ID', 'STUDIO_ALLOWED_ORIGIN', 'VERCEL_ENV', 'VERCEL_URL'];
const base = { STUDIO_AUTH_MODE: 'vercel-protection', VERCEL: '1', VERCEL_PROJECT_ID: 'project-a', STUDIO_PROTECTED_PROJECT_ID: 'project-a', STUDIO_ALLOWED_ORIGIN: 'https://studio.example' };
function check(env, url = 'https://studio.example/api/capabilities', headers = {}) {
  const original = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, env);
    return guard(new Request(url, { headers }));
  } finally {
    for (const k of keys) { if (original[k] === undefined) delete process.env[k]; else process.env[k] = original[k]; }
  }
}
test('remote access is closed by default', () => assert.equal(check({}).status, 403));
test('protected exact project and origin are accepted', () => assert.equal(check(base), null));
test('cannot opt in outside Vercel', () => assert.equal(check({ ...base, VERCEL: '0' }).status, 403));
test('different project stays closed', () => assert.equal(check({ ...base, VERCEL_PROJECT_ID: 'other' }).status, 403));
test('missing project does not match missing project', () => assert.equal(check({ STUDIO_AUTH_MODE: 'vercel-protection', VERCEL: '1', STUDIO_ALLOWED_ORIGIN: 'https://studio.example' }).status, 403));
test('other origin stays closed', () => assert.equal(check(base, 'https://other.example/api/capabilities').status, 403));
test('cross origin request stays closed', () => assert.equal(check(base, undefined, { origin: 'https://evil.example' }).status, 403));
test('cross site request stays closed', () => assert.equal(check(base, undefined, { 'sec-fetch-site': 'cross-site' }).status, 403));
test('spoofed forwarded host grants no access', () => assert.equal(check({}, undefined, { 'x-forwarded-host': 'localhost' }).status, 403));
test('token still takes precedence over platform mode', () => assert.equal(check({ ...base, STUDIO_ACCESS_TOKEN: 'test-only' }).status, 401));
test('valid explicit token still works', () => assert.equal(check({ STUDIO_ACCESS_TOKEN: 'test-only' }, undefined, { authorization: 'Bearer test-only' }), null));
test('local development still works', () => assert.equal(check({}, 'http://127.0.0.1:3000/api/capabilities'), null));

const preview={...base,VERCEL_ENV:'preview',VERCEL_URL:'studio-preview-hash-team.vercel.app'};
test('protected Preview accepts its exact platform deployment URL without changing production origin',()=>assert.equal(check(preview,'https://studio-preview-hash-team.vercel.app/api/capabilities'),null));
test('Preview URL does not allow another deployment',()=>assert.equal(check(preview,'https://another-preview.vercel.app/api/capabilities').status,403));
test('platform Preview URL cannot authorize production',()=>assert.equal(check({...preview,VERCEL_ENV:'production'},'https://studio-preview-hash-team.vercel.app/api/capabilities').status,403));
test('Preview URL still requires platform protection opt-in and exact project',()=>{for(const env of [{...preview,STUDIO_AUTH_MODE:''},{...preview,VERCEL_PROJECT_ID:'different'},{...preview,VERCEL:'0'}])assert.equal(check(env,'https://studio-preview-hash-team.vercel.app/api/capabilities').status,403);});
test('Preview still denies cross-site requests and respects explicit tokens',()=>{assert.equal(check(preview,'https://studio-preview-hash-team.vercel.app/api/capabilities',{origin:'https://evil.example'}).status,403);assert.equal(check({...preview,STUDIO_ACCESS_TOKEN:'test-only'},'https://studio-preview-hash-team.vercel.app/api/capabilities').status,401);});
test('custom or malformed platform URL does not grant access',()=>{for(const host of ['evil.example','studio.vercel.app.evil.example','studio.vercel.app/path'])assert.equal(check({...preview,VERCEL_URL:host},'https://evil.example/api/capabilities').status,403);});
