import 'dotenv/config';
import path from 'node:path';
import { ConfigError } from '../utils/ConfigError.js';

/** Zentrale, einmalig validierte Laufzeit-Konfiguration des Backends. */
export interface AppConfig {
  readonly cocApiKey: string;
  readonly playerTag: string;
  /** Leer, wenn kein Clan-Tag konfiguriert ist - dann wird der Clan des Spielers genutzt. */
  readonly clanTag: string;
  readonly port: number;
  readonly corsOrigins: readonly string[];
  readonly cacheTtlSeconds: number;
  readonly cocTimeoutMs: number;
  readonly refreshIntervalSeconds: number;
  readonly databaseFile: string;
  readonly cocBaseUrl: string;
}

export { ConfigError };

/**
 * Liest eine Variable und behandelt einen leeren Wert wie "nicht gesetzt".
 *
 * Wichtig, weil in der .env-Vorlage optionale Felder leer stehen
 * (z. B. `COC_API_BASE_URL=`). Ein `??` allein würde dort den leeren String
 * durchreichen statt die Vorgabe zu nehmen.
 */
function readString(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === '' ? fallback : raw.trim();
}

function readNumber(name: string, fallback: number, problems: string[]): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    problems.push(`${name} muss eine positive Zahl sein (aktuell: "${raw}")`);
    return fallback;
  }
  return parsed;
}

/**
 * Normalisiert einen Spieler-/Clan-Tag: Grossbuchstaben, führende Raute,
 * und das häufig verwechselte "O" wird zur Null gemappt (CoC-Tags nutzen kein O).
 */
export function normalizeTag(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/^#/, '').replace(/O/g, '0');
  return `#${cleaned}`;
}

function loadConfig(): AppConfig {
  const problems: string[] = [];

  const cocApiKey = (process.env['COC_API_KEY'] ?? '').trim();
  if (!cocApiKey || cocApiKey.startsWith('hier_')) {
    problems.push('COC_API_KEY fehlt. Key unter https://developer.clashofclans.com/ erstellen und in backend/.env eintragen.');
  }

  const rawPlayerTag = (process.env['COC_PLAYER_TAG'] ?? '').trim();
  if (!rawPlayerTag || rawPlayerTag === '#DEINTAG') {
    // Häufigste Ursache: die Raute steht ohne Anführungszeichen in der .env,
    // dann liest dotenv den Rest der Zeile als Kommentar und der Wert ist leer.
    problems.push(
      'COC_PLAYER_TAG fehlt oder ist leer. In backend/.env eintragen als ' +
        'COC_PLAYER_TAG="#2PP0JCVJL" - die Anführungszeichen sind nötig, weil eine ' +
        'unquotierte Raute als Kommentar gilt. Ohne Raute geht es auch: COC_PLAYER_TAG=2PP0JCVJL',
    );
  }

  const rawClanTag = (process.env['COC_CLAN_TAG'] ?? '').trim();

  if (problems.length > 0) throw new ConfigError(problems);

  const databaseFile = readString('DATABASE_FILE', 'data/dashboard.sqlite');

  const cocBaseUrl = readString('COC_API_BASE_URL', 'https://api.clashofclans.com/v1').replace(/\/+$/, '');
  if (!/^https?:\/\/.+/i.test(cocBaseUrl)) {
    throw new ConfigError([
      `COC_API_BASE_URL muss eine vollständige http- oder https-Adresse sein (aktuell: "${cocBaseUrl}"). ` +
        'Für den Normalbetrieb die Zeile leer lassen oder ganz entfernen.',
    ]);
  }

  return {
    cocApiKey,
    playerTag: normalizeTag(rawPlayerTag),
    clanTag: rawClanTag ? normalizeTag(rawClanTag) : '',
    port: readNumber('PORT', 3000, problems),
    corsOrigins: readString('CORS_ORIGIN', 'http://localhost:4200')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    cacheTtlSeconds: readNumber('CACHE_TTL_SECONDS', 60, problems),
    cocTimeoutMs: readNumber('COC_TIMEOUT_MS', 10_000, problems),
    refreshIntervalSeconds: readNumber('REFRESH_INTERVAL_SECONDS', 300, problems),
    databaseFile: path.isAbsolute(databaseFile)
      ? databaseFile
      : path.resolve(process.cwd(), databaseFile),
    // Überschreibbar, um gegen einen lokalen Mock oder einen eigenen Proxy zu testen.
    cocBaseUrl,
  };
}

export const config: AppConfig = loadConfig();
