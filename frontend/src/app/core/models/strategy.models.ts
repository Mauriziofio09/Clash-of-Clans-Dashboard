export type StrategyDifficulty = 'einsteiger' | 'fortgeschritten' | 'experte';
export type StrategyFocus = 'krieg' | 'farmen';

export interface StrategyRuleMeta {
  id: string;
  name: string;
  shortName: string;
  minTownHall: number;
  maxTownHall: number;
  difficulty: StrategyDifficulty;
  focus: StrategyFocus;
  summary: string;
  steps: string[];
  tips: string[];
  tags: string[];
}

export interface RequirementCheck {
  name: string;
  required: number;
  actual: number;
  met: boolean;
  optional: boolean;
  count: number | null;
}

export interface StrategySuggestion {
  rule: StrategyRuleMeta;
  score: number;
  requirements: {
    troops: RequirementCheck[];
    spells: RequirementCheck[];
    sieges: RequirementCheck[];
    heroes: RequirementCheck[];
  };
  missing: string[];
  underleveled: string[];
  note: string | null;
}

export interface StrategyAdvice {
  townHallLevel: number;
  focus: StrategyFocus | 'alle';
  suggestions: StrategySuggestion[];
  alsoConsidered: { id: string; name: string; score: number }[];
}

export interface DashboardConfigInfo {
  playerTag: string;
  clanTag: string | null;
  refreshIntervalSeconds: number;
  cacheTtlSeconds: number;
}
