# Clash of Clans Dashboard

Ein vollständig lokal laufendes Dashboard für einen Clash-of-Clans-Account: Live-Daten aus der
offiziellen Spiele-API, ein von Hand gepflegter Bau-Tracker mit Countdown und ein regelbasierter
Angriffsstrategie-Berater.

Es wird nichts in die Cloud geschrieben. Der API-Key bleibt im Backend, das Frontend spricht
ausschließlich mit dem eigenen Express-Server.

---

## Funktionen

| Bereich | Inhalt |
| --- | --- |
| Übersicht | Rathaus-Level, XP, Trophäen (inkl. Bestwert), Liga mit Icon, Clan mit Wappen, Kriegssterne, Spendenverhältnis, Trophäen-Verlaufsdiagramm |
| Truppen | Alle Truppen, Zauber, Helden, Haustiere und Belagerungsmaschinen als Fortschrittsbalken – aktuelles Level gegen das **für das eigene Rathaus erreichbare** Maximum |
| Bau-Tracker | Manuelle Einträge mit Startzeit und Dauer, sekundengenauer Countdown, Fortschrittsbalken, Fertig-Benachrichtigung im UI, Archiv |
| Booster & Tränke | Angewandte Beschleuniger je Aufwertung eintragen (Tränke, Bücher, Hämmer, Uhrturm, Edelstein-Freikauf). Die Restzeit wird daraus exakt neu berechnet, jede Ersparnis einzeln ausgewiesen und einzeln zurücknehmbar |
| Upgrade-Planer | Priorisierte Liste "das als Nächstes ausbauen", Restaufwand getrennt nach Bauarbeiter, Labor und Helden, voraussichtliches Datum fürs nächste Rathaus, Wirkung von Boostern, manuell pflegbarer Gebäudebestand |
| Strategie | 2–3 passende Angriffsstrategien je nach Rathaus-Level und vorhandenen Einheiten, mit Armee-Checkliste, Ablauf, Tipps und eigener Notiz |
| Clan & Krieg | Clan-Profil, Mitgliederliste, aktueller Kriegsstand, Gegner, Restzeit, eigene offene Angriffe |
| Auto-Refresh | Konfigurierbares Intervall (1 min bis 30 min), Ladeindikator, abschaltbar, manueller Refresh leert zusätzlich den Server-Cache |

---

## Voraussetzungen

* Node.js 20 oder neuer (getestet mit Node 26)
* Ein Clash-of-Clans-Account
* Ein API-Key von <https://developer.clashofclans.com/>

---

## Einrichtung

### 1. API-Key erzeugen

1. Auf <https://developer.clashofclans.com/> mit den Supercell-ID-Daten einloggen.
2. Unter **My Account → Create New Key** einen Key anlegen.
3. Als **Allowed IP** die aktuelle öffentliche IP des Laptops eintragen. Die eigene IP steht z. B.
   auf <https://api.ipify.org>.
4. Den erzeugten Token (ein langer JWT) kopieren.

> Der Key ist an die IP gebunden. Nach einem WLAN-Wechsel oder einem Neustart des Routers muss die
> IP im Developer-Portal aktualisiert werden. Das Dashboard erkennt diesen Fall und zeigt eine
> entsprechende Anleitung statt eines Fehlers an.

### 2. Konfiguration anlegen

```bash
cd backend
cp .env.example .env
```

Dann `backend/.env` ausfüllen:

```dotenv
COC_API_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
COC_PLAYER_TAG="#2PP0JCVJL"
COC_CLAN_TAG=
```

**Der Spieler-Tag gehört in Anführungszeichen.** Eine unquotierte Raute leitet in einer
`.env`-Datei einen Kommentar ein, der Wert käme leer an. Diese drei Schreibweisen sind möglich:

| Schreibweise | Ergebnis |
| --- | --- |
| `COC_PLAYER_TAG="#2PP0JCVJL"` | richtig |
| `COC_PLAYER_TAG=2PP0JCVJL` | richtig, die Raute wird ergänzt |
| `COC_PLAYER_TAG=#2PP0JCVJL` | falsch, wird als Kommentar gelesen |

Der API-Key braucht keine Anführungszeichen, er enthält keine Sonderzeichen. Der Spieler-Tag steht
im Spiel im eigenen Profil unter dem Namen. Tags enthalten nie den Buchstaben `O`, immer die
Ziffer `0`. Bleibt `COC_CLAN_TAG` leer, wird automatisch der Clan des Spielers verwendet.

`.env` steht in `.gitignore` und wird nie eingecheckt.

### 3. Abhängigkeiten installieren

