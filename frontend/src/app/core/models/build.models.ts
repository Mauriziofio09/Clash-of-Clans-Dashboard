export type BuildCategory = 'building' | 'troop' | 'spell' | 'hero' | 'wall' | 'pet' | 'other';

/** Heimatdorf oder Bauerbasis - entscheidet, welche Booster wirken. */
export type Village = 'home' | 'builder';

export const VILLAGE_LABELS: Readonly<Record<Village, string>> = {
  home: 'Heimatdorf',
  builder: 'Bauerbasis',
};

import type { AppliedBoost } from './boost.models';

export interface BuildEntry {
  id: number;
  name: string;
  category: BuildCategory;
  village: Village;
  /** Verknüpfung zum Planer, damit er laufende Aufwertungen erkennt. */
  targetKind: 'building' | 'research' | 'hero' | 'townhall' | null;
  targetKey: string | null;
  targetLevel: number | null;
  startedAt: string;
  durationSeconds: number;
  builder: string | null;
  notes: string | null;
  completed: boolean;
  acknowledged: boolean;
  createdAt: string;
  updatedAt: string;
  finishesAt: string;
  remainingSeconds: number;
  progressPercent: number;
  finished: boolean;
  /** Angewandte Beschleuniger, chronologisch. */
  boosts: AppliedBoost[];
  /** Fertigstellung ohne jeden Booster. */
  baseFinishesAt: string;
  /** Insgesamt eingesparte Sekunden. */
  savedSeconds: number;
}

export interface BuildPayload {
  name: string;
  category: BuildCategory;
  village: Village;
  targetKind: 'building' | 'research' | 'hero' | 'townhall' | null;
  targetKey: string | null;
  targetLevel: number | null;
  startedAt: string;
  durationSeconds: number;
  builder: string | null;
  notes: string | null;
}

export const BUILD_CATEGORY_LABELS: Readonly<Record<BuildCategory, string>> = {
  building: 'Gebäude',
  troop: 'Truppe (Labor)',
  spell: 'Zauber (Labor)',
  hero: 'Held',
  wall: 'Mauern',
  pet: 'Haustier',
  other: 'Sonstiges',
};
