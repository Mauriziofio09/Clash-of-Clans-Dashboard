import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/database.js';
import { AppError } from '../utils/AppError.js';
import type { CocPlayer, CocPlayerItem } from '../models/coc.types.js';
import type {
  RequirementCheck,
  StrategyAdvice,
  StrategyNote,
  StrategyFocus,
  StrategyRequirement,
  StrategyRule,
  StrategySuggestion,
} from '../models/domain.types.js';

interface StrategyFile {
  meta: Record<string, unknown>;
  strategies: StrategyRule[];
}

const here = path.dirname(fileURLToPath(import.meta.url));

function loadStrategies(): StrategyRule[] {
  const candidates = [
    path.resolve(here, '../data/strategies.json'),
    path.resolve(here, '../../src/data/strategies.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as StrategyFile;
      // Farm- und Kriegsarmeen verfolgen verschiedene Ziele und werden deshalb
      // getrennt bewertet. Steht kein focus in der JSON, entscheiden die Tags.
      return parsed.strategies.map((rule) => ({
        ...rule,
        focus: rule.focus ?? (rule.tags.includes('farmen') ? 'farmen' : 'krieg'),
      }));
    }
  }
  throw new Error(`strategies.json nicht gefunden. Gesucht in: ${candidates.join(', ')}`);
}

const strategies: readonly StrategyRule[] = loadStrategies();

/** Gewichtung der einzelnen Anforderungsblöcke in der Gesamtpunktzahl. */
const WEIGHTS = { troops: 0.45, spells: 0.25, heroes: 0.2, sieges: 0.1 } as const;

/** Ab diesem Wert gilt eine Strategie als empfehlenswert. */
const SCORE_THRESHOLD = 45;

function levelIndex(items: CocPlayerItem[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items ?? []) {
    if (item.village !== 'home') continue;
    // Bei doppelten Namen (Heimat/Bauerbasis) gewinnt das höhere Level.
    map.set(item.name, Math.max(map.get(item.name) ?? 0, item.level));
  }
  return map;
}

function check(requirements: StrategyRequirement[], owned: Map<string, number>): RequirementCheck[] {
  return requirements.map((req) => {
    const actual = owned.get(req.name) ?? 0;
    return {
      name: req.name,
      required: req.minLevel,
      actual,
      met: actual >= req.minLevel,
      optional: req.optional === true,
      count: req.count ?? null,
    };
  });
}

/**
 * Punktzahl eines Anforderungsblocks (0-1).
 *
 * Erfüllte Pflichtanforderungen zählen voll. Fehlende Pflichteinheiten schlagen
 * hart durch, unterlevelte werden anteilig gewertet, optionale nur schwach.
 */
function scoreBlock(checks: RequirementCheck[]): number {
  if (checks.length === 0) return 1;

  let earned = 0;
  let total = 0;
  for (const c of checks) {
    const weight = c.optional ? 0.3 : 1;
    total += weight;
    if (c.met) {
      earned += weight;
    } else if (c.actual > 0 && c.required > 0) {
      // Teilpunkte für vorhandene, aber zu niedrige Einheiten.
      earned += weight * Math.min(1, c.actual / c.required) * 0.6;
    }
  }
  return total > 0 ? earned / total : 1;
}

const selectNote = db.prepare<[string], { strategy_id: string; note: string; updated_at: string }>(
  'SELECT * FROM strategy_notes WHERE strategy_id = ?',
);
const selectAllNotes = db.prepare<[], { strategy_id: string; note: string; updated_at: string }>(
  'SELECT * FROM strategy_notes ORDER BY updated_at DESC',
);
const upsertNote = db.prepare(`
  INSERT INTO strategy_notes (strategy_id, note, updated_at) VALUES (@id, @note, @now)
  ON CONFLICT(strategy_id) DO UPDATE SET note = @note, updated_at = @now
`);
const deleteNote = db.prepare('DELETE FROM strategy_notes WHERE strategy_id = ?');

