import { db } from '../db/database.js';
import { AppError } from '../utils/AppError.js';
import { boostService, calculateFinish, savingsOf, type BoostApplication } from './boost.service.js';
import { inventoryService } from './inventory.service.js';
import type {
  AppliedBoost,
  AppliedBoostView,
  BuildCategory,
  BuildEntry,
  BuildEntryView,
  BuildInput,
  PlannerTaskKind,
  Village,
} from '../models/domain.types.js';

/** Rohzeile der Tabelle `builds`, wie better-sqlite3 sie zurückgibt. */
interface BuildRow {
  id: number;
  name: string;
  category: string;
  village: string;
  target_kind: string | null;
  target_key: string | null;
  target_level: number | null;
  started_at: string;
  duration_seconds: number;
  builder: string | null;
  notes: string | null;
  completed: number;
  acknowledged: number;
  created_at: string;
  updated_at: string;
}

const CATEGORIES: readonly BuildCategory[] = ['building', 'troop', 'spell', 'hero', 'wall', 'pet', 'other'];
const VILLAGES: readonly Village[] = ['home', 'builder'];
const TARGET_KINDS: readonly PlannerTaskKind[] = ['building', 'research', 'hero', 'townhall'];

function toEntry(row: BuildRow): BuildEntry {
  return {
    id: row.id,
    name: row.name,
    category: (CATEGORIES as readonly string[]).includes(row.category)
      ? (row.category as BuildCategory)
      : 'other',
    village: (VILLAGES as readonly string[]).includes(row.village) ? (row.village as Village) : 'home',
    targetKind:
      row.target_kind && (TARGET_KINDS as readonly string[]).includes(row.target_kind)
        ? (row.target_kind as PlannerTaskKind)
        : null,
    targetKey: row.target_key,
    targetLevel: row.target_level,
    startedAt: row.started_at,
    durationSeconds: row.duration_seconds,
    builder: row.builder,
    notes: row.notes,
    completed: row.completed === 1,
    acknowledged: row.acknowledged === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Rohzeile der Tabelle `build_boosts`. */
interface BoostRow {
  id: number;
  build_id: number;
  boost_id: string;
  applied_at: string;
  amount_seconds: number | null;
  created_at: string;
}

function toAppliedBoost(row: BoostRow): AppliedBoost {
  return {
    id: row.id,
    buildId: row.build_id,
    boostId: row.boost_id,
    appliedAt: row.applied_at,
    amountSeconds: row.amount_seconds,
    createdAt: row.created_at,
  };
}

/**
 * Ergänzt die abgeleiteten Zeitwerte, damit das Frontend nur noch herunterzählen
 * muss. Die Fertigstellung berücksichtigt alle angewandten Beschleuniger.
 */
export function toView(entry: BuildEntry, applied: AppliedBoost[], now = Date.now()): BuildEntryView {
  const startMs = Date.parse(entry.startedAt);

  const applications: BoostApplication[] = applied.map((boost) => ({
    boostId: boost.boostId,
    appliedAtMs: Date.parse(boost.appliedAt),
    amountSeconds: boost.amountSeconds,
  }));

  const { finishMs, baseFinishMs, savedSeconds } = calculateFinish(
    startMs,
    entry.durationSeconds,
    applications,
  );

  const remainingSeconds = Math.max(0, Math.round((finishMs - now) / 1000));
  const span = Math.max(1, finishMs - startMs);
  const progressPercent = Math.min(100, Math.max(0, Math.round(((now - startMs) / span) * 100)));

  const boosts: AppliedBoostView[] = applied.map((boost, index) => {
    const definition = boostService.list().find((b) => b.id === boost.boostId);
    return {
      ...boost,
      name: definition?.name ?? boost.boostId,
      shortName: definition?.shortName ?? boost.boostId,
      icon: definition?.icon ?? 'bolt',
      effect: definition?.effect ?? 'skip',
      savedSeconds: savingsOf(startMs, entry.durationSeconds, applications, index),
    };
  });

  return {
    ...entry,
    finishesAt: new Date(finishMs).toISOString(),
    baseFinishesAt: new Date(baseFinishMs).toISOString(),
    remainingSeconds,
    progressPercent,
    finished: remainingSeconds === 0,
    savedSeconds,
    boosts,
  };
}

function validate(input: unknown): BuildInput {
  if (typeof input !== 'object' || input === null) {
    throw AppError.validation('Request-Body fehlt oder ist kein Objekt.');
  }
  const raw = input as Record<string, unknown>;

  const name = typeof raw['name'] === 'string' ? raw['name'].trim() : '';
  if (!name) throw AppError.validation('Feld "name" ist erforderlich.');
  if (name.length > 120) throw AppError.validation('Feld "name" darf höchstens 120 Zeichen lang sein.');

  const category = typeof raw['category'] === 'string' ? raw['category'] : 'building';
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    throw AppError.validation(`Feld "category" muss einer von: ${CATEGORIES.join(', ')} sein.`);
  }

  const village = typeof raw['village'] === 'string' && raw['village'] ? raw['village'] : 'home';
  if (!(VILLAGES as readonly string[]).includes(village)) {
    throw AppError.validation('Feld "village" muss home oder builder sein.');
  }

  // Optionale Verknüpfung zum Planer. Nur beide Felder zusammen ergeben Sinn.
  const targetKindRaw = typeof raw['targetKind'] === 'string' ? raw['targetKind'] : '';
  const targetKeyRaw = typeof raw['targetKey'] === 'string' ? raw['targetKey'].trim() : '';
  if (targetKindRaw && !(TARGET_KINDS as readonly string[]).includes(targetKindRaw)) {
    throw AppError.validation(`Feld "targetKind" muss einer von: ${TARGET_KINDS.join(', ')} sein.`);
  }
  const targetKind = targetKindRaw && targetKeyRaw ? (targetKindRaw as PlannerTaskKind) : null;
  const targetKey = targetKind ? targetKeyRaw.slice(0, 120) : null;

  const durationSeconds = Number(raw['durationSeconds']);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw AppError.validation('Feld "durationSeconds" muss eine positive Zahl sein.');
  }
  if (durationSeconds > 60 * 60 * 24 * 60) {
    throw AppError.validation('Feld "durationSeconds" darf höchstens 60 Tage betragen.');
  }

  const startedAtRaw = typeof raw['startedAt'] === 'string' && raw['startedAt'] ? raw['startedAt'] : new Date().toISOString();
  const startedAtMs = Date.parse(startedAtRaw);
  if (Number.isNaN(startedAtMs)) {
    throw AppError.validation('Feld "startedAt" muss ein gültiger ISO-Zeitstempel sein.');
  }

  const targetLevelRaw = raw['targetLevel'];
  let targetLevel: number | null = null;
  if (targetLevelRaw !== null && targetLevelRaw !== undefined && targetLevelRaw !== '') {
    const parsed = Number(targetLevelRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw AppError.validation('Feld "targetLevel" muss eine ganze Zahl zwischen 1 und 100 sein.');
    }
    targetLevel = parsed;
  }

  return {
    name,
    category: category as BuildCategory,
    village: village as Village,
    targetKind,
    targetKey,
    targetLevel,
    startedAt: new Date(startedAtMs).toISOString(),
    durationSeconds: Math.round(durationSeconds),
    builder: typeof raw['builder'] === 'string' && raw['builder'].trim() ? raw['builder'].trim().slice(0, 60) : null,
    notes: typeof raw['notes'] === 'string' && raw['notes'].trim() ? raw['notes'].trim().slice(0, 500) : null,
  };
}

