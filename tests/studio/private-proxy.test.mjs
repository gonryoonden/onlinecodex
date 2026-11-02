import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { privateProxy } from '../../scripts/studio-private-proxy.mjs';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
test('all routes require authentication; accepted requests preserve body and check CSRF', async () => {
  let count = 0;
  const upstream = http.createServer((req,res) => {
    count++; let body=''; req.on('data', chunk => body+=chunk);
    req.on('end', () => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({body, headers:req.headers})); });
  });
  const upstreamPort = await listen(upstream);
  const proxy = privateProxy({username:'studio',password:'synthetic-test-password',port:upstreamPort});
  const port = await listen(proxy); const url=`http://127.0.0.1:${port}`;
  const authorization=`Basic ${Buffer.from('studio:synthetic-test-password').toString('base64')}`;
  try {
    for (const path of ['/', '/api/capabilities', '/api/ai/magic-layers', '/api/export/pptx']) {
      const res=await fetch(url+path); assert.equal(res.status,401); await res.text();
    }
    assert.equal(count,0);
    let res=await fetch(url,{headers:{authorization:'Basic wrong'}});assert.equal(res.status,401);await res.text();
    res=await fetch(url+'/api/ai/magic-layers',{method:'POST',headers:{authorization,origin:'https://attacker.example'},body:'blocked'});
    assert.equal(res.status,403);await res.text();assert.equal(count,0);
    res=await fetch(url+'/api/test',{method:'POST',headers:{authorization,origin:url,'x-forwarded-host':'attacker.example'},body:'한글 데이터'});
    assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');
    const json=await res.json();assert.equal(json.body,'한글 데이터');assert.equal(json.headers.authorization,undefined);assert.equal(json.headers['x-forwarded-host'],undefined);assert.equal(json.headers.origin,`http://127.0.0.1:${upstreamPort}`);
  } finally { proxy.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>upstream.close(r))]); }
});
test('empty or weak credentials fail closed',()=>{
 assert.throws(()=>privateProxy({username:'studio',password:''}));
 assert.throws(()=>privateProxy({username:'studio',password:'short'}));
});
