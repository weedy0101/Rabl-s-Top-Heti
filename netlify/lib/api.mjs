import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { ALLOWED_TARGETS, CREW_NAMES, MAX_AMOUNT, SOLO_LABEL } from './constants.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const sha256 = (value) => createHash('sha256').update(String(value)).digest();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getBearerToken(req) {
  const header = req.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

/**
 * Admin ellenőrzés a szerveren. Siker esetén null-t ad vissza,
 * hiba esetén a kész hibaválaszt.
 */
async function requireAdmin(req, adminPassword) {
  if (!adminPassword) {
    return json({ error: 'A szerveren nincs beállítva az ADMIN_PASSWORD környezeti változó.' }, 503);
  }
  const ok = timingSafeEqual(sha256(getBearerToken(req)), sha256(adminPassword));
  if (!ok) {
    await sleep(500); // lassítja a jelszótippelést
    return json({ error: 'Hibás jelszó.' }, 401);
  }
  return null;
}

async function readJsonBody(req) {
  const text = await req.text();
  if (text.length > 20000) throw new Error('too-large');
  return JSON.parse(text);
}

function formatBudapestDate(date = new Date()) {
  return date.toLocaleDateString('hu-HU', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Beküldött rablás ellenőrzése. Hiba esetén szöveget ad vissza, siker esetén null-t.
 */
function validateHeistInput(body) {
  if (!body || typeof body !== 'object') return 'Hibás kérés.';

  if (!ALLOWED_TARGETS.includes(body.target)) {
    return 'Érvénytelen rablási helyszín.';
  }

  if (!Number.isInteger(body.amount) || body.amount < 1 || body.amount > MAX_AMOUNT) {
    return 'Az összegnek 1 és 999 999 999 közötti egész számnak kell lennie.';
  }

  if (body.solo !== true) {
    const crew = body.crew;
    if (!Array.isArray(crew) || crew.length === 0) {
      return 'Legalább egy társat meg kell adni, vagy az Egyedül opciót kell választani.';
    }
    if (new Set(crew).size !== crew.length) {
      return 'Egy név csak egyszer szerepelhet.';
    }
    if (!crew.every((name) => typeof name === 'string' && CREW_NAMES.includes(name))) {
      return 'Ismeretlen név a társak között.';
    }
  }
  return null;
}

function sortHeists(list) {
  return list.sort(
    (a, b) => b.amount - a.amount || String(a.createdAt).localeCompare(String(b.createdAt))
  );
}

async function readAllHeists(store) {
  const { blobs } = await store.list();
  const items = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));
  return sortHeists(items.filter(Boolean));
}

/**
 * A teljes API logikája. A `store` a Netlify Blobs tároló (vagy teszteléskor egy hamis),
 * az `adminPassword` pedig a környezeti változóból érkezik.
 */
export async function handleRequest(req, { store, adminPassword }) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = req.method.toUpperCase();

  try {
    // --- Belépés ellenőrzése ---
    if (path === '/api/login') {
      if (method !== 'POST') return json({ error: 'Nem engedélyezett metódus.' }, 405);
      const denied = await requireAdmin(req, adminPassword);
      return denied || json({ ok: true });
    }

    // --- Lista és hozzáadás (nyilvános), teljes nullázás (csak admin) ---
    if (path === '/api/heists') {
      if (method === 'GET') {
        const heists = await readAllHeists(store);
        return json({
          heists,
          config: {
            targets: ALLOWED_TARGETS,
            crew: CREW_NAMES,
            maxAmount: MAX_AMOUNT,
            soloLabel: SOLO_LABEL,
          },
        });
      }

      // Új rablást bárki rögzíthet, jelszó nélkül. A szerver minden adatot ellenőriz.
      if (method === 'POST') {
        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          return json({ error: 'Hibás kérés.' }, 400);
        }

        const problem = validateHeistInput(body);
        if (problem) return json({ error: problem }, 400);

        const now = new Date();
        const heist = {
          id: `${now.getTime().toString(36)}-${randomBytes(4).toString('hex')}`,
          target: body.target,
          amount: body.amount,
          crew: body.solo === true ? SOLO_LABEL : body.crew.join(', '),
          date: formatBudapestDate(now),
          createdAt: now.toISOString(),
        };
        await store.setJSON(heist.id, heist);
        return json({ heist }, 201);
      }

      if (method === 'DELETE') {
        const denied = await requireAdmin(req, adminPassword);
        if (denied) return denied;

        const { blobs } = await store.list();
        await Promise.all(blobs.map((blob) => store.delete(blob.key)));
        return json({ ok: true, deleted: blobs.length });
      }

      return json({ error: 'Nem engedélyezett metódus.' }, 405);
    }

    // --- Egy rablás törlése ---
    const match = path.match(/^\/api\/heists\/([A-Za-z0-9_-]{1,64})$/);
    if (match) {
      if (method !== 'DELETE') return json({ error: 'Nem engedélyezett metódus.' }, 405);
      const denied = await requireAdmin(req, adminPassword);
      if (denied) return denied;

      await store.delete(match[1]);
      return json({ ok: true });
    }

    return json({ error: 'Nem található.' }, 404);
  } catch (err) {
    console.error('API hiba:', err);
    return json({ error: 'Szerverhiba történt. Próbáld újra később.' }, 500);
  }
}
