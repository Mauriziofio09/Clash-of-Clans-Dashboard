import { ConfigError } from './utils/ConfigError.js';

/**
 * Einstiegspunkt. Die Konfiguration wird beim Import von ./app geladen; schlägt
 * das fehl, soll der Nutzer eine lesbare Anleitung statt eines Stacktrace sehen.
 */
async function main(): Promise<void> {
  const { config } = await import('./config/env.js');
  const { createApp } = await import('./app.js');

  const app = createApp();
  app.listen(config.port, () => {
    console.log('');
    console.log('  Clash of Clans Dashboard - Backend');
    console.log(`  API:              http://localhost:${config.port}/api`);
    console.log(`  Spieler-Tag:      ${config.playerTag}`);
    console.log(`  Clan-Tag:         ${config.clanTag || '(aus Spielerprofil)'}`);
    console.log(`  Cache-TTL:        ${config.cacheTtlSeconds}s`);
    console.log(`  Refresh-Vorgabe:  ${config.refreshIntervalSeconds}s`);
    console.log(`  Erlaubte Origins: ${config.corsOrigins.join(', ')}`);
    console.log('');
  });
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error('\n  Start abgebrochen - die Konfiguration ist unvollständig:\n');
    for (const problem of error.problems) console.error(`   - ${problem}`);
    console.error('\n  Vorlage kopieren:  cp .env.example .env\n');
    process.exit(1);
  }
  console.error('\n  Start fehlgeschlagen:\n', error);
  process.exit(1);
});
