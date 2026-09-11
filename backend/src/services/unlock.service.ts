import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Beantwortet die Frage "bei welchem Rathaus-Level wird diese Stufe
 * freigeschaltet?".
 *
 * Das ist der Schlüssel für ein brauchbares Zeitmodell: Eine Aufwertung auf
 * Mörser 13 ist keine mittlere Aufwertung, nur weil 13 eine mittlere Zahl ist -
 * sie gehört zu Rathaus 14 und dauert entsprechend lange. Kanone 19 gehört
 * ebenfalls zu Rathaus 14 und dauert ähnlich lang, obwohl die Zahl höher ist.
 */

interface SparseTable {
  [townHall: string]: number;
}

interface BuildingFile {
  buildings: { id: string; maxLevel: SparseTable }[];
}

interface UnitFile {
  units: Record<string, { category: string; levels: SparseTable }>;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function load<T>(fileName: string): T {
  const candidates = [
    path.resolve(here, `../data/${fileName}`),
    path.resolve(here, `../../src/data/${fileName}`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, 'utf8')) as T;
  }
  throw new Error(`${fileName} nicht gefunden. Gesucht in: ${candidates.join(', ')}`);
}

const buildings = load<BuildingFile>('buildings.json').buildings;
const units = load<UnitFile>('maxLevels.json').units;

const buildingTables = new Map(buildings.map((b) => [b.id, b.maxLevel]));

/** Kleinstes Rathaus-Level, bei dem `level` erreichbar ist. */
function firstTownHallReaching(table: SparseTable | undefined, level: number): number | null {
  if (!table) return null;

  let best: number | null = null;
  for (const [key, max] of Object.entries(table)) {
    const th = Number(key);
    if (max >= level && (best === null || th < best)) best = th;
  }
  if (best !== null) return best;

  // Oberhalb der Tabelle: das höchste bekannte Rathaus-Level.
  let highest = 0;
  for (const key of Object.keys(table)) highest = Math.max(highest, Number(key));
  return highest > 0 ? highest : null;
}

export const unlockService = {
  /** Rathaus-Level, bei dem ein Gebäude dieses Ziellevel erreichen kann. */
  forBuilding(buildingId: string, level: number): number | null {
    return firstTownHallReaching(buildingTables.get(buildingId), level);
  },

  /** Rathaus-Level, bei dem eine Einheit oder ein Held dieses Level erreichen kann. */
  forUnit(unitName: string, level: number): number | null {
    return firstTownHallReaching(units[unitName]?.levels, level);
  },

  /** Kategorie einer Einheit laut Wissensdatenbank, null wenn unbekannt. */
  categoryOfUnit(unitName: string): string | null {
    return units[unitName]?.category ?? null;
  },
};
