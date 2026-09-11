import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/database.js';
import { AppError } from '../utils/AppError.js';
import { upgradeTimeService } from './upgradeTime.service.js';
import type {
  BuildingCatalogEntry,
  BuildingCategory,
  BuildingInventoryEntry,
  InventoryLevelCount,
} from '../models/domain.types.js';

/**
 * Gebäudekatalog und der manuell gepflegte Bestand.
 *
 * Bewusst ein eigenes Modul: sowohl der Planer als auch der Bau-Tracker
 * brauchen es. Der Bau-Tracker zieht den Bestand nach, sobald eine Aufwertung
 * abgehakt wird, und dürfte deshalb nicht vom Planer abhängen.
 */

interface CatalogFileEntry {
  id: string;
  name: string;
  category: BuildingCategory;
  priority: number;
  anzahl: Record<string, number>;
  maxLevel: Record<string, number>;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function loadCatalog(): CatalogFileEntry[] {
  const candidates = [
    path.resolve(here, '../data/buildings.json'),
    path.resolve(here, '../../src/data/buildings.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return (JSON.parse(fs.readFileSync(candidate, 'utf8')) as { buildings: CatalogFileEntry[] }).buildings;
    }
  }
  throw new Error(`buildings.json nicht gefunden. Gesucht in: ${candidates.join(', ')}`);
}

const catalogFile = loadCatalog();

/**
 * Wert einer sparse Rathaus-Tabelle: der Wert am größten Schlüssel kleiner oder
 * gleich th. Bewusst nicht der größte Wert - Tabellen dürfen fallen, etwa weil
 * die Adlerartillerie ab Rathaus 17 verschwindet.
 */
export function atTownHall(table: Record<string, number>, th: number): number {
  let bestKey = -1;
  let value = 0;
  for (const [key, entry] of Object.entries(table)) {
    const level = Number(key);
    if (level <= th && level > bestKey) {
      bestKey = level;
      value = entry;
    }
  }
  return value;
}

const selectInventory = db.prepare<[], { building_id: string; level: number; count: number }>(
  'SELECT * FROM building_inventory WHERE count > 0 ORDER BY building_id, level',
);
const selectForBuilding = db.prepare<[string], { level: number; count: number }>(
  'SELECT level, count FROM building_inventory WHERE building_id = ? AND count > 0 ORDER BY level',
);
const deleteInventoryFor = db.prepare('DELETE FROM building_inventory WHERE building_id = ?');
const insertInventory = db.prepare(
  'INSERT INTO building_inventory (building_id, level, count) VALUES (@buildingId, @level, @count)',
);

/** Der Katalog, aufgelöst für ein konkretes Rathaus-Level. */
export function catalogFor(townHallLevel: number): BuildingCatalogEntry[] {
  return catalogFile
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      category: entry.category,
      priority: entry.priority,
      available: atTownHall(entry.anzahl, townHallLevel),
      maxLevel: atTownHall(entry.maxLevel, townHallLevel),
    }))
    .filter((entry) => entry.available > 0 && entry.maxLevel > 0);
}

/**
 * Angenommener Bestand, solange nichts eingetragen ist: alle Exemplare stehen
 * auf dem Höchstlevel des vorherigen Rathauses. Das trifft zu, wenn gerade
 * aufs aktuelle Rathaus gewechselt wurde, und ist im UI als Annahme markiert.
 */
function defaultLevels(entry: CatalogFileEntry, townHallLevel: number): InventoryLevelCount[] {
  const available = atTownHall(entry.anzahl, townHallLevel);
  const previousMax = atTownHall(entry.maxLevel, townHallLevel - 1);
  return available > 0 ? [{ level: Math.max(1, previousMax), count: available }] : [];
}

