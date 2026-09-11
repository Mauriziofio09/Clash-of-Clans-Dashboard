import { db } from '../db/database.js';
import type { CocClan, CocCurrentWar, CocPlayer } from '../models/coc.types.js';
import type { ClanOverview, PlayerOverview, WarSide, WarStatus } from '../models/domain.types.js';

/** Wandelt die CoC-Spielerantwort in die schlanke Form für das Dashboard um. */
export function toPlayerOverview(player: CocPlayer): PlayerOverview {
  return {
    tag: player.tag,
    name: player.name,
    townHallLevel: player.townHallLevel,
    townHallWeaponLevel: player.townHallWeaponLevel ?? null,
    expLevel: player.expLevel,
    trophies: player.trophies,
    bestTrophies: player.bestTrophies,
    warStars: player.warStars,
    attackWins: player.attackWins,
    defenseWins: player.defenseWins,
    donations: player.donations,
    donationsReceived: player.donationsReceived,
    role: player.role ?? null,
    warPreference: player.warPreference ?? null,
    league: player.league
      ? {
          id: player.league.id,
          name: player.league.name,
          iconUrl: player.league.iconUrls.medium ?? player.league.iconUrls.small ?? null,
        }
      : null,
    clan: player.clan
      ? {
          tag: player.clan.tag,
          name: player.clan.name,
          level: player.clan.clanLevel,
          badgeUrl: player.clan.badgeUrls.medium ?? player.clan.badgeUrls.small ?? null,
        }
      : null,
    builderHallLevel: player.builderHallLevel ?? null,
    builderBaseTrophies: player.builderBaseTrophies ?? null,
  };
}

export function toClanOverview(clan: CocClan, myTag: string): ClanOverview {
  const members = [...(clan.memberList ?? [])].sort((a, b) => a.clanRank - b.clanRank);
  return {
    tag: clan.tag,
    name: clan.name,
    description: clan.description,
    type: clan.type,
    level: clan.clanLevel,
    points: clan.clanPoints,
    members: clan.members,
    requiredTrophies: clan.requiredTrophies,
    warWins: clan.warWins,
    warLosses: clan.warLosses ?? null,
    warTies: clan.warTies ?? null,
    warWinStreak: clan.warWinStreak,
    warFrequency: clan.warFrequency,
    isWarLogPublic: clan.isWarLogPublic,
    badgeUrl: clan.badgeUrls.medium ?? clan.badgeUrls.small ?? null,
    topMembers: members.slice(0, 15).map((m) => ({
      tag: m.tag,
      name: m.name,
      role: m.role,
      trophies: m.trophies,
      townHallLevel: m.townHallLevel ?? null,
      donations: m.donations,
      donationsReceived: m.donationsReceived,
      leagueIconUrl: m.league?.iconUrls.small ?? m.league?.iconUrls.tiny ?? null,
      isMe: m.tag.toUpperCase() === myTag.toUpperCase(),
    })),
  };
}

function toWarSide(side: CocCurrentWar['clan'], attacksPerMember: number, teamSize: number | null): WarSide | null {
  if (!side) return null;
  const attacksUsed =
    side.attacks ?? (side.members ?? []).reduce((sum, m) => sum + (m.attacks?.length ?? 0), 0);
  return {
    tag: side.tag ?? null,
    name: side.name ?? 'Unbekannt',
    level: side.clanLevel,
    stars: side.stars,
    destructionPercentage: Math.round(side.destructionPercentage * 100) / 100,
    attacksUsed,
    attacksTotal: teamSize !== null ? teamSize * attacksPerMember : null,
    badgeUrl: side.badgeUrls.medium ?? side.badgeUrls.small ?? null,
  };
}

