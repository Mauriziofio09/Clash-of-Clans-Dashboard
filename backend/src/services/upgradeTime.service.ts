import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/database.js';
import { unlockService } from './unlock.service.js';
import { AppError } from '../utils/AppError.js';
import type { PlannerTaskKind, TimeOverride } from '../models/domain.types.js';

interface TimeFile {
  meta: Record<string, unknown>;
  /** Rathaus-Level -> Stunden für eine typische Verteidigungs-Aufwertung. */
  rathausKurve: Record<string, number>;
  kategorieFaktor: Record<string, number>;
  gebaeudeFaktor: Record<string, number>;
  forschungKurve: Record<string, number>;
  heldenKurve: Record<string, number>;
  haustierKurve: Record<string, number>;
  geprueft: { gebaeude: string[]; forschung: string[]; helden: string[]; haustiere: string[] };
}

const here = path.dirname(fileURLToPath(import.meta.url));

function loadTimes(): TimeFile {
  const candidates = [
    path.resolve(here, '../data/upgradeTimes.json'),
    path.resolve(here, '../../src/data/upgradeTimes.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, 'utf8')) as TimeFile;
  }
  throw new Error(`upgradeTimes.json nicht gefunden. Gesucht in: ${candidates.join(', ')}`);
}

const times = loadTimes();

/** Wert aus einer Rathaus-Kurve, mit Rückfall auf den höchsten Eintrag. */
function fromCurve(curve: Record<string, number>, townHall: number | null): number {
  if (townHall === null) return 0;

  const exact = curve[String(townHall)];
  if (exact !== undefined) return exact;

  // Unterhalb der Kurve gilt der kleinste, oberhalb der größte bekannte Wert.
  const keys = Object.keys(curve)
    .map(Number)
    .sort((a, b) => a - b);
  if (keys.length === 0) return 0;

  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (townHall < first) return curve[String(first)] ?? 0;
  if (townHall > last) return curve[String(last)] ?? 0;

  // Lücke in der Kurve: nächstkleinerer Eintrag.
  let best = 0;
  for (const key of keys) if (key <= townHall) best = curve[String(key)] ?? best;
  return best;
}

const selectOverrides = db.prepare<[], { scope: string; key: string; level: number; seconds: number; updated_at: string }>(
  'SELECT * FROM time_overrides ORDER BY scope, key, level',
);
const upsertOverride = db.prepare(`
  INSERT INTO time_overrides (scope, key, level, seconds, updated_at)
  VALUES (@scope, @key, @level, @seconds, @now)
  ON CONFLICT(scope, key, level) DO UPDATE SET seconds = @seconds, updated_at = @now
`);
const deleteOverride = db.prepare('DELETE FROM time_overrides WHERE scope = ? AND key = ? AND level = ?');

/** Overrides werden im Speicher gehalten, weil der Planer sie sehr oft abfragt. */
let overrideCache: Map<string, number> | null = null;

function overrideKey(scope: string, key: string, level: number): string {
  return `${scope}|${key}|${level}`;
}

function overrides(): Map<string, number> {
  if (overrideCache === null) {
    overrideCache = new Map(
      selectOverrides.all().map((row) => [overrideKey(row.scope, row.key, row.level), row.seconds]),
    );
  }
  return overrideCache;
}

export interface UpgradeDuration {
  seconds: number;
  /** true, wenn der Wert aus der Näherungskurve stammt. */
  estimated: boolean;
  /** Rathaus-Level, das diese Stufe freischaltet - erklärt die Dauer. */
  unlockedAtTownHall: number | null;
}

export const upgradeTimeService = {
  /** Dauer einer Gebäude-Aufwertung auf das Ziellevel. */
  forBuilding(buildingId: string, category: string, toLevel: number): UpgradeDuration {
    const manual = overrides().get(overrideKey('building', buildingId, toLevel));
    if (manual !== undefined) {
      return { seconds: manual, estimated: false, unlockedAtTownHall: null };
    }

    const townHall = unlockService.forBuilding(buildingId, toLevel);
    const factor = times.gebaeudeFaktor[buildingId] ?? times.kategorieFaktor[category] ?? 1;
    const hours = fromCurve(times.rathausKurve, townHall) * factor;

    return {
      seconds: Math.round(hours * 3600),
      estimated: !times.geprueft.gebaeude.includes(buildingId),
      unlockedAtTownHall: townHall,
    };
  },

  /** Dauer einer Labor-Forschung auf das Ziellevel. */
  forResearch(unitName: string, toLevel: number): UpgradeDuration {
    const manual = overrides().get(overrideKey('research', unitName, toLevel));
    if (manual !== undefined) {
      return { seconds: manual, estimated: false, unlockedAtTownHall: null };
    }

    const townHall = unlockService.forUnit(unitName, toLevel);
    return {
      seconds: Math.round(fromCurve(times.forschungKurve, townHall) * 3600),
      estimated: !times.geprueft.forschung.includes(unitName),
      unlockedAtTownHall: townHall,
    };
  },

  /** Dauer einer Helden-Aufwertung auf das Ziellevel. */
  forHero(heroName: string, toLevel: number): UpgradeDuration {
    const manual = overrides().get(overrideKey('hero', heroName, toLevel));
    if (manual !== undefined) {
      return { seconds: manual, estimated: false, unlockedAtTownHall: null };
    }

    const townHall = unlockService.forUnit(heroName, toLevel);
    return {
      seconds: Math.round(fromCurve(times.heldenKurve, townHall) * 3600),
      estimated: !times.geprueft.helden.includes(heroName),
      unlockedAtTownHall: townHall,
    };
  },

  /** Dauer einer Haustier-Aufwertung auf das Ziellevel. */
  forPet(petName: string, toLevel: number): UpgradeDuration {
    const manual = overrides().get(overrideKey('research', petName, toLevel));
    if (manual !== undefined) {
      return { seconds: manual, estimated: false, unlockedAtTownHall: null };
    }

    const townHall = unlockService.forUnit(petName, toLevel);
    return {
      seconds: Math.round(fromCurve(times.haustierKurve, townHall) * 3600),
      estimated: !times.geprueft.haustiere.includes(petName),
      unlockedAtTownHall: townHall,
    };
  },

  list(): TimeOverride[] {
    return selectOverrides.all().map((row) => ({
      scope: row.scope as PlannerTaskKind,
      key: row.key,
      level: row.level,
      seconds: row.seconds,
      updatedAt: row.updated_at,
    }));
  },

  /** Setzt eine korrigierte Zeit. seconds <= 0 löscht die Korrektur wieder. */
  save(body: unknown): TimeOverride | null {
    const raw = (body ?? {}) as Record<string, unknown>;
    const scope = String(raw['scope'] ?? '');
    if (!['building', 'research', 'hero', 'townhall'].includes(scope)) {
      throw AppError.validation('Feld "scope" muss building, research, hero oder townhall sein.');
    }
    const key = typeof raw['key'] === 'string' ? raw['key'].trim() : '';
    if (!key) throw AppError.validation('Feld "key" ist erforderlich.');

    const level = Number(raw['level']);
    if (!Number.isInteger(level) || level < 1 || level > 200) {
      throw AppError.validation('Feld "level" muss eine ganze Zahl zwischen 1 und 200 sein.');
    }

    const seconds = Number(raw['seconds']);
    if (!Number.isFinite(seconds)) throw AppError.validation('Feld "seconds" muss eine Zahl sein.');

    overrideCache = null;

    if (seconds <= 0) {
      deleteOverride.run(scope, key, level);
      return null;
    }
    if (seconds > 60 * 60 * 24 * 60) {
      throw AppError.validation('Eine Aufwertung darf höchstens 60 Tage dauern.');
    }

    const now = new Date().toISOString();
    upsertOverride.run({ scope, key, level, seconds: Math.round(seconds), now });
    return { scope: scope as PlannerTaskKind, key, level, seconds: Math.round(seconds), updatedAt: now };
  },
};