export const strategyService = {
  /** Alle hinterlegten Regeln, ohne Bewertung - für eine Übersichtsseite. */
  listRules(): readonly StrategyRule[] {
    return strategies;
  },

  /**
   * Bewertet alle zum Rathaus passenden Strategien gegen den aktuellen Account
   * und liefert die besten Vorschläge zurück.
   */
  advise(player: CocPlayer, limit = 3, focus: StrategyFocus | 'alle' = 'krieg'): StrategyAdvice {
    const th = player.townHallLevel;
    const troops = levelIndex(player.troops);
    const spells = levelIndex(player.spells);
    const heroes = levelIndex(player.heroes);
    // Belagerungsmaschinen liefert die API im troops-Array mit.
    const sieges = troops;

    const scored = strategies
      .filter((rule) => th >= rule.minTownHall && th <= rule.maxTownHall)
      .filter((rule) => focus === 'alle' || rule.focus === focus)
      .map((rule) => {
        const requirements = {
          troops: check(rule.troops, troops),
          spells: check(rule.spells, spells),
          heroes: check(rule.heroes, heroes),
          sieges: check(rule.sieges, sieges),
        };

        const raw =
          scoreBlock(requirements.troops) * WEIGHTS.troops +
          scoreBlock(requirements.spells) * WEIGHTS.spells +
          scoreBlock(requirements.heroes) * WEIGHTS.heroes +
          scoreBlock(requirements.sieges) * WEIGHTS.sieges;

        const all = [
          ...requirements.troops,
          ...requirements.spells,
          ...requirements.heroes,
          ...requirements.sieges,
        ];

        const { troops: _t, spells: _s, sieges: _si, heroes: _h, ...meta } = rule;

        const suggestion: StrategySuggestion = {
          rule: meta,
          score: Math.round(raw * 100),
          requirements,
          missing: all.filter((c) => !c.met && c.actual === 0 && !c.optional).map((c) => c.name),
          underleveled: all
            .filter((c) => !c.met && c.actual > 0 && !c.optional)
            .map((c) => `${c.name} (Lvl ${c.actual}/${c.required})`),
          note: selectNote.get(rule.id)?.note ?? null,
        };
        return suggestion;
      })
      .sort((a, b) => b.score - a.score);

    const good = scored.filter((s) => s.score >= SCORE_THRESHOLD);
    // Wenn nichts die Schwelle erreicht, trotzdem die besten Treffer anzeigen.
    const suggestions = (good.length > 0 ? good : scored).slice(0, limit);
    const shownIds = new Set(suggestions.map((s) => s.rule.id));

    return {
      townHallLevel: th,
      focus,
      suggestions,
      alsoConsidered: scored
        .filter((s) => !shownIds.has(s.rule.id))
        .map((s) => ({ id: s.rule.id, name: s.rule.name, score: s.score })),
    };
  },

  listNotes(): StrategyNote[] {
    return selectAllNotes.all().map((row) => ({
      strategyId: row.strategy_id,
      note: row.note,
      updatedAt: row.updated_at,
    }));
  },

  saveNote(strategyId: string, body: unknown): StrategyNote {
    if (!strategies.some((s) => s.id === strategyId)) {
      throw AppError.notFound(`Keine Strategie mit der ID "${strategyId}" hinterlegt.`);
    }
    const raw = (body ?? {}) as Record<string, unknown>;
    const note = typeof raw['note'] === 'string' ? raw['note'].trim() : '';
    if (note.length > 2000) {
      throw AppError.validation('Die Notiz darf höchstens 2000 Zeichen lang sein.');
    }

    const now = new Date().toISOString();
    if (note === '') {
      deleteNote.run(strategyId);
      return { strategyId, note: '', updatedAt: now };
    }

    upsertNote.run({ id: strategyId, note, now });
    return { strategyId, note, updatedAt: now };
  },
};
