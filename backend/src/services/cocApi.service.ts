import { config } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import type { CocClan, CocCurrentWar, CocPlayer } from '../models/coc.types.js';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
  fetchedAt: string;
}

interface CocErrorBody {
  reason?: string;
  message?: string;
}

/**
 * Schmaler Client für die offizielle Clash-of-Clans-API.
 *
 * Nur dieses Modul kennt den API-Key. Alle Fehler der Gegenstelle werden in
 * AppError mit sprechendem Code übersetzt, damit das Frontend dem Nutzer sagen
 * kann, was zu tun ist (z. B. IP im Developer-Portal nachtragen).
 */
export class CocApiService {
  private readonly cache = new Map<string, CacheEntry>();

  /** Letzter erfolgreicher Kontakt zur CoC API - für den Health-Endpunkt. */
  private lastSuccessAt: string | null = null;
  private lastError: AppError | null = null;

  async getPlayer(tag: string): Promise<{ data: CocPlayer; fetchedAt: string; cached: boolean }> {
    return this.get<CocPlayer>(`/players/${encodeURIComponent(tag)}`);
  }

  async getClan(tag: string): Promise<{ data: CocClan; fetchedAt: string; cached: boolean }> {
    return this.get<CocClan>(`/clans/${encodeURIComponent(tag)}`);
  }

  async getCurrentWar(clanTag: string): Promise<{ data: CocCurrentWar; fetchedAt: string; cached: boolean }> {
    return this.get<CocCurrentWar>(`/clans/${encodeURIComponent(clanTag)}/currentwar`);
  }

  /** Leert den Kurzzeit-Cache, z. B. bei einem manuellen Refresh aus dem UI. */
  clearCache(): void {
    this.cache.clear();
  }

  getHealthSnapshot(): { reachable: boolean; lastSuccessAt: string | null; lastError: AppError | null } {
    return {
      reachable: this.lastError === null,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
    };
  }

  private async get<T>(path: string): Promise<{ data: T; fetchedAt: string; cached: boolean }> {
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      return { data: cached.value as T, fetchedAt: cached.fetchedAt, cached: true };
    }

    const response = await this.request(path);
    const fetchedAt = new Date().toISOString();
    const data = (await response.json()) as T;

    this.cache.set(path, {
      value: data,
      expiresAt: Date.now() + config.cacheTtlSeconds * 1000,
      fetchedAt,
    });

    this.lastSuccessAt = fetchedAt;
    this.lastError = null;
    return { data, fetchedAt, cached: false };
  }

  private async request(path: string): Promise<Response> {
    const url = `${config.cocBaseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.cocTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.cocApiKey}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (cause) {
      const error =
        cause instanceof Error && cause.name === 'AbortError'
          ? new AppError(
              'COC_TIMEOUT',
              504,
              `Die Clash-of-Clans-API hat nicht innerhalb von ${config.cocTimeoutMs} ms geantwortet.`,
              'Netzwerkverbindung prüfen oder COC_TIMEOUT_MS in der .env erhöhen.',
            )
          : new AppError(
              'COC_UNAVAILABLE',
              502,
              'Die Clash-of-Clans-API ist nicht erreichbar.',
              cause instanceof Error ? cause.message : undefined,
            );
      this.lastError = error;
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const error = await this.toAppError(response);
      this.lastError = error;
      throw error;
    }

    return response;
  }

  private async toAppError(response: Response): Promise<AppError> {
    let body: CocErrorBody = {};
    try {
      body = (await response.json()) as CocErrorBody;
    } catch {
      // Antwort war kein JSON - Statuscode reicht für die Zuordnung.
    }

    const reason = body.reason ?? '';
    const detail = body.message ?? '';

    if (response.status === 403) {
      // Die API unterscheidet ungültigen Key und nicht freigeschaltete IP nur über den Text.
      const looksLikeIpProblem = /ip/i.test(detail) || reason === 'accessDenied.invalidIp';
      if (looksLikeIpProblem) {
        const currentIp = extractIp(detail);
        return new AppError(
          'IP_NOT_WHITELISTED',
          403,
          'Die IP-Adresse dieses Rechners ist für den API-Key nicht freigegeben.',
          `Auf developer.clashofclans.com einloggen, den Key bearbeiten und die aktuelle IP${
            currentIp ? ` (${currentIp})` : ''
          } als erlaubte IP eintragen. Nach jedem Wechsel des WLANs ändert sich die IP.`,
        );
      }
      return new AppError(
        'INVALID_API_KEY',
        403,
        'Der Clash-of-Clans-API-Key wurde abgelehnt.',
        'COC_API_KEY in backend/.env prüfen. Der Key muss der vollständige JWT aus dem Developer-Portal sein.',
      );
    }

    if (response.status === 401) {
      return new AppError(
        'INVALID_API_KEY',
        401,
        'Der Clash-of-Clans-API-Key ist ungültig oder abgelaufen.',
        'Neuen Key unter https://developer.clashofclans.com/ erzeugen und in backend/.env eintragen.',
      );
    }

    if (response.status === 404) {
      return new AppError(
        'NOT_FOUND',
        404,
        'Der angefragte Tag existiert nicht.',
        'Spieler- bzw. Clan-Tag in backend/.env prüfen. Tags enthalten Nullen, nie den Buchstaben O.',
      );
    }

    if (response.status === 429) {
      return new AppError(
        'RATE_LIMITED',
        429,
        'Zu viele Anfragen an die Clash-of-Clans-API.',
        'Auto-Refresh-Intervall erhöhen oder CACHE_TTL_SECONDS in der .env anheben.',
      );
    }

    if (response.status === 503) {
      return new AppError(
        'COC_MAINTENANCE',
        503,
        'Clash of Clans ist gerade in Wartung. Die API liefert währenddessen keine Daten.',
        'Nach Ende der Wartungsarbeiten erneut versuchen.',
      );
    }

    return new AppError(
      'COC_UNAVAILABLE',
      502,
      `Unerwartete Antwort der Clash-of-Clans-API (HTTP ${response.status}).`,
      detail || reason || undefined,
    );
  }
}

/** Zieht eine IPv4/IPv6-Adresse aus der Fehlermeldung der CoC API, falls vorhanden. */
function extractIp(message: string): string | null {
  const match = /(\d{1,3}(?:\.\d{1,3}){3})|([0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7})/i.exec(message);
  return match ? match[0] : null;
}

export const cocApiService = new CocApiService();