Entweder im Projektstamm in einem Rutsch:

```bash
npm install
npm run install:all
```

oder einzeln:

```bash
cd backend  && npm install
cd frontend && npm install
```

### 4. Starten

Beides zusammen aus dem Projektstamm:

```bash
npm start
```

Oder in zwei Terminals:

```bash
# Terminal 1
cd backend && npm run dev      # http://localhost:3000

# Terminal 2
cd frontend && npm start       # http://localhost:4200
```

Der Angular-Dev-Server leitet `/api` per Proxy an das Backend weiter, deshalb ist im Browser nur
<http://localhost:4200> nötig.

---

## Konfiguration (backend/.env)

| Variable | Vorgabe | Bedeutung |
| --- | --- | --- |
| `COC_API_KEY` | – | JWT aus dem Developer-Portal. Pflicht. |
| `COC_PLAYER_TAG` | – | Eigener Spieler-Tag inkl. `#`. Pflicht. |
| `COC_CLAN_TAG` | leer | Fester Clan-Tag. Leer = Clan des Spielers. |
| `PORT` | `3000` | Port des Backends. |
| `CORS_ORIGIN` | `http://localhost:4200` | Erlaubte Origins, Komma-getrennt. |
| `CACHE_TTL_SECONDS` | `60` | Wie lange API-Antworten im Speicher gehalten werden. Schützt vor dem Rate-Limit. |
| `COC_TIMEOUT_MS` | `10000` | Timeout für Anfragen an die Spiele-API. |
| `REFRESH_INTERVAL_SECONDS` | `300` | Vorgabe für das Auto-Refresh im Frontend. |
| `DATABASE_FILE` | `data/dashboard.sqlite` | Ablageort der lokalen SQLite-Datei. |
| `COC_API_BASE_URL` | offizielle API | Nur für Tests: abweichende Basis-URL, z. B. ein lokaler Mock. Im Normalbetrieb leer lassen. |

---

## Projektstruktur

```
.
├── backend/                     Express-API-Server (TypeScript, ESM)
│   ├── src/
│   │   ├── config/env.ts        .env laden und validieren
│   │   ├── controllers/         HTTP-Schicht je Themenbereich
│   │   ├── routes/index.ts      Alle /api-Endpunkte
│   │   ├── services/
│   │   │   ├── cocApi.service.ts      Einziger Ort, der den API-Key kennt
│   │   │   ├── player.service.ts      Umformung der API-Antworten
│   │   │   ├── troops.service.ts      Fortschritt gegen Rathaus-Maximum
│   │   │   ├── build.service.ts       Bau-Tracker (SQLite)
│   │   │   ├── boost.service.ts       Zeitrechnung der Beschleuniger
│   │   │   ├── planner.service.ts     Vorschläge, Restaufwand, Fertigdatum
│   │   │   ├── upgradeTime.service.ts Zeitmodell samt Korrekturen
│   │   │   └── strategy.service.ts    Bewertung der Strategieregeln
│   │   ├── data/
│   │   │   ├── maxLevels.json         Max-Level je Einheit und Rathaus
│   │   │   ├── strategies.json        Wissensdatenbank der Strategien
│   │   │   ├── boosts.json            Wirkung der Booster und Tränke
│   │   │   ├── buildings.json         Gebäudekatalog je Rathaus-Level
│   │   │   └── upgradeTimes.json      Zeitmodell der Aufwertungen
│   │   ├── db/database.ts       SQLite-Verbindung und Migration
│   │   ├── middleware/          Fehlerbehandlung, async-Wrapper
│   │   └── models/              Typen der CoC-API und der eigenen API
│   ├── tests/                   Tests der Booster-Zeitrechnung
│   └── .env.example
│
└── frontend/                    Angular 22 (standalone, zoneless, SCSS)
    └── src/app/
        ├── core/
        │   ├── models/          Typen, spiegeln die Backend-Antworten
        │   └── services/        ApiService, DashboardStore, BuildService, StrategyService
        ├── shared/components/   Fehleranzeige, Kennzahl-Kachel, Kriegskarte,
        │                        Diagramm, Skeleton, Leerzustand
        └── features/            dashboard, troops, build-tracker, planner,
                                 strategy, clan
```

---

## API des Backends

Alle Antworten haben dieselbe Hülle:

