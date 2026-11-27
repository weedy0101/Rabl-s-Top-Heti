// A teljes oldal kipróbálása szimulált böngészőben; a fetch a valódi API-logikát hívja hamis tárolóval.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { handleRequest } from '../netlify/lib/api.mjs';
import { createFakeStore } from './fake-store.mjs';

const PW = 'titkos-jelszo-123';
const store = createFakeStore();

let html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
html = html.replace(/<script src="https:[^>]*><\/script>/g, '').replace(/<link[^>]*>/g, '');
html = html.replace(/<script>\s*tailwind\.config[\s\S]*?<\/script>/, '');

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.addEventListener('error', (e) => errors.push(e.message));
    w.fetch = (url, opts = {}) => {
      const { cache, ...rest } = opts;
      return handleRequest(new Request(new URL(url, 'http://localhost').href, rest), { store, adminPassword: PW });
    };
    w.confirm = () => true;
  },
});
const w = dom.window;
const d = w.document;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const input = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const hidden = (id) => d.getElementById(id).classList.contains('hidden');
const cards = () => [...d.querySelectorAll('#leaderboard-list article')];
let passed = 0;
const ok = (name) => { passed++; console.log('  ok  ' + name); };

await sleep(400);

// 1. Nézőként
assert.ok(!hidden('form-section'), 'az űrlap mindenkinek látszik');
assert.equal(d.querySelectorAll('[data-delete-id]').length, 0);
assert.ok(hidden('reset-btn'), 'nullázás gomb rejtett nézőknek');
assert.ok(hidden('loading-state'));
assert.ok(!hidden('empty-state'), 'üres állapot látszik');
assert.equal(d.querySelectorAll('.target-btn').length, 7);
assert.equal(d.querySelectorAll('#crew-options-list button').length, 35);
ok('néző: az űrlap látszik, törlés nincs');

