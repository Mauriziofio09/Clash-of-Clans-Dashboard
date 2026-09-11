/** Ausschnitt der offiziellen Clash-of-Clans-API-Antworten, den dieses Dashboard nutzt. */

export interface CocIconUrls {
  small?: string;
  tiny?: string;
  medium?: string;
  large?: string;
}

export interface CocLeague {
  id: number;
  name: string;
  iconUrls: CocIconUrls;
}

export interface CocPlayerItem {
  name: string;
  level: number;
  maxLevel: number;
  village: 'home' | 'builderBase';
  superTroopIsActive?: boolean;
}

export interface CocPlayerHeroEquipment {
  name: string;
  level: number;
  maxLevel: number;
  village: 'home' | 'builderBase';
}

export interface CocPlayerHero extends CocPlayerItem {
  equipment?: CocPlayerHeroEquipment[];
}

export interface CocPlayerClan {
  tag: string;
  name: string;
  clanLevel: number;
  badgeUrls: CocIconUrls;
}

export interface CocPlayer {
  tag: string;
  name: string;
  townHallLevel: number;
  townHallWeaponLevel?: number;
  expLevel: number;
  trophies: number;
  bestTrophies: number;
  warStars: number;
  attackWins: number;
  defenseWins: number;
  builderHallLevel?: number;
  builderBaseTrophies?: number;
  donations: number;
  donationsReceived: number;
  clanCapitalContributions?: number;
  role?: string;
  warPreference?: 'in' | 'out';
  league?: CocLeague;
  clan?: CocPlayerClan;
  troops: CocPlayerItem[];
  heroes: CocPlayerHero[];
  spells: CocPlayerItem[];
  heroEquipment?: CocPlayerHeroEquipment[];
}

export interface CocClan {
  tag: string;
  name: string;
  type: string;
  description: string;
  clanLevel: number;
  clanPoints: number;
  clanVersusPoints?: number;
  warWins: number;
  warLosses?: number;
  warTies?: number;
  warWinStreak: number;
  warFrequency: string;
  isWarLogPublic: boolean;
  members: number;
  requiredTrophies: number;
  requiredTownhallLevel?: number;
  badgeUrls: CocIconUrls;
  memberList?: CocClanMember[];
}

export interface CocClanMember {
  tag: string;
  name: string;
  role: string;
  expLevel: number;
  trophies: number;
  townHallLevel?: number;
  donations: number;
  donationsReceived: number;
  clanRank: number;
  league?: CocLeague;
}

export interface CocWarAttack {
  attackerTag: string;
  defenderTag: string;
  stars: number;
  destructionPercentage: number;
  order: number;
  duration?: number;
}

export interface CocWarMember {
  tag: string;
  name: string;
  townhallLevel: number;
  mapPosition: number;
  opponentAttacks: number;
  attacks?: CocWarAttack[];
  bestOpponentAttack?: CocWarAttack;
}

export interface CocWarClan {
  tag?: string;
  name?: string;
  clanLevel: number;
  attacks?: number;
  stars: number;
  destructionPercentage: number;
  badgeUrls: CocIconUrls;
  members?: CocWarMember[];
}

export type CocWarState = 'notInWar' | 'preparation' | 'inWar' | 'warEnded';

export interface CocCurrentWar {
  state: CocWarState;
  teamSize?: number;
  attacksPerMember?: number;
  preparationStartTime?: string;
  startTime?: string;
  endTime?: string;
  clan?: CocWarClan;
  opponent?: CocWarClan;
  reason?: string;
}
