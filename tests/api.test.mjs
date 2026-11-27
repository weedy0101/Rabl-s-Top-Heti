import assert from 'node:assert/strict';
import { handleRequest } from '../netlify/lib/api.mjs';
import { createFakeStore } from './fake-store.mjs';

const PW = 'titkos-jelszo-123';
const store = createFakeStore();
const call = (path, { method = 'GET', body, pw, password = PW } = {}) =>
  handleRequest(
    new Request('http://localhost' + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(pw !== undefined ? { authorization: 'Bearer ' + pw } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    { store, adminPassword: password }
  );
const jsonOf = (res) => res.json();

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log('  ok  ' + name);
};

await test('üres lista nyilvánosan olvasható, config is jön', async () => {
  const res = await call('/api/heists');
  assert.equal(res.status, 200);
  const data = await jsonOf(res);
  assert.deepEqual(data.heists, []);
  assert.equal(data.config.targets.length, 7);
  assert.equal(data.config.crew.length, 35);
});

await test('jelszó nélkül nem lehet írni (401)', async () => {
  const res = await call('/api/heists', { method: 'POST', body: { target: 'Dara Bolt', amount: 1000, solo: true } });
  assert.equal(res.status, 401);
  assert.equal(store._size(), 0);
});

await test('rossz jelszóval nem lehet írni (401)', async () => {
  const res = await call('/api/heists', { method: 'POST', pw: 'rossz', body: { target: 'Dara Bolt', amount: 1000, solo: true } });
  assert.equal(res.status, 401);
  assert.equal(store._size(), 0);
});

await test('login: jó jelszó 200, rossz 401, GET nem engedett', async () => {
  assert.equal((await call('/api/login', { method: 'POST', pw: PW })).status, 200);
  assert.equal((await call('/api/login', { method: 'POST', pw: 'x' })).status, 401);
  assert.equal((await call('/api/login', { method: 'POST' })).status, 401);
  assert.equal((await call('/api/login')).status, 405);
});

await test('ADMIN_PASSWORD nélkül minden admin művelet 503', async () => {
  const res = await call('/api/login', { method: 'POST', pw: '', password: null });
  assert.equal(res.status, 503);
  const res2 = await call('/api/heists', { method: 'POST', pw: '', password: '', body: { target: 'Dara Bolt', amount: 1, solo: true } });
  assert.equal(res2.status, 503);
});

await test('érvényes rablás rögzítése (társakkal és szólóban)', async () => {
  const a = await call('/api/heists', { method: 'POST', pw: PW, body: { target: 'Állami Bank', amount: 1250000, solo: false, crew: ['ALFA', 'Bence'] } });
  assert.equal(a.status, 201);
  const heistA = (await jsonOf(a)).heist;
  assert.equal(heistA.crew, 'ALFA, Bence');
  assert.match(heistA.date, /^\d{4}\. \d{2}\. \d{2}\.$/);

  const b = await call('/api/heists', { method: 'POST', pw: PW, body: { target: 'Dara Bolt', amount: 5000000, solo: true, crew: [] } });
  assert.equal(b.status, 201);
  assert.equal((await jsonOf(b)).heist.crew, 'Egyedül');
});

await test('lista összeg szerint csökkenő, nyilvánosan', async () => {
  const data = await jsonOf(await call('/api/heists'));
  assert.deepEqual(data.heists.map((h) => h.amount), [5000000, 1250000]);
});

await test('érvénytelen bemenetek elutasítva (400)', async () => {
  const bad = [
    { target: 'Ismeretlen', amount: 1000, solo: true },
    { target: 'Dara Bolt', amount: 0, solo: true },
    { target: 'Dara Bolt', amount: -5, solo: true },
    { target: 'Dara Bolt', amount: 1.5, solo: true },
    { target: 'Dara Bolt', amount: '1000', solo: true },
    { target: 'Dara Bolt', amount: 1000000000, solo: true },
    { target: 'Dara Bolt', amount: 1000, solo: false, crew: [] },
    { target: 'Dara Bolt', amount: 1000, solo: false },
    { target: 'Dara Bolt', amount: 1000, solo: false, crew: ['Nemlétező'] },
    { target: 'Dara Bolt', amount: 1000, solo: false, crew: ['ALFA', 'ALFA'] },
    { target: 'Dara Bolt', amount: 1000, solo: false, crew: '<script>' },
  ];
  for (const body of bad) {
    const res = await call('/api/heists', { method: 'POST', pw: PW, body });
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(store._size(), 2);
});

await test('hibás JSON törzs 400', async () => {
  const res = await handleRequest(
    new Request('http://localhost/api/heists', { method: 'POST', headers: { authorization: 'Bearer ' + PW }, body: '{nem json' }),
    { store, adminPassword: PW }
  );
  assert.equal(res.status, 400);
});

await test('törlés csak jelszóval, egy elem törlődik', async () => {
  const list = (await jsonOf(await call('/api/heists'))).heists;
  const id = list[0].id;
  assert.equal((await call('/api/heists/' + id, { method: 'DELETE' })).status, 401);
  assert.equal(store._size(), 2);
  assert.equal((await call('/api/heists/' + id, { method: 'DELETE', pw: PW })).status, 200);
  assert.equal(store._size(), 1);
});

await test('útvonal-bejárás és ismeretlen útvonal nem megy át', async () => {
  assert.equal((await call('/api/heists/../x', { method: 'DELETE', pw: PW })).status, 404);
  assert.equal((await call('/api/nincs')).status, 404);
  assert.equal((await call('/api/heists/valami', { method: 'GET' })).status, 405);
});

await test('nullázás csak jelszóval', async () => {
  assert.equal((await call('/api/heists', { method: 'DELETE' })).status, 401);
  assert.equal(store._size(), 1);
  const res = await call('/api/heists', { method: 'DELETE', pw: PW });
  assert.equal(res.status, 200);
  assert.equal((await jsonOf(res)).deleted, 1);
  assert.equal(store._size(), 0);
});

console.log(`\nAPI tesztek: ${passed} sikeres`);