// 1b. Nézőként rögzít egy rablást
const submitForm = () => d.getElementById('heist-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
click(d.querySelector('[data-target="Fleeca Bank"]'));
input(d.getElementById('amount-input'), '700');
click(d.getElementById('solo-option-btn'));
submitForm();
await sleep(300);
assert.equal(cards().length, 1);
assert.equal(d.querySelectorAll('[data-delete-id]').length, 0, 'nézőnek nincs törlés gomb');
assert.equal(store._size(), 1);
ok('néző: jelszó nélkül rögzíthet rablást');

// 2. Rossz jelszó
click(d.getElementById('admin-toggle'));
assert.ok(!hidden('login-modal'));
d.getElementById('login-password').value = 'rossz';
d.getElementById('login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await sleep(800);
assert.ok(hidden('reset-btn'));
assert.ok(!d.getElementById('login-error').classList.contains('hidden'));
assert.equal(d.getElementById('login-error-text').textContent, 'Hibás jelszó.');
ok('rossz jelszó: nem lép be, hibaüzenet');

// 3. Jó jelszó
d.getElementById('login-password').value = PW;
d.getElementById('login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await sleep(200);
assert.ok(!hidden('reset-btn'), 'nullázás gomb megjelenik');
assert.ok(hidden('login-modal'));
assert.equal(d.querySelectorAll('[data-delete-id]').length, 1, 'adminnak van törlés gomb');
assert.equal(d.getElementById('admin-toggle-label').textContent, 'Kilépés');
ok('jó jelszó: admin mód, törlés gombok megjelennek');

// 4. Üres űrlap -> hiba
const submit = () => d.getElementById('heist-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
submit();
assert.match(d.getElementById('form-error-text').textContent, /helyszínt/);
ok('üres űrlap: kliensoldali hiba');

// 5. Két rablás felvétele
click(d.querySelector('[data-target="Állami Bank"]'));
input(d.getElementById('amount-input'), '1250000abc');
assert.equal(d.getElementById('amount-input').value, '1 250 000');
click(d.getElementById('solo-option-btn'));
submit();
await sleep(300);
click(d.querySelector('[data-target="Dara Bolt"]'));
input(d.getElementById('amount-input'), '5000000');
click(d.querySelector('#crew-options-list button'));
click(d.querySelectorAll('#crew-options-list button')[1]);
submit();
await sleep(300);

assert.equal(cards().length, 3);
assert.match(cards()[0].textContent, /Dara Bolt[\s\S]*\$5 000 000/);
assert.match(cards()[1].textContent, /Állami Bank[\s\S]*Egyedül[\s\S]*\$1 250 000/);
assert.equal(d.getElementById('stat-total-amount').textContent.trim(), '$6 250 700');
assert.equal(d.getElementById('stat-total-count').textContent.trim(), '3 db');
assert.equal(d.getElementById('stat-top-amount').textContent.trim(), '$5 000 000');
assert.equal(d.querySelectorAll('[data-delete-id]').length, 3, 'adminnak van törlés gomb');
assert.equal(d.getElementById('amount-input').value, '', 'az űrlap kiürült');
ok('két rablás rögzítve, rangsor és statisztika helyes');

// 6. Törlés
click(d.querySelector('[data-delete-id]'));
await sleep(300);
assert.equal(cards().length, 2);
assert.equal(store._size(), 2);
ok('admin törölhet egy rablást');

// 7. Kilépés után nincs törlés gomb, az űrlap rejtett, a lista marad
click(d.getElementById('admin-toggle'));
assert.ok(!hidden('form-section'));
assert.ok(hidden('reset-btn'));
assert.equal(d.querySelectorAll('[data-delete-id]').length, 0);
assert.equal(cards().length, 2);
assert.equal(w.sessionStorage.getItem('rablas_admin_pw'), null);
ok('kilépés: törlés gombok eltűnnek');

// 8. Munkamenet visszaállítása újratöltés után
w.sessionStorage.setItem('rablas_admin_pw', PW);
const dom2 = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.fetch = (url, opts = {}) => {
      const { cache, ...rest } = opts;
      return handleRequest(new Request(new URL(url, 'http://localhost').href, rest), { store, adminPassword: PW });
    };
    win.sessionStorage.setItem('rablas_admin_pw', PW);
  },
});
await sleep(500);
assert.ok(!dom2.window.document.getElementById('reset-btn').classList.contains('hidden'));
ok('mentett belépés visszaáll újratöltéskor');

// 9. Törlés lejárt/rossz jelszóval -> kilépteti
click(d.getElementById('admin-toggle'));
d.getElementById('login-password').value = PW;
d.getElementById('login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await sleep(200);
assert.ok(!hidden('reset-btn'));
click(d.getElementById('reset-btn'));
await sleep(300);
assert.equal(cards().length, 0);
assert.ok(!hidden('empty-state'));
assert.equal(store._size(), 0);
ok('új hét: lista nullázva, üres állapot látszik');

// 10. XSS: a tárolt rosszindulatú szöveg nem fut le
await store.setJSON('x', { id: 'x', target: 'Dara Bolt', amount: 10, crew: '<img src=x onerror="window.__xss=1">', date: '2026. 11. 27.', createdAt: new Date().toISOString() });
w.dispatchEvent(new w.Event('focus'));
click(d.getElementById('admin-toggle')); // kilép
click(d.getElementById('admin-toggle')); // belépés ablak
d.getElementById('login-modal').click();
await sleep(50);
// kézi frissítés a lapon belüli függvénnyel
await w.loadHeists();
await sleep(100);
assert.equal(w.__xss, undefined);
assert.equal(d.querySelectorAll('#leaderboard-list img').length, 0);
ok('XSS ellen védett a megjelenítés');

assert.deepEqual(errors, [], 'nincs JS hiba');
console.log(`\nUI tesztek: ${passed} sikeres, JS hibák: ${errors.length}`);
process.exit(0);
