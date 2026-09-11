export type WarState = 'notInWar' | 'preparation' | 'inWar' | 'warEnded';

export interface WarSide {
  tag: string | null;
  name: string;
  level: number;
  stars: number;
  destructionPercentage: number;
  attacksUsed: number;
  attacksTotal: number | null;
  badgeUrl: string | null;
}

export interface WarAttackSummary {
  stars: number;
  destructionPercentage: number;
  defenderMapPosition: number | null;
  order: number;
}

export interface WarStatus {
  state: WarState;
  warLogPrivate: boolean;
  teamSize: number | null;
  attacksPerMember: number;
  preparationStartTime: string | null;
  startTime: string | null;
  endTime: string | null;
  clan: WarSide | null;
  opponent: WarSide | null;
  me: {
    inWar: boolean;
    mapPosition: number | null;
    attacksUsed: number;
    attacksRemaining: number;
    attacks: WarAttackSummary[];
  };
}

export interface ClanMemberOverview {
  tag: string;
  name: string;
  role: string;
  trophies: number;
  townHallLevel: number | null;
  donations: number;
  donationsReceived: number;
  leagueIconUrl: string | null;
  isMe: boolean;
}

export interface ClanOverview {
  tag: string;
  name: string;
  description: string;
  type: string;
  level: number;
  points: number;
  members: number;
  requiredTrophies: number;
  warWins: number;
  warLosses: number | null;
  warTies: number | null;
  warWinStreak: number;
  warFrequency: string;
  isWarLogPublic: boolean;
  badgeUrl: string | null;
  topMembers: ClanMemberOverview[];
}
