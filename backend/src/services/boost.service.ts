import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../utils/AppError.js';
import type { BoostDefinition, BuildCategory, Village } from '../models/domain.types.js';

interface BoostFile {
  meta: Record<string, unknown>;
  boosts: BoostDefinition[];
}

const here = path.dirname(fileURLToPath(import.meta.url));

function loadBoosts(): BoostDefinition[] {
  const candidates = [
    path.resolve(here, '../data/boosts.json'),
    path.resolve(here, '../../src/data/boosts.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return (JSON.parse(fs.readFileSync(candidate, 'utf8')) as BoostFile).boosts;
    }
  }
  throw new Error(`boosts.json nicht gefunden. Gesucht in: ${candidates.join(', ')}`);
}

const boosts: readonly BoostDefinition[] = loadBoosts();
const byId = new Map(boosts.map((b) => [b.id, b]));

/** Ein Booster, wie ihn die Zeitrechnung braucht. */
export interface BoostApplication {
  boostId: string;
  appliedAtMs: number;
  amountSeconds: number | null;
}

export interface FinishCalculation {
  /** Fertigstellung inklusive aller Booster. */
  finishMs: number;
  /** Fertigstellung, als wäre kein Booster angewandt worden. */
  baseFinishMs: number;
  /** Eingesparte Sekunden insgesamt. */
  savedSeconds: number;
}

/**
 * Berechnet den Fertigstellungszeitpunkt einer Aufwertung unter Berücksichtigung
 * aller angewandten Beschleuniger.
 *
 * Modell: Eine Aufwertung braucht `durationSeconds` an Arbeit. Normalerweise
 * entsteht pro Echtzeitsekunde eine Arbeitssekunde. Ein speedup-Booster hebt
 * diesen Faktor für seine Wirkdauer an, ein skip-Booster schreibt einmalig
 * Arbeit gut, ein instant-Booster beendet sofort.
 *
 * Überlappen sich mehrere speedup-Booster, gilt der höchste Faktor - sie
 * multiplizieren sich nicht, so wie im Spiel auch.
 */
export function calculateFinish(
  startMs: number,
  durationSeconds: number,
  applications: readonly BoostApplication[],
): FinishCalculation {
  const baseFinishMs = startMs + durationSeconds * 1000;
  if (applications.length === 0 || durationSeconds <= 0) {
    return { finishMs: baseFinishMs, baseFinishMs, savedSeconds: 0 };
  }

  const finishMs = simulate(startMs, durationSeconds, applications);
  return {
    finishMs,
    baseFinishMs,
    savedSeconds: Math.max(0, Math.round((baseFinishMs - finishMs) / 1000)),
  };
}

/**
 * Ersparnis eines einzelnen Boosters: Differenz zwischen der Rechnung mit allen
 * Boostern und der Rechnung ohne genau diesen einen.
 */
export function savingsOf(
  startMs: number,
  durationSeconds: number,
  applications: readonly BoostApplication[],
  index: number,
): number {
  const withAll = simulate(startMs, durationSeconds, applications);
  const without = simulate(
    startMs,
    durationSeconds,
    applications.filter((_, i) => i !== index),
  );
  return Math.max(0, Math.round((without - withAll) / 1000));
}

interface Speedup {
  fromMs: number;
  toMs: number;
  factor: number;
}

