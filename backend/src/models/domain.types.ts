import type { CocIconUrls, CocWarState } from './coc.types.js';

/** Vereinheitlichte Antwortform aller Endpunkte dieses Backends. */
export interface ApiEnvelope<T> {
  data: T;
  /** Zeitpunkt, zu dem die Daten erzeugt bzw. von der CoC API geholt wurden. */
  fetchedAt: string;
  /** true, wenn die Antwort aus dem lokalen Kurzzeit-Cache stammt. */
  cached: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    hint?: string;
  };
}

/* -------------------------------------------------------------------------- */
/* Spieler                                                                     */
/* -------------------------------------------------------------------------- */

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
  league: {
    id: number;
    name: string;
    iconUrl: string | null;
  } | null;
  clan: {
    tag: string;
    name: string;
    level: number;
    badgeUrl: string | null;
  } | null;
  builderHallLevel: number | null;
  builderBaseTrophies: number | null;
}

/* -------------------------------------------------------------------------- */
/* Truppen / Zauber / Helden                                                   */
/* -------------------------------------------------------------------------- */

export type UnitCategory = 'troop' | 'darkTroop' | 'superTroop' | 'spell' | 'darkSpell' | 'siege' | 'hero' | 'pet';

export interface UnitProgress {
  name: string;
  category: UnitCategory;
  level: number;
  /** Höchstes Level, das beim aktuellen Rathaus-Level erreichbar ist. */
  maxForTownHall: number;
  /** Globales Maximum laut API (über alle Rathaus-Level hinweg). */
  maxOverall: number;
  /** 0-100, bezogen auf maxForTownHall. */
  percent: number;
  /** true, wenn level === maxForTownHall. */
  maxed: boolean;
  /** true, wenn die Einheit beim aktuellen Rathaus noch nicht freigeschaltet ist. */
  locked: boolean;
  /** true, wenn für diese Einheit keine Rathaus-Tabelle hinterlegt ist (Fallback auf maxOverall). */
  estimated: boolean;
}

export interface UnitGroup {
  category: UnitCategory;
  label: string;
  units: UnitProgress[];
  /** Durchschnittlicher Fortschritt der Gruppe in Prozent. */
  percent: number;
}

export interface TroopsOverview {
  townHallLevel: number;
  groups: UnitGroup[];
  /** Gesamtfortschritt über alle Gruppen in Prozent. */
  overallPercent: number;
}

/* -------------------------------------------------------------------------- */
/* Krieg                                                                       */
/* -------------------------------------------------------------------------- */

export interface WarAttackSummary {
  stars: number;
  destructionPercentage: number;
  defenderMapPosition: number | null;
  order: number;
}

export interface WarStatus {
  state: CocWarState;
  /** true, wenn das Kriegslog des Clans privat ist und deshalb keine Daten kommen. */
  warLogPrivate: boolean;
  teamSize: number | null;
  attacksPerMember: number;
  preparationStartTime: string | null;
  startTime: string | null;
  endTime: string | null;
  clan: WarSide | null;
  opponent: WarSide | null;
  /** Angriffs-Situation des konfigurierten Spielers in diesem Krieg. */
  me: {
    inWar: boolean;
    mapPosition: number | null;
    attacksUsed: number;
    attacksRemaining: number;
    attacks: WarAttackSummary[];
  };
}

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
  topMembers: {
    tag: string;
    name: string;
    role: string;
    trophies: number;
    townHallLevel: number | null;
    donations: number;
    donationsReceived: number;
    leagueIconUrl: string | null;
    isMe: boolean;
  }[];
}

/* -------------------------------------------------------------------------- */
/* Bau-Tracker                                                                 */
/* -------------------------------------------------------------------------- */

export type BuildCategory = 'building' | 'troop' | 'spell' | 'hero' | 'wall' | 'pet' | 'other';

/** Heimatdorf oder Bauerbasis - entscheidet, welche Booster überhaupt wirken. */
export type Village = 'home' | 'builder';

