export interface PlayerOverview {
  tag: string;
  name: string;
  townHallLevel: number;
  townHallWeaponLevel: number | null;
  expLevel: number;
  trophies: number;
  bestTrophies: number;
  warStars: number;
  attackWins: number;
  defenseWins: number;
  donations: number;
  donationsReceived: number;
  role: string | null;
  warPreference: 'in' | 'out' | null;
  league: { id: number; name: string; iconUrl: string | null } | null;
  clan: { tag: string; name: string; level: number; badgeUrl: string | null } | null;
  builderHallLevel: number | null;
  builderBaseTrophies: number | null;
}

export type UnitCategory =
  | 'troop' | 'darkTroop' | 'superTroop' | 'spell' | 'darkSpell' | 'siege' | 'hero' | 'pet';

export interface UnitProgress {
  name: string;
  category: UnitCategory;
  level: number;
  maxForTownHall: number;
  maxOverall: number;
  percent: number;
  maxed: boolean;
  locked: boolean;
  estimated: boolean;
}

export interface UnitGroup {
  category: UnitCategory;
  label: string;
  units: UnitProgress[];
  percent: number;
}

export interface TroopsOverview {
  townHallLevel: number;
  groups: UnitGroup[];
  overallPercent: number;
}

export interface TrophyPoint {
  recordedAt: string;
  trophies: number;
  warStars: number;
  expLevel: number;
}