function simulate(
  startMs: number,
  durationSeconds: number,
  applications: readonly BoostApplication[],
): number {
  const speedups: Speedup[] = [];
  /** Einmalige Arbeitsgutschriften: [Zeitpunkt, Arbeitssekunden]. */
  const credits: [number, number][] = [];
  let earliestInstantMs: number | null = null;

  for (const application of applications) {
    const definition = byId.get(application.boostId);
    if (!definition) continue;

    // Vor dem Start angewandte Booster wirken frühestens ab dem Start.
    const appliedAtMs = Math.max(startMs, application.appliedAtMs);

    if (definition.effect === 'instant') {
      earliestInstantMs =
        earliestInstantMs === null ? appliedAtMs : Math.min(earliestInstantMs, appliedAtMs);
    } else if (definition.effect === 'speedup') {
      const factor = definition.factor ?? 1;
      const durationMs = (definition.durationSeconds ?? 0) * 1000;
      if (factor > 1 && durationMs > 0) {
        speedups.push({ fromMs: appliedAtMs, toMs: appliedAtMs + durationMs, factor });
      }
    } else if (definition.effect === 'skip') {
      const amount = application.amountSeconds ?? 0;
      if (amount > 0) credits.push([appliedAtMs, amount]);
    }
    // "battle" wirkt nicht auf Bauzeiten und wird bewusst ignoriert.
  }

  // Zeitachse in Abschnitte zerlegen, in denen der Faktor konstant ist.
  const boundaries = new Set<number>([startMs]);
  for (const s of speedups) {
    boundaries.add(s.fromMs);
    boundaries.add(s.toMs);
  }
  for (const [at] of credits) boundaries.add(at);
  const sorted = [...boundaries].sort((a, b) => a - b);

  let work = 0;
  let finishMs: number | null = null;

  for (let i = 0; i < sorted.length && finishMs === null; i += 1) {
    const from = sorted[i]!;

    for (const [at, amount] of credits) {
      if (at === from) work += amount;
    }
    if (work >= durationSeconds) {
      finishMs = from;
      break;
    }

    const to = sorted[i + 1];
    const factor = factorAt(speedups, from);
    const needed = durationSeconds - work;

    if (to === undefined) {
      // Nach dem letzten Ereignis läuft es mit dem dort gültigen Faktor weiter.
      finishMs = from + (needed / factor) * 1000;
      break;
    }

    const available = ((to - from) / 1000) * factor;
    if (available >= needed) {
      finishMs = from + (needed / factor) * 1000;
    } else {
      work += available;
    }
  }

  const computed = finishMs ?? startMs + durationSeconds * 1000;
  return earliestInstantMs !== null ? Math.min(computed, earliestInstantMs) : computed;
}

/** Höchster aktiver Faktor zum Zeitpunkt t. Booster stapeln sich nicht. */
function factorAt(speedups: readonly Speedup[], atMs: number): number {
  let factor = 1;
  for (const s of speedups) {
    if (atMs >= s.fromMs && atMs < s.toMs && s.factor > factor) factor = s.factor;
  }
  return factor;
}

export const boostService = {
  /** Alle Beschleuniger aus der Wissensdatenbank. */
  list(): readonly BoostDefinition[] {
    return boosts;
  },

  /** Nur die Mittel, die auf Kategorie und Dorf der Aufwertung wirken. */
  listForCategory(category: BuildCategory, village: Village): BoostDefinition[] {
    return boosts.filter(
      (b) => b.effect !== 'battle' && b.village === village && b.appliesTo.includes(category),
    );
  },

  get(id: string): BoostDefinition {
    const definition = byId.get(id);
    if (!definition) throw AppError.notFound(`Kein Beschleuniger mit der ID "${id}" hinterlegt.`);
    return definition;
  },

  /** Prüft, ob ein Mittel auf Kategorie und Dorf dieser Aufwertung passt. */
  assertApplicable(id: string, category: BuildCategory, village: Village): BoostDefinition {
    const definition = this.get(id);
    if (definition.effect === 'battle') {
      throw AppError.validation(
        `"${definition.name}" wirkt nur im Kampf und verkürzt keine Aufwertung.`,
      );
    }
    if (definition.village !== village) {
      const where = definition.village === 'builder' ? 'auf der Bauerbasis' : 'im Heimatdorf';
      throw AppError.validation(`"${definition.name}" wirkt nur ${where}.`);
    }
    if (!definition.appliesTo.includes(category)) {
      throw AppError.validation(
        `"${definition.name}" lässt sich nicht auf die Kategorie "${category}" anwenden.`,
      );
    }
    return definition;
  },
};
