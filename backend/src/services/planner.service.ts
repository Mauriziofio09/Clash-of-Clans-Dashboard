import { db } from '../db/database.js';
import { AppError } from '../utils/AppError.js';
import { buildService } from './build.service.js';
import { catalogFor, inventoryService } from './inventory.service.js';
import { strategyService } from './strategy.service.js';
import { unlockService } from './unlock.service.js';
import { buildTroopsOverview } from './troops.service.js';
import { upgradeTimeService } from './upgradeTime.service.js';
import type { CocPlayer } from '../models/coc.types.js';
import type {
  BoostScenario,
  BuildCategory,
  PlannerTaskKind,
  BuildingInventoryEntry,
  PlannerAssumptions,
  PlannerBacklog,
  PlannerResult,
  PlannerTarget,
  PlannerTask,
} from '../models/domain.types.js';

/* -------------------------------------------------------------------------- */
/* Annahmen                                                                    */
/* -------------------------------------------------------------------------- */

const DEFAULT_ASSUMPTIONS: PlannerAssumptions = {
  bauarbeiter: 5,
  heldenGleichzeitig: 1,
  heldenBelegenBauarbeiter: false,
  mauernEinrechnen: false,
  aktiveStundenProTag: 24,
};

const selectSettings = db.prepare<[], { key: string; value: string }>('SELECT * FROM planner_settings');
const upsertSetting = db.prepare(
  'INSERT INTO planner_settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value',
);

function readAssumptions(): PlannerAssumptions {
  const stored = new Map(selectSettings.all().map((row) => [row.key, row.value]));
  const num = (key: keyof PlannerAssumptions, fallback: number): number => {
    const raw = stored.get(key);
    const parsed = raw === undefined ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const bool = (key: keyof PlannerAssumptions, fallback: boolean): boolean => {
    const raw = stored.get(key);
    return raw === undefined ? fallback : raw === 'true';
  };

  return {
    bauarbeiter: Math.min(12, Math.max(1, num('bauarbeiter', DEFAULT_ASSUMPTIONS.bauarbeiter))),
    heldenGleichzeitig: Math.min(5, Math.max(1, num('heldenGleichzeitig', DEFAULT_ASSUMPTIONS.heldenGleichzeitig))),
    heldenBelegenBauarbeiter: bool('heldenBelegenBauarbeiter', DEFAULT_ASSUMPTIONS.heldenBelegenBauarbeiter),
    mauernEinrechnen: bool('mauernEinrechnen', DEFAULT_ASSUMPTIONS.mauernEinrechnen),
    aktiveStundenProTag: Math.min(24, Math.max(1, num('aktiveStundenProTag', DEFAULT_ASSUMPTIONS.aktiveStundenProTag))),
  };
}

function writeAssumptions(body: unknown): PlannerAssumptions {
  const raw = (body ?? {}) as Record<string, unknown>;
  const allowed: (keyof PlannerAssumptions)[] = [
    'bauarbeiter', 'heldenGleichzeitig', 'heldenBelegenBauarbeiter', 'mauernEinrechnen', 'aktiveStundenProTag',
  ];

  for (const key of allowed) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value === 'boolean') {
      upsertSetting.run({ key, value: value ? 'true' : 'false' });
    } else {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw AppError.validation(`Annahme "${key}" muss eine Zahl oder ein Wahrheitswert sein.`);
      }
      upsertSetting.run({ key, value: String(parsed) });
    }
  }
  return readAssumptions();
}