```json
{ "data": { }, "fetchedAt": "2025-01-01T12:00:00.000Z", "cached": false }
```

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/api/player` | Spieler-Übersicht |
| GET | `/api/troops` | Truppen-, Zauber-, Helden-Fortschritt |
| GET | `/api/history` | Trophäen-Verlauf aus der lokalen Datenbank |
| GET | `/api/clan` | Clan-Profil und Mitglieder |
| GET | `/api/war` | Aktueller Kriegsstatus |
| GET | `/api/builds` | Alle Bau-Einträge mit Restzeit |
| POST | `/api/builds` | Neuen Eintrag anlegen |
| PUT | `/api/builds/:id` | Eintrag ändern |
| PATCH | `/api/builds/:id` | Nur `completed` / `acknowledged` setzen |
| DELETE | `/api/builds/:id` | Eintrag löschen |
| DELETE | `/api/builds/completed` | Archiv leeren |
| GET | `/api/boosts` | Katalog aller Beschleuniger |
| POST | `/api/builds/:id/boosts` | Beschleuniger auf eine Aufwertung anwenden |
| DELETE | `/api/builds/:id/boosts/:boostId` | Angewandten Beschleuniger zurücknehmen |
| GET | `/api/planner` | Kompletter Plan: Vorschläge, Restaufwand, Fertigdatum |
| GET | `/api/planner/targets` | Auswahlliste für den Bau-Tracker |
| GET | `/api/planner/inventory` | Gebäudebestand fürs aktuelle Rathaus |
| PUT | `/api/planner/inventory/:buildingId` | Bestand eines Gebäudetyps setzen |
| DELETE | `/api/planner/inventory` | Bestand zurücksetzen |
| GET/PUT | `/api/planner/assumptions` | Annahmen lesen und ändern |
| GET/PUT | `/api/planner/times` | Aufwertungszeiten korrigieren |
| GET | `/api/strategy` | Bewertete Strategie-Vorschläge (`?limit=3`) |
| GET | `/api/strategy/rules` | Komplette Wissensdatenbank |
| PUT | `/api/strategy/notes/:id` | Eigene Notiz speichern |
| GET | `/api/config` | Nicht-geheime Konfiguration fürs Frontend |
| GET | `/api/health` | Erreichbarkeit der Spiele-API prüfen |
| POST | `/api/cache/clear` | Server-Cache leeren |

Im Fehlerfall:

```json
{ "error": { "code": "IP_NOT_WHITELISTED", "message": "…", "hint": "…" } }
```

Das Frontend wertet `code` aus und zeigt je Fall eine konkrete Anleitung an.

---

## Eigene Daten pflegen

### Strategien ergänzen

`backend/src/data/strategies.json` erweitern. Eine Regel braucht mindestens:

```json
{
  "id": "meine-strategie",
  "name": "Meine Strategie",
  "shortName": "Kurz",
  "minTownHall": 12,
  "maxTownHall": 14,
  "difficulty": "fortgeschritten",
  "summary": "Ein Satz, worum es geht.",
  "troops":  [{ "name": "Yeti", "minLevel": 2, "count": 6 }],
  "spells":  [{ "name": "Rage Spell", "minLevel": 6, "count": 3 }],
  "sieges":  [],
  "heroes":  [{ "name": "Grand Warden", "minLevel": 35, "optional": true }],
  "steps":   ["Erster Schritt", "Zweiter Schritt"],
  "tips":    ["Ein Hinweis"],
  "tags":    ["krieg", "bodenangriff"]
}
```

Die Namen müssen exakt den englischen Bezeichnungen der Clash-of-Clans-API entsprechen
(`Electro Dragon`, `Barbarian King`, `Freeze Spell` …). `optional: true` senkt die Punktzahl nur
leicht, wenn die Einheit fehlt. Nach dem Speichern reicht ein Neustart des Backends.

### Booster und Tränke anpassen

`backend/src/data/boosts.json` beschreibt je Mittel, wie es wirkt:

| Wirkungsart | Bedeutung |
| --- | --- |
| `speedup` | Läuft `durationSeconds` lang in Echtzeit und lässt den Fortschritt mit `factor`-facher Geschwindigkeit laufen. Bauarbeiter-Trank: Faktor 10 für eine Stunde. |
| `instant` | Stellt die Aufwertung im Moment der Anwendung fertig. Bücher und Hämmer. |
| `skip` | Überspringt eine frei eingegebene Restzeit. Für den Freikauf mit Edelsteinen. |
| `battle` | Wirkt nur im Kampf und wird im Bau-Tracker nicht angeboten. Heldentrank und Trainingstrank. |

`appliesTo` legt fest, auf welche Bau-Kategorien ein Mittel wirkt, `village` auf
welches Dorf. Überlappen sich mehrere `speedup`-Booster, gilt der höchste Faktor;
sie multiplizieren sich nicht. Die Rechnung deckt `backend/tests/boost-math.test.mjs`
ab, ausführbar mit `npm test` im Ordner `backend`.

### Zeiten des Planers korrigieren

Die Zeiten im Planer stammen aus Näherungskurven in
`backend/src/data/upgradeTimes.json`, nicht aus ausgelesenen Spielwerten. Sie
reichen zum Planen, sind aber nicht auf die Minute genau. Das Dashboard weist
jede daraus abgeleitete Zahl als Schätzung aus.

Das Modell rechnet **nicht über die rohe Levelzahl, sondern über das
Rathaus-Level, bei dem eine Stufe freigeschaltet wird.** Mörser 13 und Kanone 19
gehören beide zu Rathaus 14 und dauern deshalb ähnlich lang, obwohl die Zahlen
weit auseinanderliegen. Welches Rathaus eine Stufe freischaltet, steht in
`buildings.json` (Gebäude) und `maxLevels.json` (Einheiten und Helden).

```
dauer = rathausKurve[freischaltendes Rathaus] * faktor
```

`faktor` kommt aus `gebaeudeFaktor`, sonst aus `kategorieFaktor`. Für Forschung,
Helden und Haustiere gibt es je eine eigene Kurve über dem Rathaus-Level.

Zwei Wege zur Korrektur:

1. **Dauerhaft für alle:** Die passende Kurve oder den Faktor in
   `upgradeTimes.json` anpassen. Wer einen Gebäudetyp, eine Einheit oder einen
   Helden bestätigt hat, trägt den Schlüssel unter `geprueft` ein, dann
   verschwindet die Schätzungs-Markierung.
2. **Punktuell:** Einen Einzelwert über `PUT /api/planner/times` setzen. Solche
   Korrekturen liegen in der lokalen Datenbank und haben immer Vorrang.

```bash
curl -X PUT http://localhost:3000/api/planner/times \
  -H 'Content-Type: application/json' \
  -d '{"scope":"hero","key":"Grand Warden","level":59,"seconds":604800}'
