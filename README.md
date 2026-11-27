# Rablás Heti Top – Netlify változat

Mindenki látja a heti toplistát, és **bárki rögzíthet új rablást**, de **törölni csak te tudsz** (jelszóval, admin módban). Az adatok a Netlify saját tárhelyén (Netlify Blobs) tárolódnak, így minden eszközön ugyanaz a lista látszik.

## Hogyan működik

- **Bárki:** megnyitja az oldalt, látja a listát és a statisztikákat, és az űrlappal jelszó nélkül rögzíthet új rablást. Az oldal 30 másodpercenként magától frissül.
- **Te (admin):** a jobb felső **Admin belépés** gombbal belépsz a jelszavaddal. Ekkor megjelenik a kártyákon a törlés gomb és az **Új hét (lista nullázása)** gomb.
- **Biztonság:** a jelszót a szerver ellenőrzi (`ADMIN_PASSWORD` környezeti változó), nem szerepel a weboldal kódjában. A szerver minden beküldött adatot újra ellenőriz (csak a listában szereplő helyszín, név és érvényes összeg fogadható el), törlést pedig jelszó nélkül nem fogad el.

## Kitelepítés Netlify-ra (GitHubról)

1. Hozz létre egy új GitHub tárolót (repository), és töltsd fel bele ennek a mappának a tartalmát (a `node_modules` mappát ne).
2. Netlify: **Add new project → Import an existing project**, válaszd ki a GitHub tárolót. A beállításokat a `netlify.toml` már tartalmazza, nem kell semmit átírni.
3. Mielőtt a Netlify az első kitelepítést befejezné (vagy utána), add meg a jelszót: **Project configuration → Environment variables → Add a variable**
   - Kulcs: `ADMIN_PASSWORD`
   - Érték: egy hosszú, egyedi jelszó
4. Ha a változót a kitelepítés után adtad meg, indíts új kitelepítést (**Deploys → Trigger deploy**), mert a függvény csak ekkor veszi át az új értéket.
5. Nyisd meg az oldal címét, kattints az **Admin belépés** gombra, és próbáld ki.

## Kitelepítés parancssorból (GitHub nélkül)

```bash
npm install
npm install -g netlify-cli
netlify login
netlify init            # új projekt létrehozása
netlify env:set ADMIN_PASSWORD "ide-jon-a-jelszo"
netlify deploy --prod
```

A sima „behúzós” feltöltés **nem** jó ehhez, mert a szerveroldali függvényt nem kezeli.

## Helyi kipróbálás

```bash
npm install
cp .env.example .env    # írd át a jelszót a .env fájlban
npx netlify dev
```

## Tesztek

```bash
npm test
```

Ez lefuttatja az API-teszteket és az oldal szimulált böngészős tesztjét (hamis tárolóval, tehát nem ér hozzá az éles adatokhoz).

## Névsor és helyszínek módosítása

A `netlify/lib/constants.mjs` fájlban találod a helyszínek és a nevek listáját. Csak itt kell átírni, az oldal innen kapja őket. Új helyszínhez ikont a `public/index.html` fájl `TARGET_META` részében adhatsz meg, de nélküle is működik (alapértelmezett ikont kap).

## Fontos tudnivalók

- Az admin belépés a böngésző lapjához kötött (`sessionStorage`), a lap bezárásakor megszűnik.
- A jelszótippelést a szerver minden hibás próbánál fél másodperccel lassítja, de más korlátozás nincs, ezért válassz hosszú jelszót.
- A törlés és a lista nullázása végleges, nincs visszavonás.
