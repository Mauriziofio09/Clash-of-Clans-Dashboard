/**
 * Basis-URL des eigenen Backends. Im Dev-Server leitet die Proxy-Konfiguration
 * (proxy.conf.json) /api an http://localhost:3000 weiter, deshalb reicht der
 * relative Pfad. Für einen abweichenden Port hier die volle URL eintragen.
 */
export const environment = {
  apiBaseUrl: '/api',
  /** Fallback, bis das Backend sein konfiguriertes Intervall gemeldet hat. */
  defaultRefreshSeconds: 300,
} as const;
