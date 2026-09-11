/**
 * Fehler beim Laden der .env.
 *
 * Bewusst in einem eigenen Modul ohne Seiteneffekte: index.ts muss den Typ
 * importieren können, ohne dabei schon die Konfiguration zu laden.
 */
export class ConfigError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(`Ungültige Konfiguration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}