export const plannerService = {
  assumptions: readAssumptions,
  saveAssumptions: writeAssumptions,

  inventory(townHallLevel: number): BuildingInventoryEntry[] {
    return inventoryService.list(townHallLevel);
  },

  saveInventory(buildingId: string, body: unknown): void {
    inventoryService.save(buildingId, body);
  },

  resetInventory(): void {
    inventoryService.reset();
  },

  /**
   * Alles, was noch aufgewertet werden kann - die Auswahlliste des Bau-Trackers.
   *
   * Anders als die Vorschlagsliste enthält sie je Gebäudetyp einen Eintrag pro
   * belegter Stufe. Stehen drei Magiertürme auf 13 und zwei auf 15, erscheinen
   * beide Aufwertungen einzeln.
   */
  targets(player: CocPlayer): PlannerTarget[] {
    const th = player.townHallLevel;
    const running = collectRunning();
    const out: PlannerTarget[] = [];

    for (const entry of inventoryService.list(th)) {
      // Das Rathaus kommt aus der API, Mauern kosten keine Bauzeit.
      if (entry.id === 'town-hall' || entry.category === 'mauer') continue;

      const add = (fromLevel: number, count: number | null): void => {
        const toLevel = fromLevel + 1;
        const duration = upgradeTimeService.forBuilding(entry.id, entry.category, toLevel);
        out.push({
          kind: 'building',
          key: entry.id,
          name: entry.name,
          fromLevel,
          toLevel,
          seconds: duration.seconds,
          estimated: duration.estimated,
          buildCategory: 'building',
          count,
          inProgress: running.blocks('building', entry.id, toLevel),
        });
      };

      // Noch nicht gebaute Exemplare starten bei Stufe 0.
      if (entry.missing > 0) add(0, entry.missing);
      for (const { level, count } of entry.levels) {
        if (level < entry.maxLevel) add(level, count);
      }
    }

    for (const group of buildTroopsOverview(player).groups) {
      if (group.category === 'superTroop') continue;

      for (const unit of group.units) {
        if (unit.locked || unit.maxed) continue;

        const isHero = group.category === 'hero';
        const isPet = group.category === 'pet';
        const toLevel = unit.level + 1;
        const duration = isHero
          ? upgradeTimeService.forHero(unit.name, toLevel)
          : isPet
            ? upgradeTimeService.forPet(unit.name, toLevel)
            : upgradeTimeService.forResearch(unit.name, toLevel);

        const kind: PlannerTaskKind = isHero ? 'hero' : 'research';
        out.push({
          kind,
          key: unit.name,
          name: unit.name,
          fromLevel: unit.level,
          toLevel,
          seconds: duration.seconds,
          estimated: duration.estimated,
          buildCategory: isHero ? 'hero' : isPet ? 'pet' : unitBuildCategory(unit.name),
          count: null,
          inProgress: running.blocks(kind, unit.name, toLevel),
        });
      }
    }

    return out.sort((a, b) => a.name.localeCompare(b.name) || a.fromLevel - b.fromLevel);
  },

  compute(player: CocPlayer): PlannerResult {
    return computePlan(player);
  },
};

/** Bau-Kategorie einer Einheit: Zauber und Truppen landen getrennt. */
function unitBuildCategory(unitName: string): BuildCategory {
  switch (unlockService.categoryOfUnit(unitName)) {
    case 'spell':
    case 'darkSpell':
      return 'spell';
    case 'pet':
      return 'pet';
    default:
      return 'troop';
  }
}

/**
 * Was im Bau-Tracker gerade läuft, damit weder der Planer noch die Auswahlliste
 * es erneut anbietet.
 *
 * Ein Eintrag ohne Ziel-Level sperrt die ganze Einheit, weil unklar ist, welche
 * Stufe gemeint ist. Ein Eintrag mit Ziel-Level sperrt nur genau diese Stufe -
 * so lässt sich ein zweiter Magierturm auf einer anderen Stufe parallel bauen.
 */
function collectRunning(): { blocks: (kind: string, key: string, level: number) => boolean } {
  const exact = new Set<string>();
  const whole = new Set<string>();

  for (const build of buildService.list()) {
    // Fertige, aber noch nicht abgehakte Aufwertungen zählen weiter als laufend:
    // der Bestand ist erst nach dem Abhaken nachgezogen.
    if (build.completed) continue;
    if (!build.targetKind || !build.targetKey) continue;

    if (build.targetLevel === null) whole.add(`${build.targetKind}|${build.targetKey}`);
    else exact.add(`${build.targetKind}|${build.targetKey}|${build.targetLevel}`);
  }

  return {
    blocks: (kind, key, level) =>
      exact.has(`${kind}|${key}|${level}`) || whole.has(`${kind}|${key}`),
  };
}

/* -------------------------------------------------------------------------- */
/* Berechnung                                                                  */
/* -------------------------------------------------------------------------- */