const selectAll = db.prepare<[], BuildRow>(
  'SELECT * FROM builds ORDER BY completed ASC, (julianday(started_at) * 86400 + duration_seconds) ASC',
);
const selectById = db.prepare<[number], BuildRow>('SELECT * FROM builds WHERE id = ?');
const insertStmt = db.prepare(`
  INSERT INTO builds (name, category, village, target_kind, target_key, target_level, started_at, duration_seconds, builder, notes, created_at, updated_at)
  VALUES (@name, @category, @village, @targetKind, @targetKey, @targetLevel, @startedAt, @durationSeconds, @builder, @notes, @now, @now)
`);
const updateStmt = db.prepare(`
  UPDATE builds
     SET name = @name, category = @category, village = @village, target_kind = @targetKind,
         target_key = @targetKey, target_level = @targetLevel, started_at = @startedAt,
         duration_seconds = @durationSeconds, builder = @builder, notes = @notes, updated_at = @now
   WHERE id = @id
`);
const deleteStmt = db.prepare('DELETE FROM builds WHERE id = ?');
const deleteCompletedStmt = db.prepare('DELETE FROM builds WHERE completed = 1');
const selectBoosts = db.prepare<[number], BoostRow>(
  'SELECT * FROM build_boosts WHERE build_id = ? ORDER BY applied_at ASC, id ASC',
);
const selectAllBoosts = db.prepare<[], BoostRow>(
  'SELECT * FROM build_boosts ORDER BY applied_at ASC, id ASC',
);
const insertBoost = db.prepare(`
  INSERT INTO build_boosts (build_id, boost_id, applied_at, amount_seconds, created_at)
  VALUES (@buildId, @boostId, @appliedAt, @amountSeconds, @now)
`);
const deleteBoost = db.prepare('DELETE FROM build_boosts WHERE id = ? AND build_id = ?');
const setFlagsStmt = db.prepare(
  'UPDATE builds SET completed = @completed, acknowledged = @acknowledged, updated_at = @now WHERE id = @id',
);

