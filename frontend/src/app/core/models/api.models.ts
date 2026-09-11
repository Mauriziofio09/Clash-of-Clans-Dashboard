/**
 * Spiegelbild der Backend-Typen. Das Frontend spricht ausschließlich mit dem
 * eigenen Express-Server, nie direkt mit der Clash-of-Clans-API.
 */

export interface ApiEnvelope<T> {
  data: T;
  fetchedAt: string;
  cached: boolean;
}

export type ApiErrorCode =
  | 'CONFIG_MISSING'
  | 'INVALID_API_KEY'
  | 'IP_NOT_WHITELISTED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'COC_MAINTENANCE'
  | 'COC_TIMEOUT'
  | 'COC_UNAVAILABLE'
  | 'VALIDATION'
  | 'INTERNAL'
  | 'BACKEND_OFFLINE';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  hint?: string;
}

/** Zustand einer geladenen Ressource - reicht für Ladeindikator und Fehleranzeige. */
export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  fetchedAt: string | null;
  cached: boolean;
}

export function idleResource<T>(): Resource<T> {
  return { data: null, loading: false, error: null, fetchedAt: null, cached: false };
}
