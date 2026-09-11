import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config/env.js';

/**
 * Lokale SQLite-Datenbank für alles, was die CoC API nicht liefert:
 * den manuellen Bau-Tracker und eigene Strategie-Notizen.
 */
function createDatabase(): Database.Database {
  fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });
  const db = new Database(config.databaseFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  addMissingColumns(db);
  return db;
}

/**
 * Nachträglich hinzugekommene Spalten ergänzen.
 *
 * CREATE TABLE IF NOT EXISTS lässt bestehende Tabellen unangetastet, deshalb
 * werden neue Spalten hier einzeln geprüft und angehängt.
 */
function addMissingColumns(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(builds)').all() as { name: string }[];
  const has = (name: string) => columns.some((column) => column.name === name);

  if (!has('village')) {
    db.exec("ALTER TABLE builds ADD COLUMN village TEXT NOT NULL DEFAULT 'home'");
  }
  // Verknüpfung zum Planer: welche Aufwertung steckt hinter diesem Eintrag?
  if (!has('target_kind')) db.exec('ALTER TABLE builds ADD COLUMN target_kind TEXT');
  if (!has('target_key')) db.exec('ALTER TABLE builds ADD COLUMN target_key TEXT');
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS builds (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL,
      category         TEXT    NOT NULL DEFAULT 'building',
      target_level     INTEGER,
      started_at       TEXT    NOT NULL,
      duration_seconds INTEGER NOT NULL,
      builder          TEXT,
      notes            TEXT,
      completed        INTEGER NOT NULL DEFAULT 0,
      acknowledged     INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT    NOT NULL,
      updated_at       TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_builds_completed ON builds(completed);

    -- Auf eine Aufwertung angewandte Beschleuniger (Tränke, Bücher, Hämmer,
    -- Edelstein-Freikauf). Mehrere je Aufwertung sind erlaubt.
    CREATE TABLE IF NOT EXISTS build_boosts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      build_id       INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
      boost_id       TEXT    NOT NULL,
      applied_at     TEXT    NOT NULL,
      amount_seconds INTEGER,
      created_at     TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_build_boosts_build ON build_boosts(build_id);

    CREATE TABLE IF NOT EXISTS strategy_notes (
      strategy_id TEXT PRIMARY KEY,
      note        TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    -- Manuell gepflegter Gebäudebestand. Je Gebäudetyp steht, wie viele
    -- Exemplare auf welchem Level stehen. Die CoC API liefert das nicht.
    CREATE TABLE IF NOT EXISTS building_inventory (
      building_id TEXT    NOT NULL,
      level       INTEGER NOT NULL,
      count       INTEGER NOT NULL,
      PRIMARY KEY (building_id, level)
    );

    -- Annahmen des Planers, als Schlüssel-Wert-Paare, damit neue Annahmen
    -- ohne Migration dazukommen können.
    CREATE TABLE IF NOT EXISTS planner_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Von Hand korrigierte Aufwertungszeiten. Sie haben immer Vorrang vor der
    -- Näherungskurve aus upgradeTimes.json.
    CREATE TABLE IF NOT EXISTS time_overrides (
      scope      TEXT    NOT NULL,
      key        TEXT    NOT NULL,
      level      INTEGER NOT NULL,
      seconds    INTEGER NOT NULL,
      updated_at TEXT    NOT NULL,
      PRIMARY KEY (scope, key, level)
    );

    CREATE TABLE IF NOT EXISTS trophy_history (
      recorded_at TEXT PRIMARY KEY,
      trophies    INTEGER NOT NULL,
      town_hall   INTEGER NOT NULL,
      war_stars   INTEGER NOT NULL,
      exp_level   INTEGER NOT NULL
    );
  `);
}

export const db: Database.Database = createDatabase();
