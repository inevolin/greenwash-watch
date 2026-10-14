// Smoke test: node test.js (server must be running in mock mode on PORT or 3000)
const base = `http://localhost:${process.env.PORT || 3000}`;
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('PASS', m); };
(async () => {
  const h = await (await fetch(base + '/api/health')).json(); ok(h.ok, 'health ' + h.mode);
  const cases = await (await fetch(base + '/api/cases')).json(); ok(cases.length === 10, '10 cases');
  ok(new Set(cases.map((c) => c.industry)).size === 8, '8 industries');
  const html = await (await fetch(base + '/')).text(); ok(html.includes('Greenwash Watch'), 'index served');
  for (const f of ['/styles.css', '/app.js']) ok((await fetch(base + f)).status === 200, f);
  ok((await fetch(base + '/api/research', { method: 'POST', body: '{}' })).status === 400, 'empty brand rejected');
  const { jobId } = await (await fetch(base + '/api/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand: 'Persil' }) })).json();
  let j; for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 500)); j = await (await fetch(base + '/api/research/' + jobId)).json(); if (j.status !== 'running') break; }
  ok(j.status === 'done' && j.report.example_data && j.report.claims.length, 'mock research returns labelled example report');
})();
