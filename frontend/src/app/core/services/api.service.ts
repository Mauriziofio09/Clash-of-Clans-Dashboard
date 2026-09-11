import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiEnvelope, ApiError } from '../models/api.models';

/** Antwortform des Backends im Fehlerfall. */
interface BackendErrorBody {
  error?: { code?: string; message?: string; hint?: string };
}

/**
 * Dünner HTTP-Wrapper um das eigene Backend.
 *
 * Er packt den Envelope aus und übersetzt jeden Fehler in ein ApiError-Objekt,
 * damit die Komponenten nur noch eine einzige Fehlerform kennen müssen.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** Liefert nur die Nutzdaten. */
  get<T>(path: string): Observable<T> {
    return this.getEnvelope<T>(path).pipe(map((envelope) => envelope.data));
  }

  /** Liefert Nutzdaten samt Abrufzeitpunkt und Cache-Kennzeichen. */
  getEnvelope<T>(path: string): Observable<ApiEnvelope<T>> {
    return this.http.get<ApiEnvelope<T>>(`${this.base}${path}`).pipe(catchError(toApiError));
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http
      .post<ApiEnvelope<T>>(`${this.base}${path}`, body)
      .pipe(map((envelope) => envelope.data), catchError(toApiError));
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .put<ApiEnvelope<T>>(`${this.base}${path}`, body)
      .pipe(map((envelope) => envelope.data), catchError(toApiError));
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .patch<ApiEnvelope<T>>(`${this.base}${path}`, body)
      .pipe(map((envelope) => envelope.data), catchError(toApiError));
  }

  /** Wie delete(), gibt aber die Nutzdaten der Antwort zurück. */
  deleteFor<T>(path: string): Observable<T> {
    return this.http
      .delete<ApiEnvelope<T>>(`${this.base}${path}`)
      .pipe(map((envelope) => envelope.data), catchError(toApiError));
  }

  delete(path: string): Observable<void> {
    return this.http.delete<void>(`${this.base}${path}`).pipe(
      map(() => undefined),
      catchError(toApiError),
    );
  }
}

/** Übersetzt HttpErrorResponse in die einheitliche ApiError-Form. */
function toApiError(error: unknown): Observable<never> {
  if (!(error instanceof HttpErrorResponse)) {
    return throwError(() => normalize('INTERNAL', 'Unerwarteter Fehler im Frontend.'));
  }

  // status 0 bedeutet: gar keine Antwort - das Backend läuft vermutlich nicht.
  if (error.status === 0) {
    return throwError(() =>
      normalize(
        'BACKEND_OFFLINE',
        'Das Backend ist nicht erreichbar.',
        'Im Ordner backend "npm run dev" starten und prüfen, ob Port 3000 frei ist.',
      ),
    );
  }

  const body = error.error as BackendErrorBody | string | null;
  if (body && typeof body === 'object' && body.error) {
    return throwError(() =>
      normalize(
        body.error?.code ?? 'INTERNAL',
        body.error?.message ?? 'Unbekannter Fehler.',
        body.error?.hint,
      ),
    );
  }

  return throwError(() =>
    normalize('INTERNAL', `Backend antwortete mit HTTP ${error.status}.`, error.statusText),
  );
}

const KNOWN_CODES = new Set<string>([
  'CONFIG_MISSING', 'INVALID_API_KEY', 'IP_NOT_WHITELISTED', 'NOT_FOUND', 'RATE_LIMITED',
  'COC_MAINTENANCE', 'COC_TIMEOUT', 'COC_UNAVAILABLE', 'VALIDATION', 'INTERNAL', 'BACKEND_OFFLINE',
]);

function normalize(code: string, message: string, hint?: string): ApiError {
  return {
    code: (KNOWN_CODES.has(code) ? code : 'INTERNAL') as ApiError['code'],
    message,
    ...(hint ? { hint } : {}),
  };
}