```

`scope` ist `building`, `research` oder `hero`, `key` die Gebäude-Id bzw. der
englische Einheitenname, `level` das Ziellevel. `seconds: 0` löscht die Korrektur.

Der Gebäudekatalog selbst, also wie viele Exemplare es je Rathaus-Level gibt und
welches Höchstlevel dort gilt, steht in `backend/src/data/buildings.json`.

### Max-Level nach einem Spiel-Update anpassen

Die Maximallevel stehen in zwei Dateien:

* `backend/src/data/maxLevels.json` – Truppen, Zauber, Belagerungsmaschinen, Helden, Haustiere
* `backend/src/data/buildings.json` – Gebäude, Mauern und Fallen (Feld `maxLevel`)

Beide sind kompakte Tabellen `Rathaus-Level → dort erreichbares Maximallevel`. Eingetragen wird
nur, wo sich etwas ändert. Es gilt der Wert am **größten Schlüssel kleiner oder gleich** dem
eigenen Rathaus-Level. Damit dürfen Tabellen auch fallen, etwa weil die Adlerartillerie ab
Rathaus 17 verschwindet. Fehlt eine Einheit ganz, vergleicht das Dashboard hilfsweise mit dem
Spielmaximum aus der API und markiert den Balken mit einem Hinweis-Symbol.

Grundlage der aktuellen Werte ist
<https://www.clash.ninja/guides/max-levels-for-each-th> (bis Rathaus 18).

Die Stückzahlen je Gebäude (`anzahl` in `buildings.json`) stammen **nicht** von dort, sie sind
eigene Pflege.

> Der Entwicklungsserver beobachtet die JSON-Dateien mit. Änderungen greifen nach dem Speichern
> automatisch, ein Neustart ist nicht nötig.

---

## Fehlerbilder

| Anzeige | Ursache | Lösung |
| --- | --- | --- |
| Backend nicht erreichbar | Express-Server läuft nicht | `npm run dev` im Ordner `backend` |
| IP-Adresse nicht freigegeben | Key ist an eine andere IP gebunden | Im Developer-Portal die aktuelle IP eintragen |
| API-Key ungültig | Falscher oder abgelaufener Key | Key in `backend/.env` prüfen, Backend neu starten |
| Nicht gefunden | Tippfehler im Tag | Im Tag steht `0`, nie `O` |
| Zu viele Anfragen | Rate-Limit der Spiele-API | Refresh-Intervall oder `CACHE_TTL_SECONDS` erhöhen |
| Wartungsarbeiten | Supercell-Wartung | Abwarten |
| Kriegslog privat | Clan-Einstellung | Im Spiel das Kriegslog öffentlich schalten |

---

## Was die API liefert und was nicht

Das ist die wichtigste Einschränkung des Projekts, deshalb hier ausdrücklich:

| Kommt live aus der Spiele-API | Muss von Hand gepflegt werden |
| --- | --- |
| Rathaus-Level, XP, Trophäen, Liga | Gebäudelevel und Gebäudeanzahl |
| Truppen-, Zauber-, Helden-, Haustierlevel | Laufende Bauzeiten und Timer |
| Clan, Mitglieder, Kriegsstatus | Angewandte Booster und Tränke |
| Spenden, Angriffe, Kriegssterne | Anzahl der Bauarbeiter |

Der Planer rechnet deshalb gemischt: Labor, Haustiere und Helden exakt aus den
API-Leveln, Gebäude aus dem manuell erfassten Bestand. Solange nichts erfasst
ist, nimmt er an, dass alle Gebäude auf dem Höchstlevel des vorherigen Rathauses
stehen, und markiert das im UI sichtbar als Annahme.

Die vier Bereiche laufen im Spiel parallel und werden deshalb getrennt gezählt:
Bauarbeiter, Labor, Haustierhaus und Helden. Für das Fertigdatum zählt der
längste von ihnen.

---

## Der Kreislauf zwischen Bau-Tracker und Planer

Das Feld **„Was wird ausgebaut?“** im Bau-Tracker ist eine Auswahlliste aller
noch offenen Aufwertungen, gruppiert nach Helden, Gebäuden, Truppen, Zaubern und
Haustieren. Jeder Eintrag zeigt das Ziel-Level direkt an, bei Gebäuden zusätzlich
die Anzahl der Exemplare auf dieser Stufe. Nach dem Ziel-Level wird nicht
gefragt, es ergibt sich aus der Auswahl, ebenso Name, Kategorie und die
geschätzte Dauer.

Stehen mehrere Exemplare eines Gebäudetyps auf verschiedenen Stufen, erscheint
jede Stufe einzeln: „Magierturm 13 → 14 · 3 Stück“ und „Magierturm 14 → 15 ·
2 Stück“. Für alles, was nicht in der Liste steht, etwa Bauerbasis-Gebäude, gibt
es am Ende den Punkt „Sonstiges, frei eintragen“.

Daraus ergibt sich:

* **Während es läuft** verschwindet die Aufwertung aus den Vorschlägen des
  Planers und ist in der Auswahlliste als „läuft bereits“ markiert. Gesperrt wird
  nur genau diese Stufe: Steht ein Magierturm auf 13 → 14 im Tracker, lässt sich
  ein zweiter auf 14 → 15 parallel eintragen. Frei eingetragene Einträge kennt
  der Planer nicht und schlägt sie weiter vor.
* **Beim Abhaken** wandert ein Exemplar im Gebäudebestand eine Stufe hoch. Bei
  Truppen, Zaubern und Helden ist das nicht nötig, ihre Level kommen beim
  nächsten Abruf aus der Spiele-API.

Der Bestand wird nur nachgezogen, wenn für den Gebäudetyp bereits Werte erfasst
sind und dort ein Exemplar auf der Vorgängerstufe steht. Sonst wäre nicht
eindeutig, welches Exemplar gemeint ist.

---

## Tests

```bash
cd backend && npm test
```

Prüft die Zeitrechnung der Beschleuniger: Ersparnis eines Trankes, Stapelung
mehrerer Tränke, Vorrang des höheren Faktors, sofortige Fertigstellung durch ein
Buch, Edelstein-Freikauf und die Ersparnis je einzelnem Booster.

---

## Hinweise

* **Bau-Timer**: Die offizielle API liefert keine laufenden Upgrades. Deshalb der manuelle Tracker.
  Die Restzeit wird aus Startzeit, Dauer und allen angewandten Boostern berechnet und läuft im
  Browser weiter, auch wenn das Backend zwischendurch neu startet.
* **Trophäen-Verlauf**: Das Backend schreibt bei jedem Abruf höchstens einen Messpunkt pro Stunde
  in die lokale Datenbank. Der Verlauf füllt sich also mit der Laufzeit.
* **Rate-Limit**: Der Speicher-Cache im Backend (`CACHE_TTL_SECONDS`) fängt häufige Reloads ab.
  Der Button „Aktualisieren“ leert ihn bewusst, um echte Live-Daten zu holen.
* Dieses Projekt steht in keiner Verbindung zu Supercell.