function computePlan(player: CocPlayer, options: { taskLimit?: number } = {}): PlannerResult {
  const th = player.townHallLevel;
  const assumptions = readAssumptions();

  // Was im Bau-Tracker gerade läuft, soll der Planer nicht erneut vorschlagen.
  const running = collectRunning();
  const inventory = plannerService.inventory(th);
  const inventoryIsDefault = inventory
    .filter((entry) => entry.id !== 'town-hall')
    .every((entry) => entry.usesDefault);

  // Einheiten, die für die drei empfohlenen Strategien zu schwach sind,
  // bekommen im Planer einen Bonus.
  const advice = strategyService.advise(player, 3);
  const strategyGaps = new Map<string, string>();
  for (const suggestion of advice.suggestions) {
    for (const block of Object.values(suggestion.requirements)) {
      for (const check of block) {
        if (!check.met && !check.optional) {
          strategyGaps.set(check.name, suggestion.rule.shortName);
        }
      }
    }
  }

  const tasks: PlannerTask[] = [];
  let containsEstimates = false;

  /* Gebäude ---------------------------------------------------------------- */
  let builderSeconds = 0;
  let builderOpen = 0;

  for (const entry of inventory) {
    if (entry.category === 'mauer' && !assumptions.mauernEinrechnen) continue;
    builderSeconds += entry.remainingSeconds;
    builderOpen += entry.openUpgrades;

    // Als Nächstes steht das schwächste Exemplar an, das nicht schon läuft.
    const kindForEntry = entry.id === 'town-hall' ? 'townhall' : 'building';
    const stufen = entry.missing > 0
      ? [0, ...entry.levels.map((l) => l.level)]
      : entry.levels.map((l) => l.level);
    const weakest = stufen.find(
      (level) => level < entry.maxLevel && !running.blocks(kindForEntry, entry.id, level + 1),
    );
    if (weakest === undefined) continue;

    const toLevel = weakest + 1;
    const duration = upgradeTimeService.forBuilding(entry.id, entry.category, toLevel);
    if (duration.estimated) containsEstimates = true;

    const reasons: string[] = [];
    if (entry.missing > 0) reasons.push(`${entry.missing} Exemplar(e) noch nicht gebaut`);
    if (entry.category === 'verteidigung') reasons.push('Verteidigungswert');
    if (entry.id === 'laboratory') reasons.push('schaltet höhere Forschungsstufen frei');
    if (entry.id === 'town-hall') reasons.push('Voraussetzung fürs nächste Rathaus');
    reasons.push(`${entry.openUpgrades} Aufwertung(en) offen`);

    tasks.push({
      kind: kindForEntry,
      key: entry.id,
      name: entry.name,
      fromLevel: weakest,
      toLevel,
      seconds: duration.seconds,
      estimated: duration.estimated,
      // Laufendes rutscht ans Ende, es ist ja schon in Arbeit.
      score: entry.priority + (entry.missing > 0 ? 6 : 0),
      reasons,
      slot: 'builder',
      inProgress: false,
    });
  }

  /* Labor und Helden ------------------------------------------------------- */
  const troops = buildTroopsOverview(player);
  let labSeconds = 0;
  let labOpen = 0;
  let heroSeconds = 0;
  let heroOpen = 0;
  let petSeconds = 0;
  let petOpen = 0;

  for (const group of troops.groups) {
    if (group.category === 'superTroop') continue;

    for (const unit of group.units) {
      if (unit.locked || unit.maxed) continue;

      const isHero = group.category === 'hero';
      const isPet = group.category === 'pet';
      const open = unit.maxForTownHall - unit.level;

      let total = 0;
      for (let target = unit.level + 1; target <= unit.maxForTownHall; target += 1) {
        total += isHero
          ? upgradeTimeService.forHero(unit.name, target).seconds
          : isPet
            ? upgradeTimeService.forPet(unit.name, target).seconds
            : upgradeTimeService.forResearch(unit.name, target).seconds;
      }

      if (isHero) {
        heroSeconds += total;
        heroOpen += open;
      } else if (isPet) {
        // Haustiere werden im Haustierhaus aufgewertet, nicht im Labor.
        petSeconds += total;
        petOpen += open;
      } else {
        labSeconds += total;
        labOpen += open;
      }

      const toLevel = unit.level + 1;
      const duration = isHero
        ? upgradeTimeService.forHero(unit.name, toLevel)
        : isPet
          ? upgradeTimeService.forPet(unit.name, toLevel)
          : upgradeTimeService.forResearch(unit.name, toLevel);
      if (duration.estimated) containsEstimates = true;

      const reasons: string[] = [];
      let score = isHero ? 90 : isPet ? 72 : 58;

      const gap = strategyGaps.get(unit.name);
      if (gap) {
        score += 26;
        reasons.push(`fehlt für die empfohlene Strategie ${gap}`);
      }
      if (isHero) reasons.push('Helden wirken in jedem Angriff und jeder Verteidigung');
      reasons.push(`${open} Stufe(n) bis Rathaus-Maximum`);

      const kind = isHero ? 'hero' : 'research';
      const inProgress = running.blocks(kind, unit.name, toLevel);
      if (inProgress) {
        reasons.unshift('läuft bereits im Bau-Tracker');
        score -= 1000;
      }

      tasks.push({
        kind,
        key: unit.name,
        name: unit.name,
        fromLevel: unit.level,
        toLevel,
        seconds: duration.seconds,
        estimated: duration.estimated,
        score,
        reasons,
        slot: isHero ? 'hero' : isPet ? 'pet' : 'lab',
        inProgress,
      });
    }
  }

  /* Kalenderzeit ----------------------------------------------------------- */
  const dayFactor = 24 / assumptions.aktiveStundenProTag;

  const builderSlots = assumptions.bauarbeiter;
  const heroSlots = assumptions.heldenBelegenBauarbeiter
    ? 0 // Helden laufen dann über die Bauarbeiter mit.
    : assumptions.heldenGleichzeitig;

  const builderWork = builderSeconds + (heroSlots === 0 ? heroSeconds : 0);
  const builder: PlannerBacklog = {
    totalSeconds: builderWork,
    calendarSeconds: Math.round((builderWork / builderSlots) * dayFactor),
    openUpgrades: builderOpen + (heroSlots === 0 ? heroOpen : 0),
  };
  const lab: PlannerBacklog = {
    totalSeconds: labSeconds,
    calendarSeconds: Math.round(labSeconds * dayFactor),
    openUpgrades: labOpen,
  };
  const hero: PlannerBacklog = {
    totalSeconds: heroSlots === 0 ? 0 : heroSeconds,
    calendarSeconds: heroSlots === 0 ? 0 : Math.round((heroSeconds / heroSlots) * dayFactor),
    openUpgrades: heroSlots === 0 ? 0 : heroOpen,
  };
  const pet: PlannerBacklog = {
    totalSeconds: petSeconds,
    calendarSeconds: Math.round(petSeconds * dayFactor),
    openUpgrades: petOpen,
  };

  // Die Bereiche laufen parallel, also zählt der längste.
  const maxedInSeconds = Math.max(
    builder.calendarSeconds,
    lab.calendarSeconds,
    hero.calendarSeconds,
    pet.calendarSeconds,
  );
  const now = Date.now();

  const townHallEntry = catalogFor(th).find((c) => c.id === 'town-hall');
  const nextTownHallLevel = townHallEntry && th < 17 ? th + 1 : null;
  const townHallUpgradeSeconds =
    nextTownHallLevel === null
      ? 0
      : upgradeTimeService.forBuilding('town-hall', 'kern', nextTownHallLevel).seconds;

  const scenarios = boostScenarios(tasks, maxedInSeconds, builderSlots, now);

  return {
    townHallLevel: th,
    nextTownHallLevel,
    assumptions,
    inventoryIsDefault,
    tasks: tasks
      .sort((a, b) => b.score - a.score || a.seconds - b.seconds)
      .slice(0, options.taskLimit ?? 12),
    builder,
    lab,
    hero,
    pet,
    maxedInSeconds,
    maxedAt: new Date(now + maxedInSeconds * 1000).toISOString(),
    townHallUpgradeSeconds,
    nextTownHallAt:
      nextTownHallLevel === null
        ? null
        : new Date(now + (maxedInSeconds + townHallUpgradeSeconds) * 1000).toISOString(),
    scenarios,
    containsEstimates,
  };
}