export const buildService = {
  list(): BuildEntryView[] {
    const now = Date.now();

    // Alle Booster in einem Rutsch holen und im Speicher zuordnen, statt pro
    // Eintrag eine eigene Abfrage abzusetzen.
    const boostsByBuild = new Map<number, AppliedBoost[]>();
    for (const row of selectAllBoosts.all()) {
      const list = boostsByBuild.get(row.build_id) ?? [];
      list.push(toAppliedBoost(row));
      boostsByBuild.set(row.build_id, list);
    }

    return selectAll
      .all()
      .map((row) => toView(toEntry(row), boostsByBuild.get(row.id) ?? [], now))
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.remainingSeconds - b.remainingSeconds;
      });
  },

  get(id: number): BuildEntryView {
    const row = selectById.get(id);
    if (!row) throw AppError.notFound(`Kein Bau-Eintrag mit der ID ${id} gefunden.`);
    return toView(toEntry(row), selectBoosts.all(id).map(toAppliedBoost));
  },

  /** Trägt einen angewandten Beschleuniger nach und liefert den neuen Stand. */
  addBoost(buildId: number, body: unknown): BuildEntryView {
    const row = selectById.get(buildId);
    if (!row) throw AppError.notFound(`Kein Bau-Eintrag mit der ID ${buildId} gefunden.`);

    const raw = (body ?? {}) as Record<string, unknown>;
    const boostId = typeof raw['boostId'] === 'string' ? raw['boostId'].trim() : '';
    if (!boostId) throw AppError.validation('Feld "boostId" ist erforderlich.');

    const entry = toEntry(row);
    const definition = boostService.assertApplicable(boostId, entry.category, entry.village);

    const appliedAtRaw =
      typeof raw['appliedAt'] === 'string' && raw['appliedAt']
        ? raw['appliedAt']
        : new Date().toISOString();
    const appliedAtMs = Date.parse(appliedAtRaw);
    if (Number.isNaN(appliedAtMs)) {
      throw AppError.validation('Feld "appliedAt" muss ein gültiger ISO-Zeitstempel sein.');
    }

    let amountSeconds: number | null = null;
    if (definition.requiresAmount) {
      const parsed = Number(raw['amountSeconds']);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw AppError.validation(
          `Für "${definition.name}" muss "amountSeconds" die übersprungene Zeit in Sekunden enthalten.`,
        );
      }
      amountSeconds = Math.round(parsed);
    }

    insertBoost.run({
      buildId,
      boostId,
      appliedAt: new Date(appliedAtMs).toISOString(),
      amountSeconds,
      now: new Date().toISOString(),
    });

    return this.get(buildId);
  },

  /** Nimmt einen angewandten Beschleuniger zurück. */
  removeBoost(buildId: number, boostRowId: number): BuildEntryView {
    const result = deleteBoost.run(boostRowId, buildId);
    if (result.changes === 0) {
      throw AppError.notFound(`Kein angewandter Beschleuniger mit der ID ${boostRowId} gefunden.`);
    }
    return this.get(buildId);
  },

  create(body: unknown): BuildEntryView {
    const input = validate(body);
    const result = insertStmt.run({ ...input, now: new Date().toISOString() });
    return this.get(Number(result.lastInsertRowid));
  },

  update(id: number, body: unknown): BuildEntryView {
    if (!selectById.get(id)) throw AppError.notFound(`Kein Bau-Eintrag mit der ID ${id} gefunden.`);
    const input = validate(body);
    updateStmt.run({ ...input, id, now: new Date().toISOString() });
    return this.get(id);
  },

  /** Setzt die Status-Flags (erledigt / Benachrichtigung quittiert) einzeln. */
  patchFlags(id: number, flags: { completed?: unknown; acknowledged?: unknown }): BuildEntryView {
    const existing = selectById.get(id);
    if (!existing) throw AppError.notFound(`Kein Bau-Eintrag mit der ID ${id} gefunden.`);

    const completed = flags.completed === undefined ? existing.completed === 1 : Boolean(flags.completed);
    const acknowledged =
      flags.acknowledged === undefined ? existing.acknowledged === 1 : Boolean(flags.acknowledged);

    // Beim Abhaken einer verknüpften Gebäude-Aufwertung wandert ein Exemplar im
    // Bestand eine Stufe hoch. Truppen, Zauber und Helden brauchen das nicht,
    // ihre Level kommen beim nächsten Abruf aus der Spiele-API.
    const entry = toEntry(existing);
    const justCompleted = completed && existing.completed === 0;
    if (justCompleted && entry.targetKind === 'building' && entry.targetKey && entry.targetLevel) {
      inventoryService.applyCompletedUpgrade(entry.targetKey, entry.targetLevel);
    }

    setFlagsStmt.run({
      id,
      completed: completed ? 1 : 0,
      acknowledged: acknowledged ? 1 : 0,
      now: new Date().toISOString(),
    });
    return this.get(id);
  },

  remove(id: number): void {
    const result = deleteStmt.run(id);
    if (result.changes === 0) throw AppError.notFound(`Kein Bau-Eintrag mit der ID ${id} gefunden.`);
  },

  removeCompleted(): number {
    return deleteCompletedStmt.run().changes;
  },
};
