export type BuildingCategory = 'kern' | 'verteidigung' | 'ressourcen' | 'armee' | 'mauer' | 'falle';

export const BUILDING_CATEGORY_LABELS: Readonly<Record<BuildingCategory, string>> = {
  kern: 'Kern',
  verteidigung: 'Verteidigung',
  armee: 'Armee',
  ressourcen: 'Ressourcen',
  mauer: 'Mauern',
  falle: 'Fallen',
};

export interface InventoryLevelCount {
  level: number;
  count: number;
}

export interface BuildingInventoryEntry {
  id: string;
  name: string;
  category: BuildingCategory;
  priority: number;
  available: number;
  maxLevel: number;
  levels: InventoryLevelCount[];
  entered: number;
  missing: number;
  openUpgrades: number;
  remainingSeconds: number;
  usesDefault: boolean;
}

export type PlannerTaskKind = 'building' | 'research' | 'hero' | 'townhall';

export interface PlannerTask {
  kind: PlannerTaskKind;
  key: string;
  name: string;
  fromLevel: number;
  toLevel: number;
  seconds: number;
  estimated: boolean;
  score: number;
  reasons: string[];
  slot: 'builder' | 'lab' | 'pet' | 'hero';
  /** true, wenn im Bau-Tracker bereits ein laufender Eintrag dazu steht. */
  inProgress: boolean;
}

/** Eine auswählbare Vorlage für einen neuen Eintrag im Bau-Tracker. */
export interface PlannerTarget {
  kind: PlannerTaskKind;
  key: string;
  name: string;
  fromLevel: number;
  toLevel: number;
  seconds: number;
  estimated: boolean;
  buildCategory: 'building' | 'wall' | 'troop' | 'spell' | 'hero' | 'pet' | 'other';
  /** Bei Gebäuden: wie viele Exemplare auf dieser Stufe stehen. */
  count: number | null;
  inProgress: boolean;
}

export interface PlannerAssumptions {
  bauarbeiter: number;
  heldenGleichzeitig: number;
  heldenBelegenBauarbeiter: boolean;
  mauernEinrechnen: boolean;
  aktiveStundenProTag: number;
}

export interface PlannerBacklog {
  totalSeconds: number;
  calendarSeconds: number;
  openUpgrades: number;
}

export interface BoostScenario {
  label: string;
  savedSeconds: number;
  readyAt: string;
}

export interface PlannerResult {
  townHallLevel: number;
  nextTownHallLevel: number | null;
  assumptions: PlannerAssumptions;
  inventoryIsDefault: boolean;
  tasks: PlannerTask[];
  builder: PlannerBacklog;
  lab: PlannerBacklog;
  hero: PlannerBacklog;
  pet: PlannerBacklog;
  maxedInSeconds: number;
  maxedAt: string;
  townHallUpgradeSeconds: number;
  nextTownHallAt: string | null;
  scenarios: BoostScenario[];
  containsEstimates: boolean;
}

export interface TimeOverride {
  scope: PlannerTaskKind;
  key: string;
  level: number;
  seconds: number;
  updatedAt: string;
}