export const inventoryService = {
  catalogFor,

  hasEntry(buildingId: string): boolean {
    return selectForBuilding.all(buildingId).length > 0;
  },

  /** Bestand je Gebäudetyp inklusive der offenen Aufwertungen und ihrer Restzeit. */
  list(townHallLevel: number): BuildingInventoryEntry[] {
    const stored = new Map<string, InventoryLevelCount[]>();
    for (const row of selectInventory.all()) {
      const list = stored.get(row.building_id) ?? [];
      list.push({ level: row.level, count: row.count });
      stored.set(row.building_id, list);
    }

    return catalogFor(townHallLevel).map((entry) => {
      const source = catalogFile.find((c) => c.id === entry.id)!;

      // Das Rathaus ist der einzige Gebäudetyp, dessen Level die API kennt.
      // Es wird deshalb nie von Hand gepflegt, sondern immer gleichgesetzt.
      const isTownHall = entry.id === 'town-hall';
      const usesDefault = isTownHall ? false : !stored.has(entry.id);
      const levels = (
        isTownHall
          ? [{ level: townHallLevel, count: 1 }]
          : (stored.get(entry.id) ?? defaultLevels(source, townHallLevel))
      )
        .filter((l) => l.count > 0 && l.level >= 1)
        .sort((a, b) => a.level - b.level);

      const entered = levels.reduce((sum, l) => sum + l.count, 0);
      const missing = Math.max(0, entry.available - entered);

      let openUpgrades = 0;
      let remainingSeconds = 0;

      for (const { level, count } of levels) {
        for (let target = level + 1; target <= entry.maxLevel; target += 1) {
          openUpgrades += count;
          remainingSeconds += upgradeTimeService.forBuilding(entry.id, entry.category, target).seconds * count;
        }
      }
      // Noch gar nicht gebaute Exemplare müssen von Level 1 an hochgezogen werden.
      for (let target = 1; target <= entry.maxLevel; target += 1) {
        openUpgrades += missing;
        remainingSeconds += upgradeTimeService.forBuilding(entry.id, entry.category, target).seconds * missing;
      }

      return { ...entry, levels, entered, missing, openUpgrades, remainingSeconds, usesDefault };
    });
  },

  /** Überschreibt den Bestand eines Gebäudetyps komplett. */
  save(buildingId: string, body: unknown): void {
    if (!catalogFile.some((c) => c.id === buildingId)) {
      throw AppError.notFound(`Kein Gebäudetyp mit der ID "${buildingId}" im Katalog.`);
    }
    const raw = (body ?? {}) as Record<string, unknown>;
    const levels = raw['levels'];
    if (!Array.isArray(levels)) throw AppError.validation('Feld "levels" muss ein Array sein.');

    const cleaned: InventoryLevelCount[] = [];
    for (const item of levels) {
      const record = (item ?? {}) as Record<string, unknown>;
      const level = Number(record['level']);
      const count = Number(record['count']);
      if (!Number.isInteger(level) || level < 1 || level > 100) {
        throw AppError.validation('Jedes Level muss eine ganze Zahl zwischen 1 und 100 sein.');
      }
      if (!Number.isInteger(count) || count < 0 || count > 500) {
        throw AppError.validation('Jede Anzahl muss eine ganze Zahl zwischen 0 und 500 sein.');
      }
      if (count > 0) cleaned.push({ level, count });
    }

    this.replace(buildingId, cleaned);
  },

  replace(buildingId: string, levels: readonly InventoryLevelCount[]): void {
    const transaction = db.transaction(() => {
      deleteInventoryFor.run(buildingId);
      for (const { level, count } of levels) {
        insertInventory.run({ buildingId, level, count });
      }
    });
    transaction();
  },

  reset(): void {
    db.exec('DELETE FROM building_inventory');
  },

  /**
   * Zieht den Bestand nach, wenn eine Gebäude-Aufwertung abgehakt wird:
   * ein Exemplar wandert von Ziellevel minus eins auf das Ziellevel.
   *
   * Liegt für diesen Typ noch gar kein Bestand vor oder steht kein Exemplar auf
   * dem Vorgängerlevel, passiert bewusst nichts - dann wäre nicht eindeutig,
   * welches Exemplar gemeint ist.
   */
  applyCompletedUpgrade(buildingId: string, toLevel: number): boolean {
    const rows = selectForBuilding.all(buildingId);
    if (rows.length === 0) return false;

    const fromLevel = toLevel - 1;
    const source = rows.find((row) => row.level === fromLevel);
    if (!source || source.count <= 0) return false;

    const next = new Map(rows.map((row) => [row.level, row.count]));
    next.set(fromLevel, source.count - 1);
    next.set(toLevel, (next.get(toLevel) ?? 0) + 1);

    this.replace(
      buildingId,
      [...next.entries()]
        .filter(([, count]) => count > 0)
        .map(([level, count]) => ({ level, count }))
        .sort((a, b) => a.level - b.level),
    );
    return true;
  },
};
