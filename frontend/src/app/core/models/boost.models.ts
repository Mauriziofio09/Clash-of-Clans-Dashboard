import type { BuildCategory, Village } from './build.models';

export type BoostEffect = 'speedup' | 'instant' | 'skip' | 'battle';

/** Ein Beschleuniger aus der Wissensdatenbank des Backends. */
export interface BoostDefinition {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  effect: BoostEffect;
  factor?: number;
  durationSeconds?: number;
  requiresAmount?: boolean;
  free?: boolean;
  appliesTo: BuildCategory[];
  village: Village;
  description: string;
}

/** Ein auf eine Aufwertung angewandter Beschleuniger samt Ersparnis. */
export interface AppliedBoost {
  id: number;
  buildId: number;
  boostId: string;
  appliedAt: string;
  amountSeconds: number | null;
  createdAt: string;
  name: string;
  shortName: string;
  icon: string;
  effect: BoostEffect;
  savedSeconds: number;
}