/**
 * Grobe Wirkung von Boostern auf das Fertigdatum.
 *
 * Ein Bauarbeiter-Trank spart bis zu 9 Stunden Arbeitszeit, ein Buch nimmt die
 * längste noch offene Aufwertung komplett heraus. Beides wird durch die Anzahl
 * der Bauarbeiter geteilt, weil sich die Ersparnis auf alle Plätze verteilt.
 */
function boostScenarios(
  tasks: readonly PlannerTask[],
  maxedInSeconds: number,
  builderSlots: number,
  now: number,
): BoostScenario[] {
  const longest = [...tasks]
    .filter((t) => t.slot === 'builder')
    .sort((a, b) => b.seconds - a.seconds)
    .map((t) => t.seconds);

  const scenario = (label: string, savedWorkSeconds: number): BoostScenario => {
    const saved = Math.min(maxedInSeconds, Math.round(savedWorkSeconds / builderSlots));
    return {
      label,
      savedSeconds: saved,
      readyAt: new Date(now + (maxedInSeconds - saved) * 1000).toISOString(),
    };
  };

  const bookSavings = (count: number): number =>
    longest.slice(0, count).reduce((sum, seconds) => sum + seconds, 0);

  return [
    scenario('5 Bauarbeiter-Tränke', 5 * 9 * 3600),
    scenario('10 Bauarbeiter-Tränke', 10 * 9 * 3600),
    scenario('3 Bücher der Gebäude', bookSavings(3)),
    scenario('5 Bücher der Gebäude', bookSavings(5)),
  ];
}