/** Baut den Kriegsstatus inklusive der offenen Angriffe des eigenen Spielers. */
export function toWarStatus(war: CocCurrentWar, myTag: string): WarStatus {
  const attacksPerMember = war.attacksPerMember ?? 2;
  const teamSize = war.teamSize ?? null;
  const normalizedTag = myTag.toUpperCase();

  const me = (war.clan?.members ?? []).find((m) => m.tag.toUpperCase() === normalizedTag);
  const myAttacks = me?.attacks ?? [];

  const positionByTag = new Map<string, number>();
  for (const member of war.opponent?.members ?? []) {
    positionByTag.set(member.tag.toUpperCase(), member.mapPosition);
  }

  return {
    state: war.state,
    warLogPrivate: false,
    teamSize,
    attacksPerMember,
    preparationStartTime: toIso(war.preparationStartTime),
    startTime: toIso(war.startTime),
    endTime: toIso(war.endTime),
    clan: toWarSide(war.clan, attacksPerMember, teamSize),
    opponent: toWarSide(war.opponent, attacksPerMember, teamSize),
    me: {
      inWar: me !== undefined,
      mapPosition: me?.mapPosition ?? null,
      attacksUsed: myAttacks.length,
      attacksRemaining: me ? Math.max(0, attacksPerMember - myAttacks.length) : 0,
      attacks: myAttacks
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((a) => ({
          stars: a.stars,
          destructionPercentage: a.destructionPercentage,
          defenderMapPosition: positionByTag.get(a.defenderTag.toUpperCase()) ?? null,
          order: a.order,
        })),
    },
  };
}

/** Platzhalter-Status, wenn gerade kein Krieg läuft oder das Kriegslog privat ist. */
export function emptyWarStatus(warLogPrivate: boolean): WarStatus {
  return {
    state: 'notInWar',
    warLogPrivate,
    teamSize: null,
    attacksPerMember: 2,
    preparationStartTime: null,
    startTime: null,
    endTime: null,
    clan: null,
    opponent: null,
    me: { inWar: false, mapPosition: null, attacksUsed: 0, attacksRemaining: 0, attacks: [] },
  };
}

/**
 * Die CoC API liefert Zeitstempel im Format 20240101T120000.000Z, das
 * `new Date()` nicht versteht. Hier wird daraus gültiges ISO-8601.
 */
function toIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z$/.exec(raw);
  if (!match) {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  const [, y, mo, d, h, mi, s, ms] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
}

const insertHistory = db.prepare(`
  INSERT INTO trophy_history (recorded_at, trophies, town_hall, war_stars, exp_level)
  VALUES (@recordedAt, @trophies, @townHall, @warStars, @expLevel)
  ON CONFLICT(recorded_at) DO UPDATE SET
    trophies = @trophies, town_hall = @townHall, war_stars = @warStars, exp_level = @expLevel
`);
const selectHistory = db.prepare<[number], { recorded_at: string; trophies: number; war_stars: number; exp_level: number }>(
  'SELECT * FROM trophy_history ORDER BY recorded_at DESC LIMIT ?',
);

export interface TrophyPoint {
  recordedAt: string;
  trophies: number;
  warStars: number;
  expLevel: number;
}

/**
 * Schreibt höchstens einen Messpunkt pro Stunde mit, damit der Trophäen-Verlauf
 * über die Zeit wächst, ohne die Datenbank vollzuschreiben.
 */
export function recordSnapshot(player: CocPlayer): void {
  const bucket = new Date();
  bucket.setUTCMinutes(0, 0, 0);
  insertHistory.run({
    recordedAt: bucket.toISOString(),
    trophies: player.trophies,
    townHall: player.townHallLevel,
    warStars: player.warStars,
    expLevel: player.expLevel,
  });
}

export function getHistory(limit = 168): TrophyPoint[] {
  return selectHistory
    .all(limit)
    .map((row) => ({
      recordedAt: row.recorded_at,
      trophies: row.trophies,
      warStars: row.war_stars,
      expLevel: row.exp_level,
    }))
    .reverse();
}
