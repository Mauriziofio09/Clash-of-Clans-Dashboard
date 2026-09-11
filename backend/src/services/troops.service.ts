import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CocPlayer, CocPlayerItem } from '../models/coc.types.js';
import type { TroopsOverview, UnitCategory, UnitGroup, UnitProgress } from '../models/domain.types.js';

interface MaxLevelEntry {
  category: UnitCategory;
  /** Rathaus-Level (als String) -> dort maximal erreichbares Level. */
  levels: Record<string, number>;
}

interface MaxLevelFile {
  meta: Record<string, unknown>;
  units: Record<string, MaxLevelEntry>;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function loadMaxLevels(): MaxLevelFile {
  // Nach dem Build liegt die JSON-Datei unter dist/data, im Dev-Modus unter src/data.
  const candidates = [
    path.resolve(here, '../data/maxLevels.json'),
    path.resolve(here, '../../src/data/maxLevels.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf8')) as MaxLevelFile;
    }
  }
  throw new Error(`maxLevels.json nicht gefunden. Gesucht in: ${candidates.join(', ')}`);
}

const maxLevels = loadMaxLevels();

/**
 * Super-Truppen sind zeitlich begrenzte Boosts und teilen sich das Level mit der
 * Basis-Truppe. Sie bekommen deshalb keine eigene Rathaus-Tabelle.
 */
const SUPER_TROOPS = new Set([
  'Super Barbarian', 'Super Archer', 'Super Giant', 'Sneaky Goblin', 'Super Wall Breaker',
  'Rocket Balloon', 'Super Wizard', 'Super Dragon', 'Inferno Dragon', 'Super Minion',
  'Super Valkyrie', 'Super Witch', 'Ice Hound', 'Super Bowler', 'Super Miner',
  'Super Hog Rider', 'Super Yeti',
]);

const GROUP_LABELS: Record<UnitCategory, string> = {
  hero: 'Helden',
  troop: 'Truppen (Elixier)',
  darkTroop: 'Truppen (Dunkles Elixier)',
  spell: 'Zauber (Elixier)',
  darkSpell: 'Zauber (Dunkles Elixier)',
  siege: 'Belagerungsmaschinen',
  pet: 'Haustiere',
  superTroop: 'Super-Truppen',
};

const GROUP_ORDER: readonly UnitCategory[] = [
  'hero', 'pet', 'troop', 'darkTroop', 'spell', 'darkSpell', 'siege', 'superTroop',
];

/**
 * Höchstes Level, das eine Einheit beim gegebenen Rathaus-Level erreichen kann.
 * Liefert 0, wenn die Einheit dort noch nicht freigeschaltet ist, und null,
 * wenn für sie keine Tabelle hinterlegt ist.
 */
export function maxLevelForTownHall(unitName: string, townHallLevel: number): number | null {
  const entry = maxLevels.units[unitName];
  if (!entry) return null;

  // Es gilt der Wert am größten Schlüssel kleiner oder gleich dem Rathaus-Level,
  // nicht der größte Wert überhaupt: Tabellen dürfen auch fallen.
  let bestKey = -1;
  let value = 0;
  for (const [thKey, maxLevel] of Object.entries(entry.levels)) {
    const th = Number(thKey);
    if (th <= townHallLevel && th > bestKey) {
      bestKey = th;
      value = maxLevel;
    }
  }
  return value;
}

/** Kategorie einer Einheit laut Wissensdatenbank, mit Fallback für Unbekanntes. */
function categorize(item: CocPlayerItem, fallback: UnitCategory): UnitCategory {
  if (SUPER_TROOPS.has(item.name)) return 'superTroop';
  return maxLevels.units[item.name]?.category ?? fallback;
}

function toProgress(item: CocPlayerItem, townHallLevel: number, fallback: UnitCategory): UnitProgress {
  const category = categorize(item, fallback);
  const tableMax = category === 'superTroop' ? null : maxLevelForTownHall(item.name, townHallLevel);

  // Ohne Tabelleneintrag bleibt nur das globale Maximum der API als Näherung.
  const estimated = tableMax === null;
  const maxForTownHall = estimated ? item.maxLevel : Math.max(tableMax, 0);
  const locked = !estimated && maxForTownHall === 0;
  const percent =
    maxForTownHall > 0 ? Math.min(100, Math.round((item.level / maxForTownHall) * 100)) : 0;

  return {
    name: item.name,
    category,
    level: item.level,
    maxForTownHall,
    maxOverall: item.maxLevel,
    percent,
    maxed: !locked && item.level >= maxForTownHall,
    locked,
    estimated,
  };
}

/**
 * Baut aus der Spieler-Antwort der CoC API die Fortschrittsübersicht.
 * Builder-Base-Einheiten werden ausgeblendet, das Dashboard zeigt nur das Heimatdorf.
 */
export function buildTroopsOverview(player: CocPlayer): TroopsOverview {
  const th = player.townHallLevel;
  const home = (items: CocPlayerItem[] | undefined) =>
    (items ?? []).filter((item) => item.village === 'home');

  const units: UnitProgress[] = [
    ...home(player.heroes).map((h) => toProgress(h, th, 'hero')),
    ...home(player.troops).map((t) => toProgress(t, th, 'troop')),
    ...home(player.spells).map((s) => toProgress(s, th, 'spell')),
  ];

  const byCategory = new Map<UnitCategory, UnitProgress[]>();
  for (const unit of units) {
    const list = byCategory.get(unit.category) ?? [];
    list.push(unit);
    byCategory.set(unit.category, list);
  }

  const groups: UnitGroup[] = [];
  for (const category of GROUP_ORDER) {
    const list = byCategory.get(category);
    if (!list || list.length === 0) continue;

    // Gesperrte Einheiten zählen nicht in den Fortschritt der Gruppe hinein.
    const relevant = list.filter((u) => !u.locked);
    const percent =
      relevant.length > 0
        ? Math.round(relevant.reduce((sum, u) => sum + u.percent, 0) / relevant.length)
        : 0;

    list.sort((a, b) => Number(a.locked) - Number(b.locked) || a.name.localeCompare(b.name));
    groups.push({ category, label: GROUP_LABELS[category], units: list, percent });
  }

  const scored = groups.filter((g) => g.category !== 'superTroop' && g.units.some((u) => !u.locked));
  const overallPercent =
    scored.length > 0 ? Math.round(scored.reduce((sum, g) => sum + g.percent, 0) / scored.length) : 0;

  return { townHallLevel: th, groups, overallPercent };
}