export interface BuildEntry {
  id: number;
  name: string;
  category: BuildCategory;
  village: Village;
  /** Verknüpfung zum Planer, damit er laufende Aufwertungen erkennt. */
  targetKind: PlannerTaskKind | null;
  /** Gebäude-Id bzw. Einheiten-/Heldenname der verknüpften Aufwertung. */
  targetKey: string | null;
  /** Ziel-Level des Upgrades, optional. */
  targetLevel: number | null;
  /** ISO-Zeitstempel des Upgrade-Starts. */
  startedAt: string;
  /** Dauer in Sekunden. */
  durationSeconds: number;
  /** Bauarbeiter-Slot bzw. "Labor"/"Haustierhaus" - frei benennbar. */
  builder: string | null;
  notes: string | null;
  /** Vom Nutzer manuell als erledigt markiert. */
  completed: boolean;
  /** Wird vom UI gesetzt, wenn die Fertig-Benachrichtigung quittiert wurde. */
  acknowledged: boolean;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Booster und Tränke                                                          */
/* -------------------------------------------------------------------------- */

export type BoostEffect = 'speedup' | 'instant' | 'skip' | 'battle';

/** Ein Beschleuniger aus der Wissensdatenbank boosts.json. */
export interface BoostDefinition {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  effect: BoostEffect;
  /** Nur bei effect "speedup": Geschwindigkeitsfaktor, z. B. 10. */
  factor?: number;
  /** Nur bei effect "speedup": Wirkdauer in Echtzeit-Sekunden. */
  durationSeconds?: number;
  /** Nur bei effect "skip": der Nutzer gibt die übersprungene Zeit selbst ein. */
  requiresAmount?: boolean;
  /** Hammer sind kostenlos, Bücher nicht. Rein informativ. */
  free?: boolean;
  /** Bau-Kategorien, auf die das Mittel wirkt. Leer = wirkt auf keine Aufwertung. */
  appliesTo: BuildCategory[];
  /** Dorf, in dem das Mittel wirkt. */
  village: Village;
  description: string;
}

/** Ein auf eine konkrete Aufwertung angewandter Beschleuniger. */
export interface AppliedBoost {
  id: number;
  buildId: number;
  boostId: string;
  /** Zeitpunkt der Anwendung als ISO-Zeitstempel. */
  appliedAt: string;
  /** Nur bei effect "skip": übersprungene Sekunden. */
  amountSeconds: number | null;
  createdAt: string;
}

/** AppliedBoost angereichert um Anzeigedaten und die tatsächlich gesparte Zeit. */
export interface AppliedBoostView extends AppliedBoost {
  name: string;
  shortName: string;
  icon: string;
  effect: BoostEffect;
  /** Sekunden, die genau dieser Booster eingespart hat. */
  savedSeconds: number;
}

/** BuildEntry angereichert um die serverseitig berechneten Zeitwerte. */
export interface BuildEntryView extends BuildEntry {
  finishesAt: string;
  remainingSeconds: number;
  /** 0-100 */
  progressPercent: number;
  /** true, sobald finishesAt in der Vergangenheit liegt. */
  finished: boolean;
  /** Angewandte Beschleuniger, chronologisch. */
  boosts: AppliedBoostView[];
  /** Fertigstellung ohne jeden Booster - Bezugspunkt für die Ersparnis. */
  baseFinishesAt: string;
  /** Gesamt eingesparte Sekunden durch alle Booster zusammen. */
  savedSeconds: number;
}

export interface BuildInput {
  name: string;
  category: BuildCategory;
  village: Village;
  targetKind: PlannerTaskKind | null;
  targetKey: string | null;
  targetLevel: number | null;
  startedAt: string;
  durationSeconds: number;
  builder: string | null;
  notes: string | null;
}

/* -------------------------------------------------------------------------- */
/* Strategie                                                                   */
/* -------------------------------------------------------------------------- */

export interface StrategyRequirement {
  /** Name der Einheit exakt wie in der CoC API, z. B. "Electro Dragon". */
  name: string;
  /** Mindestlevel, damit die Anforderung als erfüllt gilt. */
  minLevel: number;
  /** Empfohlene Anzahl in der Armee (nur informativ). */
  count?: number;
  /** Optionale Anforderungen senken die Punktzahl nur leicht, wenn sie fehlen. */
  optional?: boolean;
}

export type StrategyFocus = 'krieg' | 'farmen';

export interface StrategyRule {
  id: string;
  name: string;
  shortName: string;
  minTownHall: number;
  maxTownHall: number;
  difficulty: 'einsteiger' | 'fortgeschritten' | 'experte';
  summary: string;
  troops: StrategyRequirement[];
  spells: StrategyRequirement[];
  sieges: StrategyRequirement[];
  heroes: StrategyRequirement[];
  /** Krieg oder Farmen - wird aus den Tags abgeleitet, wenn nicht gesetzt. */
  focus?: StrategyFocus;
  /** Reihenfolge der Angriffsschritte. */
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
  rule: Omit<StrategyRule, 'troops' | 'spells' | 'sieges' | 'heroes'>;
  /** 0-100 - wie gut die Strategie zum aktuellen Account passt. */
  score: number;
  requirements: {
    troops: RequirementCheck[];
    spells: RequirementCheck[];
    sieges: RequirementCheck[];
    heroes: RequirementCheck[];
  };
  missing: string[];
  underleveled: string[];
  /** Eigene Notiz des Nutzers zu dieser Strategie. */
  note: string | null;
}

export interface StrategyAdvice {
  townHallLevel: number;
  focus: StrategyFocus | 'alle';
  suggestions: StrategySuggestion[];
  /** Strategien, die zum Rathaus passen, aber zu wenig Punkte erreicht haben. */
  alsoConsidered: { id: string; name: string; score: number }[];
}

export interface StrategyNote {
  strategyId: string;
  note: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Upgrade-Planer                                                              */
/* -------------------------------------------------------------------------- */

export type BuildingCategory = 'kern' | 'verteidigung' | 'ressourcen' | 'armee' | 'mauer' | 'falle';

/** Ein Gebäudetyp aus buildings.json, aufgelöst für ein konkretes Rathaus-Level. */
export interface BuildingCatalogEntry {
  id: string;
  name: string;
  category: BuildingCategory;
  /** Grundpriorität 0-100 aus der Wissensdatenbank. */
  priority: number;
  /** Wie viele Exemplare beim aktuellen Rathaus verfügbar sind. */
  available: number;
  /** Höchstlevel beim aktuellen Rathaus. */
  maxLevel: number;
}

/** Wie viele Exemplare eines Gebäudetyps auf welchem Level stehen. */
export interface InventoryLevelCount {
  level: number;
  count: number;
}

export interface BuildingInventoryEntry extends BuildingCatalogEntry {
  levels: InventoryLevelCount[];
  /** Summe aller eingetragenen Exemplare. */
  entered: number;
  /** available minus entered - offen heißt: noch gar nicht gebaut. */
  missing: number;
  /** Verbleibende Aufwertungen bis alle Exemplare auf Rathaus-Maximum sind. */
  openUpgrades: number;
  /** Restzeit in Sekunden für alle offenen Aufwertungen dieses Typs. */
  remainingSeconds: number;
  /** true, wenn für diesen Typ noch nichts eingetragen wurde. */
  usesDefault: boolean;
}

export type PlannerTaskKind = 'building' | 'research' | 'hero' | 'townhall';

/** Ein konkreter Vorschlag "das als Nächstes ausbauen". */
export interface PlannerTask {
  kind: PlannerTaskKind;
  /** Gebäude-Id bzw. Einheiten-/Heldenname. */
  key: string;
  name: string;
  fromLevel: number;
  toLevel: number;
  seconds: number;
  /** true, wenn die Zeit aus der Näherungskurve stammt statt aus einem geprüften Wert. */
  estimated: boolean;
  score: number;
  reasons: string[];
  /** Belegt die Aufgabe einen Bauarbeiter, das Labor, das Haustierhaus oder einen Heldenplatz? */
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
  /** Kategorie, unter der der Eintrag im Bau-Tracker landet. */
  buildCategory: BuildCategory;
  /** Bei Gebäuden: wie viele Exemplare auf dieser Stufe stehen. */
  count: number | null;
  inProgress: boolean;
}

export interface PlannerAssumptions {
  /** Anzahl der Bauarbeiter. */
  bauarbeiter: number;
  /** Wie viele Helden gleichzeitig aufgewertet werden können. */
  heldenGleichzeitig: number;
  /** Belegen Helden-Aufwertungen einen Bauarbeiter? */
  heldenBelegenBauarbeiter: boolean;
  /** Mauern in die Restzeit einrechnen? Mauern kosten keine Zeit, nur Ressourcen. */
  mauernEinrechnen: boolean;
  /** Stunden pro Tag, die tatsächlich gebaut wird - 24 heißt durchgehend. */
  aktiveStundenProTag: number;
}

export interface PlannerBacklog {
  /** Restzeit aller offenen Aufwertungen dieses Bereichs in Sekunden. */
  totalSeconds: number;
  /** Auf die verfügbaren Plätze verteilte Kalenderzeit in Sekunden. */
  calendarSeconds: number;
  openUpgrades: number;
}

/** Wirkung eines Boosterpakets auf das voraussichtliche Fertigdatum. */
export interface BoostScenario {
  label: string;
  /** Eingesparte Sekunden gegenüber der Rechnung ohne Booster. */
  savedSeconds: number;
  readyAt: string;
}

export interface PlannerResult {
  townHallLevel: number;
  /** Rathaus-Level, auf das als Nächstes ausgebaut werden kann. */
  nextTownHallLevel: number | null;
  assumptions: PlannerAssumptions;
  /** true, solange kein einziges Gebäude von Hand erfasst wurde. */
  inventoryIsDefault: boolean;
  tasks: PlannerTask[];
  builder: PlannerBacklog;
  lab: PlannerBacklog;
  hero: PlannerBacklog;
  /** Haustiere laufen im Haustierhaus, also unabhängig vom Labor. */
  pet: PlannerBacklog;
  /** Kalenderzeit, bis auf diesem Rathaus alles fertig ist. */
  maxedInSeconds: number;
  maxedAt: string;
  /** Dauer der Rathaus-Aufwertung selbst. */
  townHallUpgradeSeconds: number;
  /** Zeitpunkt, ab dem der Wechsel aufs nächste Rathaus sinnvoll ist. */
  nextTownHallAt: string | null;
  scenarios: BoostScenario[];
  /** true, wenn mindestens eine Zeit aus der Näherungskurve stammt. */
  containsEstimates: boolean;
}

export interface TimeOverride {
  scope: PlannerTaskKind;
  key: string;
  level: number;
  seconds: number;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Meta                                                                        */
/* -------------------------------------------------------------------------- */

export interface DashboardConfigInfo {
  playerTag: string;
  clanTag: string | null;
  refreshIntervalSeconds: number;
  cacheTtlSeconds: number;
}

export interface HealthInfo {
  status: 'ok' | 'degraded';
  cocApiReachable: boolean;
  message: string;
  serverTime: string;
}

export type { CocIconUrls, CocWarState };
